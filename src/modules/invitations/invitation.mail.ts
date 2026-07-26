import { createHash, randomBytes } from 'crypto';
import { env } from '../../config/env.js';
import { sendMail } from '../../shared/mail/mail.service.js';

export async function sendInvitationEmail(params: {
  to: string;
  firstName: string;
  organizationName: string;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
}): Promise<void> {
  const subject = `Invitation ITC — rejoindre ${params.organizationName}`;
  const expiresLabel = params.expiresAt.toLocaleString('fr-FR', { timeZone: 'Africa/Brazzaville' });
  const text = [
    `Bonjour ${params.firstName},`,
    '',
    `Vous êtes invité(e) à rejoindre ${params.organizationName} sur ITC (${params.role}).`,
    '',
    'Activez votre compte :',
    params.inviteUrl,
    '',
    `Ce lien expire le ${expiresLabel}.`,
    '',
    '— L’équipe ITC',
  ].join('\n');

  const html = `
  <div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
    <h1 style="font-size:20px;margin:0 0 12px">Invitation ITC</h1>
    <p style="line-height:1.5;color:#334155">Bonjour <strong>${escapeHtml(params.firstName)}</strong>,</p>
    <p style="line-height:1.5;color:#334155">
      Vous êtes invité(e) à rejoindre <strong>${escapeHtml(params.organizationName)}</strong>
      sur ITC (${escapeHtml(params.role)}).
    </p>
    <p style="margin:28px 0">
      <a href="${escapeAttr(params.inviteUrl)}"
         style="background:#152238;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block">
        Activer mon compte
      </a>
    </p>
    <p style="font-size:12px;color:#94a3b8">Expire le ${escapeHtml(expiresLabel)}</p>
  </div>`;

  const result = await sendMail({ to: params.to, subject, text, html });
  console.info('[mail:invite] sent', { to: params.to, provider: result.provider, messageId: result.messageId });
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

export function hashInviteToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function generateInviteToken(): string {
  return randomBytes(32).toString('hex');
}

export function buildInviteUrl(rawToken: string): string {
  const base = (env.PUBLIC_APP_URL ?? 'https://app.itc.cg').replace(/\/+$/, '');
  return `${base}/invite/${rawToken}`;
}
