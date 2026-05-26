// tools/consulta/obtener_aulas_disponibles.js
import { pool } from '../../scripts/db.js';

/**
 * Obtiene una lista de aulas disponibles en una franja horaria específica,
 * que cumplan con los requisitos de capacidad mínima y tipo de aula.
 *
 * @param {Object} params
 * @param {number} params.franja_id - ID de la franja horaria a consultar.
 * @param {number} params.cupo_minimo - Capacidad mínima que debe tener el aula.
 * @param {string} [params.tipo_aula='cualquiera'] - Tipo de aula requerido ('presencial', 'laboratorio', 'virtual', 'cualquiera').
 * @returns {Promise<Array>} Lista de aulas disponibles con sus detalles.
 */
export async function obtener_aulas_disponibles({ franja_id, cupo_minimo, tipo_aula = 'cualquiera' }) {
    // 1. Validaciones básicas
    if (!franja_id || typeof franja_id !== 'number') {
        throw new Error('El parámetro "franja_id" es obligatorio y debe ser un número');
    }
    if (!cupo_minimo || typeof cupo_minimo !== 'number' || cupo_minimo <= 0) {
        throw new Error('El parámetro "cupo_minimo" es obligatorio y debe ser un número positivo');
    }
    const tiposValidos = ['presencial', 'laboratorio', 'virtual', 'cualquiera'];
    if (!tiposValidos.includes(tipo_aula)) {
        throw new Error(`El parámetro "tipo_aula" debe ser uno de: ${tiposValidos.join(', ')}`);
    }

    // 2. Construir la consulta SQL
    // La lógica es: buscar aulas que:
    //    - Estén marcadas como disponibles (disponible = true)
    //    - Tengan capacidad >= cupo_minimo
    //    - Su tipo coincida con el requerido (o sea cualquier tipo si tipo_aula='cualquiera')
    //    - NO tengan una asignación activa (no cancelada) en la franja_id solicitada.
    let query = `
        SELECT
            s.id,
            s.codigo,
            s.tipo,
            s.capacidad,
            s.bloque,
            se.codigo AS sede_codigo,
            se.nombre AS sede_nombre
        FROM salones s
        JOIN sedes se ON se.id = s.sede_id
        WHERE s.disponible = true
          AND s.capacidad >= $1
    `;

    const queryParams = [cupo_minimo];
    let paramIndex = 2;

    if (tipo_aula !== 'cualquiera') {
        query += ` AND s.tipo = $${paramIndex}`;
        queryParams.push(tipo_aula);
        paramIndex++;
    }

    // Subconsulta para verificar que el aula NO esté ocupada en esa franja
    query += `
        AND NOT EXISTS (
            SELECT 1
            FROM horario_asignado ha
            WHERE ha.salon_id = s.id
              AND ha.franja_id = $${paramIndex}
              AND ha.estado != 'cancelado'
        )
        ORDER BY s.capacidad ASC, s.codigo ASC
    `;
    queryParams.push(franja_id);

    // 3. Ejecutar la consulta
    try {
        const result = await pool.query(query, queryParams);
        return result.rows;
    } catch (error) {
        console.error('Error en obtener_aulas_disponibles:', error);
        throw new Error(`Error al consultar aulas disponibles: ${error.message}`);
    }
}