// tools/consulta/obtener_carga_docente.js
import { pool } from '../../scripts/db.js';

/**
 * Obtiene la carga horaria actual de un docente en el periodo activo.
 * 
 * @param {Object} params
 * @param {number} params.docente_id - ID del docente.
 * @param {number} [params.periodo_id] - ID del periodo (opcional, usa el activo por defecto).
 * @returns {Promise<Object>} Objeto con la carga del docente.
 */
export async function obtener_carga_docente({ docente_id, periodo_id = null }) {
    // Validación
    if (!docente_id || typeof docente_id !== 'number') {
        throw new Error('El parámetro "docente_id" es obligatorio y debe ser un número');
    }

    try {
        // 1. Obtener el periodo activo si no se especifica
        let periodoActivoId = periodo_id;
        if (!periodoActivoId) {
            const periodoRes = await pool.query(`
                SELECT id FROM periodos_academicos WHERE activo = true LIMIT 1
            `);
            if (periodoRes.rows.length === 0) {
                throw new Error('No hay periodo académico activo');
            }
            periodoActivoId = periodoRes.rows[0].id;
        }

        // 2. Obtener información del docente
        const docenteRes = await pool.query(`
            SELECT id, nombre, tipo, carga_max_horas
            FROM docentes
            WHERE id = $1 AND activo = true
        `, [docente_id]);

        if (docenteRes.rows.length === 0) {
            throw new Error(`Docente con ID ${docente_id} no encontrado o inactivo`);
        }

        const docente = docenteRes.rows[0];

        // 3. Calcular horas asignadas en el periodo
        const cargaRes = await pool.query(`
            SELECT 
                COALESCE(SUM(EXTRACT(EPOCH FROM (b.hora_fin - b.hora_inicio))/3600), 0) AS horas_asignadas,
                COUNT(DISTINCT ha.id) AS numero_clases
            FROM horario_asignado ha
            JOIN franjas_horarias f ON f.id = ha.franja_id
            JOIN bloques_horarios b ON b.id = f.bloque_id
            WHERE ha.docente_id = $1
              AND ha.estado != 'cancelado'
              AND f.periodo_id = $2
        `, [docente_id, periodoActivoId]);

        const horas_asignadas = parseFloat(cargaRes.rows[0].horas_asignadas) || 0;
        const numero_clases = parseInt(cargaRes.rows[0].numero_clases) || 0;
        const horas_disponibles = docente.carga_max_horas - horas_asignadas;

        return {
            docente_id: docente.id,
            docente_nombre: docente.nombre,
            docente_tipo: docente.tipo,
            carga_max_horas: docente.carga_max_horas,
            horas_asignadas: horas_asignadas,
            horas_disponibles: horas_disponibles,
            numero_clases: numero_clases,
            periodo_id: periodoActivoId,
            puede_asignar_mas: horas_disponibles >= 3,
            porcentaje_uso: Math.round((horas_asignadas / docente.carga_max_horas) * 100)
        };
    } catch (error) {
        console.error('Error en obtener_carga_docente:', error);
        throw new Error(`Error al obtener carga del docente: ${error.message}`);
    }
}