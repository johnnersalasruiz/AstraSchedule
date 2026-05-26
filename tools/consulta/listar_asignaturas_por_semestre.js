// tools/consulta/listar_asignaturas_por_semestre.js
import { pool } from '../../scripts/db.js';

/**
 * Lista las asignaturas (materias) de Ingeniería de Sistemas filtradas por semestre(s).
 * 
 * @param {Object} params
 * @param {number|number[]} params.semestre - Número de semestre o array de semestres (1-10).
 * @param {boolean} [params.solo_activas=true] - Si es true, solo muestra materias activas.
 * @returns {Promise<Array>} Lista de asignaturas con sus detalles.
 */
export async function listar_asignaturas_por_semestre({ semestre, solo_activas = true }) {
    // Validaciones
    if (semestre === undefined || semestre === null) {
        throw new Error('El parámetro "semestre" es obligatorio');
    }
    
    // Normalizar semestre
    let semestreArray;
    if (Array.isArray(semestre)) {
        semestreArray = semestre;
    } else if (typeof semestre === 'number') {
        semestreArray = [semestre];
    } else {
        throw new Error('El parámetro "semestre" debe ser un número o un array de números');
    }
    
    // Validar semestres (IS tiene 10 semestres)
    if (!semestreArray.every(s => Number.isInteger(s) && s >= 1 && s <= 10)) {
        throw new Error('Los semestres deben ser números enteros entre 1 y 10');
    }

    try {
        const query = `
            SELECT 
                m.id,
                m.codigo,
                m.nombre,
                m.semestre,
                m.creditos,
                m.horas_semana,
                m.tipo_aula_requerida,
                (
                    SELECT json_agg(json_build_object(
                        'id', pr.prerequisito_id,
                        'codigo', m_pre.codigo,
                        'nombre', m_pre.nombre
                    ))
                    FROM prerequisitos pr
                    JOIN materias m_pre ON m_pre.id = pr.prerequisito_id
                    WHERE pr.materia_id = m.id
                ) AS prerequisitos
            FROM materias m
            JOIN programas p ON p.id = m.programa_id
            WHERE p.codigo = 'IS'
              AND m.semestre = ANY($1::int[])
              ${solo_activas ? 'AND m.activa = true' : ''}
            ORDER BY m.semestre ASC, m.codigo ASC
        `;
        
        const result = await pool.query(query, [semestreArray]);
        
        const asignaturas = result.rows.map(row => ({
            ...row,
            prerequisitos: row.prerequisitos || [],
            tiene_prerequisitos: (row.prerequisitos || []).length > 0,
            horas_por_bloque: Math.ceil(row.horas_semana / 3),
            tipo_aula_requerida: row.tipo_aula_requerida
        }));
        
        return {
            programa: 'IS',
            programa_nombre: 'Ingeniería de Sistemas',
            semestres_consultados: semestreArray,
            total_materias: asignaturas.length,
            materias: asignaturas
        };
    } catch (error) {
        console.error('Error en listar_asignaturas_por_semestre:', error);
        throw new Error(`Error al listar asignaturas: ${error.message}`);
    }
}