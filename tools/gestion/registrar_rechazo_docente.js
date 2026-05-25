// tools/gestion/registrar_rechazo_docente.js
import { pool } from '../../scripts/db.js';

export async function registrar_rechazo_docente({ horario_id, motivo = null }) {
    if (!horario_id || typeof horario_id !== 'number') {
        throw new Error('El parámetro "horario_id" es obligatorio y debe ser un número');
    }

    try {
        // Verificar que el horario existe
        const horarioRes = await pool.query(`
            SELECT ha.id, ha.estado, ha.docente_id, ha.franja_id,
                   m.codigo AS materia_codigo, g.numero AS grupo_numero,
                   d.nombre AS docente_nombre
            FROM horario_asignado ha
            JOIN grupos g ON g.id = ha.grupo_id
            JOIN materias m ON m.id = g.materia_id
            JOIN docentes d ON d.id = ha.docente_id
            WHERE ha.id = $1
        `, [horario_id]);

        if (horarioRes.rows.length === 0) {
            throw new Error(`No existe un horario asignado con ID ${horario_id}`);
        }

        const h = horarioRes.rows[0];

        // Solo se puede rechazar si está en estado 'propuesto'
        if (h.estado !== 'propuesto') {
            throw new Error(`No se puede rechazar un horario en estado "${h.estado}"`);
        }

        // Cambiar estado a 'rechazado'
        await pool.query(`
            UPDATE horario_asignado 
            SET estado = 'cancelado', actualizado_en = NOW()
            WHERE id = $1
        `, [horario_id]);

        // Registrar el rechazo
        await pool.query(`
            INSERT INTO conflictos_detectados (tipo, descripcion, horario_id)
            VALUES ('docente_no_disponible', $1, $2)
        `, [`RECHAZO_DOCENTE: ${h.materia_codigo} - Grupo ${h.grupo_numero} - Docente: ${h.docente_nombre} rechazó la asignación${motivo ? ` - Motivo: ${motivo}` : ''}`, horario_id]);

        console.log(` Rechazo registrado: ${h.materia_codigo} - Grupo ${h.grupo_numero} - Docente: ${h.docente_nombre}`);

        return {
            success: true,
            horario_id: horario_id,
            estado_anterior: 'propuesto',
            estado_nuevo: 'cancelado',
            mensaje: `Rechazo registrado para el horario ID ${horario_id}`,
            docente: h.docente_nombre,
            materia: `${h.materia_codigo} - Grupo ${h.grupo_numero}`
        };
    } catch (error) {
        if (error.code === 'P0001') {
            throw new Error(`Error en rechazo: ${error.message}`);
        }
        throw error;
    }
}