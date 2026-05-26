// tools/gestion/aprobar_horario.js
import { pool } from '../../scripts/db.js';

export async function aprobar_horario({ horario_id, comentarios = null }) {
    if (!horario_id || typeof horario_id !== 'number') {
        throw new Error('El parámetro "horario_id" es obligatorio y debe ser un número');
    }

    try {
        // Verificar que el horario existe y está en estado 'propuesto'
        const horarioRes = await pool.query(`
            SELECT ha.id, ha.estado, ha.grupo_id, ha.docente_id, ha.franja_id,
                   g.numero AS grupo_numero, m.codigo AS materia_codigo, m.nombre AS materia_nombre,
                   d.nombre AS docente_nombre, s.codigo AS salon_codigo,
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

        // Solo se pueden aprobar horarios en estado 'propuesto'
        if (h.estado !== 'propuesto') {
            throw new Error(`No se puede aprobar un horario en estado "${h.estado}". Solo se pueden aprobar horarios en estado "propuesto"`);
        }

        // Cambiar estado a 'confirmado'
        await pool.query(`
            UPDATE horario_asignado 
            SET estado = 'confirmado', actualizado_en = NOW()
            WHERE id = $1
        `, [horario_id]);

        // Registrar en conflictos_detectados
        await pool.query(`
            INSERT INTO conflictos_detectados (tipo, descripcion, horario_id)
            VALUES ('docente_solapado', $1, $2)
        `, [`APROBACION_HORARIO: ${h.materia_codigo} - Grupo ${h.grupo_numero} - Aprobado por director${comentarios ? ` - ${comentarios}` : ''}`, horario_id]);

        console.log(` Horario aprobado: ${h.materia_codigo} - Grupo ${h.grupo_numero} - ${h.dia} ${h.bloque}`);

        return {
            success: true,
            horario_id: horario_id,
            estado_anterior: 'propuesto',
            estado_nuevo: 'confirmado',
            mensaje: `Horario ID ${horario_id} aprobado exitosamente`
        };
    } catch (error) {
        if (error.code === 'P0001') {
            throw new Error(`Error al aprobar: ${error.message}`);
        }
        throw error;
    }
}