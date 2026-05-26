// tools/consulta/obtener_docentes_disponibles.js
import { pool } from '../../scripts/db.js';

/**
 * Obtiene una lista de docentes disponibles en una franja horaria específica,
 * que cumplan con la jornada requerida y opcionalmente excluyendo algunos IDs.
 *
 * @param {Object} params
 * @param {number} params.franja_id - ID de la franja horaria a consultar.
 * @param {string} params.jornada - Jornada requerida ('diurna', 'nocturna').
 * @param {number[]} [params.excluir_docentes=[]] - Lista opcional de IDs de docentes a excluir.
 * @returns {Promise<Array>} Lista de docentes disponibles con sus detalles.
 */
export async function obtener_docentes_disponibles({ franja_id, jornada, excluir_docentes = [] }) {
    // 1. Validaciones básicas
    if (!franja_id || typeof franja_id !== 'number') {
        throw new Error('El parámetro "franja_id" es obligatorio y debe ser un número');
    }
    if (!jornada || typeof jornada !== 'string') {
        throw new Error('El parámetro "jornada" es obligatorio y debe ser un texto');
    }
    
    const jornadaLower = jornada.toLowerCase();
    if (jornadaLower !== 'diurna' && jornadaLower !== 'nocturna') {
        throw new Error('El parámetro "jornada" debe ser "diurna" o "nocturna"');
    }

    // 2. Construir la consulta SQL
    // La lógica es: buscar docentes que:
    //    - Estén activos (activo = true)
    //    - Su disponibilidad coincida con la jornada ('Diurna', 'Nocturna', o 'Ambas')
    //    - Tengan disponibilidad registrada en la franja_id específica (tabla disponibilidad_docente)
    //    - No estén en la lista de exclusión (si se provee)
    let query = `
        SELECT 
            d.id,
            d.identificacion,
            d.nombre,
            d.email,
            d.tipo,
            d.carga_max_horas,
            d.disponibilidad,
            COALESCE(SUM(EXTRACT(EPOCH FROM (b.hora_fin - b.hora_inicio))/3600), 0) AS horas_asignadas
        FROM docentes d
        LEFT JOIN horario_asignado ha ON ha.docente_id = d.id AND ha.estado != 'cancelado'
        LEFT JOIN franjas_horarias f ON f.id = ha.franja_id
        LEFT JOIN bloques_horarios b ON b.id = f.bloque_id
        WHERE d.activo = true
          AND (
              d.disponibilidad = 'Ambas' 
              OR LOWER(d.disponibilidad) = $1
          )
          AND EXISTS (
              SELECT 1 
              FROM disponibilidad_docente dd 
              WHERE dd.docente_id = d.id AND dd.franja_id = $2
          )
    `;

    const queryParams = [jornadaLower, franja_id];
    let paramIndex = 3;

    // Excluir docentes específicos si se solicita
    if (excluir_docentes && excluir_docentes.length > 0) {
        const placeholders = excluir_docentes.map((_, idx) => `$${paramIndex + idx}`).join(',');
        query += ` AND d.id NOT IN (${placeholders})`;
        queryParams.push(...excluir_docentes);
        paramIndex += excluir_docentes.length;
    }

    // Agrupar por docente para calcular horas asignadas correctamente
    query += `
        GROUP BY d.id, d.identificacion, d.nombre, d.email, d.tipo, d.carga_max_horas, d.disponibilidad
        ORDER BY d.nombre ASC
    `;

    // 3. Ejecutar la consulta
    try {
        const result = await pool.query(query, queryParams);
        
        // Enriquecer los resultados con información de carga
        const docentes = result.rows.map(docente => ({
            ...docente,
            horas_asignadas: parseFloat(docente.horas_asignadas) || 0,
            horas_disponibles: docente.carga_max_horas - (parseFloat(docente.horas_asignadas) || 0),
            puede_asignarse: (docente.carga_max_horas - (parseFloat(docente.horas_asignadas) || 0)) >= 3 // al menos 3h disponibles
        }));
        
        return docentes;
    } catch (error) {
        console.error('Error en obtener_docentes_disponibles:', error);
        throw new Error(`Error al consultar docentes disponibles: ${error.message}`);
    }
}