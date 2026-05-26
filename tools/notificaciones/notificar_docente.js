// tools/notificaciones/notificar_docente.js
import { enviarCorreo } from '../../scripts/mailer.js';
import { pool } from '../../scripts/db.js';

/**
 * Notifica a un docente sobre una asignación de horario.
 * @param {Object} params
 * @param {number} params.asignacion_id - ID de la asignación en horario_asignado (opcional si se pasan todos los datos)
 * @param {number} params.docente_id - ID del docente (necesario si no se pasa asignacion_id o para obtener el email)
 * @param {Object} [params.grupo] - Datos del grupo (si ya se tienen)
 * @param {Object} [params.franja] - Datos de la franja (dia, hora_inicio, hora_fin)
 * @param {Object} [params.salon] - Datos del salón (código)
 * @param {Object} [params.periodo] - Datos del periodo (código)
 * @returns {Promise<Object>} Resultado del envío.
 */
export async function notificar_docente({ asignacion_id, docente_id, grupo, franja, salon, periodo }) {
    let datos = {};

    // Si no se pasan todos los datos, obtenerlos desde la BD usando asignacion_id
    if (asignacion_id && (!grupo || !franja || !salon || !periodo)) {
        const query = `
      SELECT 
        d.id AS docente_id,
        d.nombre AS docente_nombre,
        d.email AS docente_email,
        g.numero AS grupo_numero,
        m.codigo AS materia_codigo,
        m.nombre AS materia_nombre,
        f.dia,
        b.hora_inicio,
        b.hora_fin,
        s.codigo AS salon_codigo,
        p.codigo AS periodo_codigo,
        h.id AS asignacion_id
      FROM horario_asignado h
      JOIN grupos g ON g.id = h.grupo_id
      JOIN materias m ON m.id = g.materia_id
      JOIN docentes d ON d.id = h.docente_id
      JOIN salones s ON s.id = h.salon_id
      JOIN franjas_horarias f ON f.id = h.franja_id
      JOIN bloques_horarios b ON b.id = f.bloque_id
      JOIN periodos_academicos p ON p.id = f.periodo_id
      WHERE h.id = $1
    `;
        const res = await pool.query(query, [asignacion_id]);
        if (res.rows.length === 0) {
            throw new Error(`No se encontró la asignación con ID ${asignacion_id}`);
        }
        datos = res.rows[0];
    } else {
        // Si se pasaron los datos directamente, construir el objeto (asumiendo que se proporcionaron)
        // Se espera que contengan al menos: docente_nombre, materia_codigo, materia_nombre, grupo_numero,
        // dia, hora_inicio, hora_fin, salon_codigo, periodo_codigo, asignacion_id
        datos = { ...grupo, ...franja, ...salon, ...periodo, docente_id };
        if (docente_id) {
            const res = await pool.query('SELECT nombre, email FROM docentes WHERE id = $1', [docente_id]);
            if (res.rows.length) {
                datos.docente_nombre = res.rows[0].nombre;
                datos.docente_email = res.rows[0].email;
            }
        }
    }

    // Validar datos esenciales
    if (!datos.docente_email) {
        throw new Error('No se pudo determinar el correo del docente');
    }
    const {
        docente_nombre,
        docente_email,
        materia_codigo,
        materia_nombre,
        grupo_numero,
        dia,
        hora_inicio,
        hora_fin,
        salon_codigo,
        periodo_codigo,
        asignacion_id: asigId,
    } = datos;

    const asunto = `📚 Nueva asignación de horario - ${materia_codigo} (Grupo ${grupo_numero})`;

    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
      <h2 style="color: #005b9f;">AstraSchedule - UNIAJC</h2>
      <p>Estimado/a docente <strong>${docente_nombre}</strong>,</p>
      <p>Se le ha asignado el siguiente horario académico para el periodo <strong>${periodo_codigo}</strong>:</p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr><th style="background: #005b9f; color: white; padding: 8px; text-align: left;">Campo</th>
            <th style="background: #005b9f; color: white; padding: 8px; text-align: left;">Detalle</th>
        </tr>
         <tr style="background: #f2f2f2;"><td style="padding: 8px;">Materia</td><td style="padding: 8px;"><strong>${materia_codigo}</strong> - ${materia_nombre}</td></tr>
         <tr><td style="padding: 8px;">Grupo</td><td style="padding: 8px;">${grupo_numero}</td></tr>
         <tr style="background: #f2f2f2;"><td style="padding: 8px;">Día</td><td style="padding: 8px;">${dia}</td></tr>
         <tr><td style="padding: 8px;">Horario</td><td style="padding: 8px;">${hora_inicio} a ${hora_fin}</td></tr>
         <tr style="background: #f2f2f2;"><td style="padding: 8px;">Salón</td><td style="padding: 8px;">${salon_codigo}</td></tr>
         <tr><td style="padding: 8px;">Estado</td><td style="padding: 8px;">⏳ Propuesto</td></tr>
       </table>

      <p>Por favor, revise la información y <strong>confirme su disponibilidad</strong> haciendo clic en el siguiente botón:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://sistema.uniajc.edu.co/horarios/confirmar?asignacion=${asigId}" 
           style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
           ✅ Confirmar asignación
        </a>
      </div>
      <p>Si el botón no funciona, puede copiar este enlace en su navegador:</p>
      <p><code>https://sistema.uniajc.edu.co/horarios/confirmar?asignacion=${asigId}</code></p>
      
      <hr style="margin: 20px 0;">
      <p style="font-size: 12px; color: #555;">Este es un mensaje automático generado por el sistema de optimización de horarios AstraSchedule. Por favor no responder a este correo. Si tiene inconvenientes, contacte a la dirección de programa.</p>
    </div>
  `;

    const textoPlano = `
AstraSchedule - UNIAJC

Estimado/a docente ${docente_nombre},

Se le ha asignado el siguiente horario académico para el periodo ${periodo_codigo}:

Materia: ${materia_codigo} - ${materia_nombre}
Grupo: ${grupo_numero}
Día: ${dia}
Horario: ${hora_inicio} a ${hora_fin}
Salón: ${salon_codigo}
Estado: Propuesto

Para confirmar su disponibilidad, acceda al siguiente enlace:
https://sistema.uniajc.edu.co/horarios/confirmar?asignacion=${asigId}

Este es un mensaje automático, por favor no responder.
  `;

    // Enviar correo (el módulo mailer ya maneja el modo prueba y límites)
    const result = await enviarCorreo({
        to: docente_email,
        subject: asunto,
        text: textoPlano,
        html,
    });

    return result;
}