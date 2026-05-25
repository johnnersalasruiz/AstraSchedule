// tools/gestion/solicitar_aprobacion.js
import { pool } from '../../scripts/db.js';

export async function solicitar_aprobacion({ horario_id, comentarios = null }) {
    if (!horario_id || typeof horario_id !== 'number') {
        throw new Error('El parámetro "horario_id" es obligatorio y debe ser un número');
    }

    try {
        // Verificar que el horario existe
        const horarioRes = await pool.query(`
            SELECT ha.id, ha.estado, g.numero AS grupo_numero, m.codigo AS materia_codigo, 
                   m.nombre AS materia_nombre, d.nombre AS docente_nombre, s.codigo AS salon_codigo,
                   f.dia, b.codigo AS bloque, b.hora_inicio, b.hora_fin
            FROM horario_asignado ha
            JOIN grupos g ON g.id = ha.grupo_id
            JOIN materias m ON m.id = g.materia_id
            JOIN docentes d ON d.id = ha.docente_id
            JOIN salones s ON s.id = ha.salon_id
            JOIN franjas_horarias f ON f.id = ha.franja_id
            JOIN bloques_horarios b ON b.id = f.bloque_id
            WHERE ha.id = $1
        `, [horario_id]);

        if (horarioRes.rows.length === 0) {
            throw new Error(`No existe un horario asignado con ID ${horario_id}`);
        }

        const h = horarioRes.rows[0];

        // Validar estado
        if (!['propuesto', 'confirmado'].includes(h.estado)) {
            throw new Error(`No se puede solicitar aprobación para un horario en estado "${h.estado}"`);
        }

        // Registrar solicitud
        await pool.query(`
            INSERT INTO conflictos_detectados (tipo, descripcion, horario_id)
            VALUES ('docente_solapado', $1, $2)
        `, [`SOLICITUD_APROBACION: ${h.materia_codigo} - Grupo ${h.grupo_numero} - Docente: ${h.docente_nombre} - ${h.dia} ${h.bloque}${comentarios ? ` - ${comentarios}` : ''}`, horario_id]);

        console.log(`📧 Solicitud de aprobación enviada al director para: ${h.materia_codigo} - Grupo ${h.grupo_numero}`);

        return {
            success: true,
            horario_id: horario_id,
            estado_actual: h.estado,
            mensaje: `Solicitud de aprobación enviada al director para el horario ID ${horario_id}`
        };
    } catch (error) {
        if (error.code === 'P0001') {
            throw new Error(`Error en solicitud: ${error.message}`);
        }
        throw error;
    }
}