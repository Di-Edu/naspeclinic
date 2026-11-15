import nodemailer from 'nodemailer';
import { config } from '../config';

export interface Correo {
  para: string;
  asunto: string;
  texto: string;
  adjuntos?: { filename: string; content: Buffer }[];
}

/** Correos no enviados por falta de SMTP (solo desarrollo y tests). */
export const bandejaSimulada: Correo[] = [];

/**
 * Envía correos por SMTP (Resend, SendGrid, Gmail Workspace, etc.).
 * Sin SMTP_URL no envía nada: en desarrollo muestra el correo en consola para poder probar
 * (por ejemplo, el enlace de recuperación); en producción solo registra el asunto.
 */
export async function enviarCorreo(c: Correo): Promise<{ simulado: boolean }> {
  const url = process.env.SMTP_URL;
  if (!url) {
    if (config.isProd) {
      console.warn(`[correo NO enviado: falta SMTP_URL] asunto="${c.asunto}"`);
    } else {
      bandejaSimulada.push(c);
      if (bandejaSimulada.length > 50) bandejaSimulada.shift();
      if (process.env.VITEST !== 'true') {
        console.info(`\n[correo simulado] para=${c.para} asunto="${c.asunto}" adjuntos=${c.adjuntos?.length ?? 0}\n${c.texto}\n`);
      }
    }
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
