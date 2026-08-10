import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env, isMailerConfigured } from '../../config/env.js';

export type MailPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type MailSendResult = {
  provider: 'resend' | 'smtp' | 'none';
  messageId?: string;
};

let smtpTransport: Transporter | null = null;

export { isMailerConfigured };

function getSmtpTransport(): Transporter {
  if (smtpTransport) return smtpTransport;
  smtpTransport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_SECURE === true,
    auth: {
      user: env.SMTP_USER!,
      pass: env.SMTP_PASS!,
    },
  });
  return smtpTransport;
}

async function sendViaResend(payload: MailPayload): Promise<MailSendResult> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [payload.to],
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (!res.ok) {
    const detail = body.message ?? body.name ?? res.statusText;
    // Resend sandbox: onboarding@resend.dev ne peut envoyer qu’au propriétaire du compte Resend.
    if (res.status === 403 && /verify a domain|own email address/i.test(detail)) {
      throw new Error(
        'RESEND_DOMAIN_REQUIRED: vérifiez un domaine sur resend.com/domains et mettez à jour MAIL_FROM (ne pas utiliser onboarding@resend.dev en production).',
      );
    }
    throw new Error(`Resend HTTP ${res.status}: ${detail}`);
  }
  return { provider: 'resend', messageId: body.id };
}

async function sendViaSmtp(payload: MailPayload): Promise<MailSendResult> {
  const info = await getSmtpTransport().sendMail({
    from: env.MAIL_FROM,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
  return { provider: 'smtp', messageId: typeof info.messageId === 'string' ? info.messageId : undefined };
}

/**
 * Envoi réel — Resend prioritaire, sinon SMTP (Brevo/SendGrid/Mailgun…).
 * Lève une erreur si aucun provider n'est configuré ou si l'API échoue.
 */
export async function sendMail(payload: MailPayload): Promise<MailSendResult> {
  if (env.RESEND_API_KEY && env.MAIL_FROM) {
    return sendViaResend(payload);
  }
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.MAIL_FROM) {
    return sendViaSmtp(payload);
  }
  throw new Error(
    'Mailer non configuré : définissez RESEND_API_KEY+MAIL_FROM ou SMTP_HOST/SMTP_USER/SMTP_PASS/MAIL_FROM',
  );
}

export function buildPasswordResetEmail(params: {
  to: string;
  firstName: string;
  resetUrl: string;
  appDeepLink: string;
  expiresAt: Date;
}): MailPayload {
  const hours = env.PASSWORD_RESET_TTL_HOURS;
  const expiresLabel = params.expiresAt.toLocaleString('fr-FR', { timeZone: 'Africa/Brazzaville' });
  const subject = 'Réinitialisation de votre mot de passe ITC';
  const text = [
    `Bonjour ${params.firstName},`,
    '',
    'Vous avez demandé la réinitialisation de votre mot de passe ITC.',
    '',
    `Ouvrez ce lien (valide ${hours} h, usage unique) :`,
    params.resetUrl,
    '',
    `Lien application mobile : ${params.appDeepLink}`,
    '',
    `Expire le ${expiresLabel}.`,
    '',
    "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
    '',
    '— L’équipe ITC',
  ].join('\n');

  const html = `
  <div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
    <h1 style="font-size:20px;margin:0 0 12px">Réinitialiser votre mot de passe</h1>
    <p style="line-height:1.5;color:#334155">Bonjour <strong>${escapeHtml(params.firstName)}</strong>,</p>
    <p style="line-height:1.5;color:#334155">
      Vous avez demandé la réinitialisation de votre mot de passe ITC.
      Ce lien est <strong>valide ${hours}&nbsp;h</strong> et ne peut être utilisé <strong>qu’une seule fois</strong>.
    </p>
    <p style="margin:28px 0">
      <a href="${escapeAttr(params.resetUrl)}"
         style="background:#152238;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block">
        Créer un nouveau mot de passe
      </a>
    </p>
    <p style="font-size:13px;color:#64748b;line-height:1.45">
      Ou copiez ce lien :<br/>
      <a href="${escapeAttr(params.resetUrl)}" style="color:#1e3354;word-break:break-all">${escapeHtml(params.resetUrl)}</a>
    </p>
    <p style="font-size:12px;color:#94a3b8">Expire le ${escapeHtml(expiresLabel)} · Lien app : ${escapeHtml(params.appDeepLink)}</p>
    <p style="font-size:12px;color:#94a3b8">Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.</p>
  </div>`;

  return { to: params.to, subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
