import { createHash, randomBytes } from 'crypto';
import { env } from '../../config/env.js';

/** Stub mailer P2 — log console jusqu'à branchement SMTP/Resend. */
export function sendInvitationEmail(params: {
  to: string;
  firstName: string;
  organizationName: string;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
}): void {
  console.info('[mail:invite]', {
    to: params.to,
    subject: `Invitation ITC — rejoindre ${params.organizationName}`,
    organizationName: params.organizationName,
    role: params.role,
    inviteUrl: params.inviteUrl,
    expiresAt: params.expiresAt.toISOString(),
    body: `Bonjour ${params.firstName},\n\nVous êtes invité(e) à rejoindre ${params.organizationName} sur ITC (${params.role}).\n\nActivez votre compte :\n${params.inviteUrl}\n\nCe lien expire le ${params.expiresAt.toLocaleString('fr-FR')}.\n`,
  });
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
