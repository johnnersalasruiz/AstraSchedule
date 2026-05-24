// Simulación de envío de correo o mensaje
export async function notificar_docente({ docente_id, asunto, mensaje }) {
    // Aquí se integraría con un servicio real de email (nodemailer) o base de datos
    console.log(`📧 NOTIFICACIÓN a docente ${docente_id}: ${asunto} - ${mensaje}`);
    // Se puede guardar en tabla 'notificaciones' si existe
    return { enviado: true, canal: 'email_simulado', destinatario: docente_id };
}