// tools/consulta/verificar_disponibilidad_docente.js
import { pool } from '../../scripts/db.js';

export async function verificar_disponibilidad_docente({ docente_id, franja_id }) {
    if (!docente_id || typeof docente_id !== 'number') {
        throw new Error('El parámetro "docente_id" es obligatorio y debe ser un número');
    }
    if (!franja_id || typeof franja_id !== 'number') {
        throw new Error('El parámetro "franja_id" es obligatorio y debe ser un número');
    }

    try {
        const result = await pool.query(`
            SELECT EXISTS (
                SELECT 1 FROM disponibilidad_docente
                WHERE docente_id = $1 AND franja_id = $2
            ) AS disponible
        `, [docente_id, franja_id]);
        
        const disponible = result.rows[0].disponible;
        
        return {
            disponible,
            docente_id,
            franja_id,
            mensaje: disponible 
                ? `El docente ${docente_id} está disponible en la franja ${franja_id}`
                : `El docente ${docente_id} NO está disponible en la franja ${franja_id}`
        };
    } catch (error) {
        console.error('Error en verificar_disponibilidad_docente:', error);
        throw new Error(`Error al verificar disponibilidad del docente: ${error.message}`);
    }
}