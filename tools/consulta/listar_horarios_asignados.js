import { pool } from '../../scripts/db.js';

/**
 * Lista los horarios asignados (propuestos, confirmados, conflicto) para un programa, jornada, modalidad y sede.
 * @param {Object} params
 * @param {string} params.programa_id - Código del programa ('IS' o 'IE')
 * @param {string} params.jornada - 'Diurna' o 'Nocturna'
 * @param {string} params.modalidad - 'presencial' o 'virtual'
 * @param {string|null} [params.sede=null] - Código de sede (obligatorio si modalidad=presencial)
 * @param {string} [params.estado='propuesto'] - Filtro opcional por estado ('propuesto', 'confirmado', 'conflicto', 'todos')
 * @returns {Promise<Array>} Lista de horarios con detalles del grupo, docente, aula, franja.
 */
export async function listar_horarios_asignados({ programa_id, jornada, modalidad, sede = null, estado = 'propuesto' }) {
    if (!programa_id || !jornada || !modalidad) {
        throw new Error('Faltan parámetros obligatorios: programa_id, jornada, modalidad');
    }
    if (modalidad === 'presencial' && !sede) {
        throw new Error('Para modalidad presencial, sede es obligatoria');
    }
    if (modalidad === 'virtual') {
        sede = null;
    }

    let estadoCondition = '';
    if (estado !== 'todos') {
        estadoCondition = `AND h.estado = $5`;
    }

    const query = `
    SELECT 
      g.id AS grupo_id,
      m.codigo AS materia_codigo,
      m.nombre AS materia_nombre,
      g.numero AS grupo_numero,
      d.nombre AS docente_nombre,
      s.codigo AS salon_codigo,
      f.dia,
      b.hora_inicio,
      b.hora_fin,
      h.estado
    FROM horario_asignado h
    JOIN grupos g ON g.id = h.grupo_id
    JOIN materias m ON m.id = g.materia_id
    JOIN docentes d ON d.id = h.docente_id
    JOIN salones s ON s.id = h.salon_id
    JOIN franjas_horarias f ON f.id = h.franja_id
    JOIN bloques_horarios b ON b.id = f.bloque_id
    JOIN jornadas j ON j.id = g.jornada_id
    LEFT JOIN sedes se ON se.id = g.sede_id
    WHERE m.programa_id = (SELECT id FROM programas WHERE codigo = $1)
      AND j.codigo ILIKE $2
      AND g.modalidad = $3
      AND ($4::text IS NULL OR se.codigo ILIKE $4::text)
      ${estadoCondition}
    ORDER BY f.id, g.id
  `;

    const values = [programa_id, jornada, modalidad, sede];
    if (estado !== 'todos') values.push(estado);
    const result = await pool.query(query, values);
    return result.rows;
}