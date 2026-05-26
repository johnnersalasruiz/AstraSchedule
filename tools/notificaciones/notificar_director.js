export async function notificar_director({ director_email, asunto, mensaje }) {
    console.log(`📧 NOTIFICACIÓN a director (${director_email}): ${asunto} - ${mensaje}`);
    return { enviado: true, canal: 'email_simulado', destinatario: director_email };
}