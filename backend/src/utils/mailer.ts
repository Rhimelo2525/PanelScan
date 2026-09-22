import nodemailer, { type Transporter } from 'nodemailer';

import { env } from '../config/env';
import { AppError } from './AppError';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transporter: Transporter | null = null;

// Short timeouts: an unreachable SMTP host must fail the request quickly
// instead of leaving a customer staring at a spinner (nodemailer's defaults
// are 2 minutes for the connection alone).
const getTransporter = (): Transporter | null => {
  if (!env.SMTP_HOST) return null;

  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 12_000,
  });
  return transporter;
};

/**
 * Sends one transactional email over SMTP.
 *
 * Without SMTP_HOST: production refuses (503) rather than silently pretending
 * to deliver a security code; development prints the message to the server
 * console so the flow can be exercised without a mail account; the automated
 * test run does nothing (tests mock this module to read the code instead).
 */
export const sendMail = async (message: MailMessage): Promise<void> => {
  const transport = getTransporter();

  if (!transport) {
    if (env.NODE_ENV === 'production') {
      throw new AppError('Email delivery is not configured on this server.', 503);
    }
    if (env.NODE_ENV === 'development') {
      console.info(`\n[mailer] SMTP_HOST is not set - email NOT sent. Would have sent:\n  To: ${message.to}\n  Subject: ${message.subject}\n\n${message.text}\n`);
    }
    return;
  }

  await transport.sendMail({
    from: env.MAIL_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
};
