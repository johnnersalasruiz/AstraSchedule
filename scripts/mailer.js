import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

let emailCounter = 0;
const limite = parseInt(process.env.MAX_EMAILS_PER_SESSION) || 2;
const testEmail = process.env.TEST_EMAIL;

export async function enviarCorreo({ to, subject, text, html }) {
    const esModoPrueba = !!testEmail;
    const destinatarioReal = esModoPrueba ? testEmail : to;

    if (esModoPrueba && emailCounter >= limite) {
        console.log(`⏭️ Límite de ${limite} correos de prueba alcanzado. No se envió a ${destinatarioReal}`);
        return { enviado: false, motivo: 'límite de prueba alcanzado' };
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    try {
        const info = await transporter.sendMail({
            from: `"AstraSchedule" <${process.env.SMTP_USER}>`,
            to: destinatarioReal,
            subject: esModoPrueba ? `[PRUEBA] ${subject}` : subject,
            text,
            html,
        });
        emailCounter++;
        console.log(`📧 Correo enviado a ${destinatarioReal} (${emailCounter}/${limite})`);
        return { enviado: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error enviando correo:', error.message);
        return { enviado: false, error: error.message };
    }
}