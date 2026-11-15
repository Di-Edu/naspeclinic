import nodemailer from 'nodemailer';

interface Correo {
  para: string;
  asunto: string;
  texto: string;
  adjuntos?: { filename: string; content: Buffer }[];
}

/**
 * Envía correos por SMTP (Resend, SendGrid, Gmail Workspace, etc.).
 * Sin SMTP_URL configurado, no envía nada y lo registra en consola (modo desarrollo).
 */
export async function enviarCorreo(c: Correo): Promise<{ simulado: boolean }> {
  const url = process.env.SMTP_URL;
  if (!url) {
    console.info(`[correo simulado] para=${c.para} asunto="${c.asunto}" adjuntos=${c.adjuntos?.length ?? 0}`);
    return { simulado: true };
  }
  const t = nodemailer.createTransport(url);
  await t.sendMail({
    from: process.env.SMTP_FROM ?? 'Naspeclinic <no-responder@naspeclinic.cl>',
    to: c.para,
    subject: c.asunto,
    text: c.texto,
    attachments: c.adjuntos,
  });
  return { simulado: false };
}
