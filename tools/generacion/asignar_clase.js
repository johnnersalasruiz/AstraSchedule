// tools/generacion/asignar_clase.js
import { pool } from '../../scripts/db.js';

export async function asignar_clase({ grupo_id, docente_id, aula_id, franja_id, es_definitiva = false }) {
    // Validar que la franja pertenezca al periodo activo
    const franjaValida = await pool.query(`
    SELECT 1 FROM franjas_horarias f
    JOIN periodos_academicos p ON p.id = f.periodo_id AND p.activo = true
    WHERE f.id = $1
  `, [franja_id]);
    if (franjaValida.rows.length === 0) {
        throw new Error('Franja horaria no válida o no pertenece al periodo activo');
    }

    const estado = es_definitiva ? 'confirmado' : 'propuesto';
    try {
        const result = await pool.query(`
      INSERT INTO horario_asignado (grupo_id, docente_id, salon_id, franja_id, estado)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, estado
    `, [grupo_id, docente_id, aula_id, franja_id, estado]);
        return {
            id: result.rows[0].id,
            estado: result.rows[0].estado,
            mensaje: 'Asignación registrada exitosamente'
        };
    } catch (error) {
        if (error.code === 'P0001') {
            throw new Error(`Conflicto de asignación: ${error.message}`);
        }
        throw error;
    }
}