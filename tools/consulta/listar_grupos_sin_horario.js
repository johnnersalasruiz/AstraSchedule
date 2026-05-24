// tools/consulta/listar_grupos_sin_horario.js
import { pool } from '../../scripts/db.js';

/**
 * Lista los grupos que aún no tienen horario asignado (estado abierto y sin registro en horario_asignado).
 * @param {Object} params
 * @param {string} params.programa_id - Código del programa ('IS' o 'IE').
 * @param {number|number[]} [params.semestre] - Número de semestre o array de semestres. Si no se provee, se toman todos (1..10).
 * @param {string} params.jornada - 'Diurna' o 'Nocturna'.
 * @param {string} params.modalidad - 'presencial' o 'virtual'.
 * @param {string|null} [params.sede=null] - Código de sede ('NORTE', 'SUR') obligatorio si modalidad = 'presencial'.
 * @returns {Promise<Array>} Lista de grupos sin horario.
 */
export async function listar_grupos_sin_horario({ programa_id, semestre, jornada, modalidad, sede = null }) {
    // Validaciones obligatorias
    if (!programa_id || !jornada || !modalidad) {
        throw new Error('Faltan parámetros obligatorios: programa_id, jornada y modalidad');
    }
    if (modalidad === 'presencial' && !sede) {
        throw new Error('Para modalidad presencial, sede es obligatoria');
    }
    if (modalidad === 'virtual') {
        sede = null; // Forzar sede nula para virtuales
    }

    // Normalizar semestre: puede ser número, array o undefined
    let semestreArray;
    if (semestre === undefined || semestre === null) {
        // Por defecto todos los semestres (asumiendo máximo 10, ajustable)
        semestreArray = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    } else if (Array.isArray(semestre)) {
        semestreArray = semestre;
    } else if (typeof semestre === 'number') {
        semestreArray = [semestre];
    } else {
        throw new Error('El parámetro "semestre" debe ser un número, un array de números, o estar ausente');
    }

    // Asegurar que todos los elementos sean números enteros
    if (!semestreArray.every(s => Number.isInteger(s) && s > 0)) {
        throw new Error('El parámetro "semestre" debe contener solo números enteros positivos');
    }

    const query = `
    SELECT g.id, m.codigo AS materia_codigo, m.nombre AS materia_nombre, g.numero, 
           j.codigo AS jornada, g.modalidad, COALESCE(s.codigo, 'virtual') AS sede, g.cupo_max
    FROM grupos g
    JOIN materias m ON m.id = g.materia_id
    JOIN jornadas j ON j.id = g.jornada_id
    LEFT JOIN sedes s ON s.id = g.sede_id
    WHERE m.programa_id = (SELECT id FROM programas WHERE codigo = $1)
      AND m.semestre = ANY($2::int[])
      AND j.codigo ILIKE $3
      AND g.modalidad = $4
      AND ($5::text IS NULL OR s.codigo ILIKE $5::text)
      AND g.estado = 'abierto'
      AND NOT EXISTS (SELECT 1 FROM horario_asignado h WHERE h.grupo_id = g.id AND h.estado <> 'cancelado')
    ORDER BY m.semestre, m.codigo, g.numero
  `;

    const values = [programa_id, semestreArray, jornada, modalidad, sede];
    const result = await pool.query(query, values);
    return result.rows;
}