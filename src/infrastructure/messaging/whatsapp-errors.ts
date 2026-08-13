/**
 * Phase J5 — Erreurs WhatsApp Meta Cloud API → messages UX FR (sans secrets).
 */

export class WhatsAppProviderError extends Error {
  readonly httpStatus: number;
  readonly graphCode?: number;
  readonly providerDetail: string;

  constructor(httpStatus: number, providerDetail: string, graphCode?: number) {
    super(`WhatsApp Cloud API HTTP ${httpStatus}: ${providerDetail}`);
    this.name = 'WhatsAppProviderError';
    this.httpStatus = httpStatus;
    this.providerDetail = providerDetail;
    this.graphCode = graphCode;
  }
}

/**
 * Mappe une erreur provider / config en texte clair pour le copilote (jamais le token).
 */
export function formatWhatsAppUserError(err: unknown): string {
  if (err instanceof WhatsAppProviderError) {
    if (err.httpStatus === 401 || err.httpStatus === 403) {
      return (
        `Token Meta invalide ou permissions insuffisantes (HTTP ${err.httpStatus}).\n` +
        `Vérifiez WHATSAPP_TOKEN (system user permanent) et les droits whatsapp_business_messaging ` +
        `sur Railway, puis redéployez. Ne partagez jamais le token dans le chat.`
      );
    }
    if (err.httpStatus === 400) {
      return (
        `Requête WhatsApp refusée par Meta (HTTP 400).\n` +
        `Causes fréquentes : numéro hors sandbox / non autorisé, template manquant ou non approuvé, ` +
        `fenêtre 24 h fermée pour le texte libre.\n` +
        `Détail Meta : ${err.providerDetail.slice(0, 280)}`
      );
    }
    if (err.httpStatus === 404) {
      return (
        `Ressource WhatsApp introuvable (HTTP 404) — vérifiez WHATSAPP_PHONE_NUMBER_ID ` +
        `et WHATSAPP_API_VERSION.`
      );
    }
    if (err.httpStatus === 429) {
      return `Quota / rate-limit Meta (HTTP 429). Réessayez dans quelques minutes.`;
    }
    return (
      `Échec WhatsApp Meta (HTTP ${err.httpStatus}).\n` +
      `Détail : ${err.providerDetail.slice(0, 280)}`
    );
  }

  if (err instanceof Error) {
    const msg = err.message;
    if (/WhatsApp non configuré/i.test(msg)) {
      return (
        `WhatsApp non configuré sur le serveur.\n` +
        `Activez WHATSAPP_ENABLED=true avec WHATSAPP_TOKEN et WHATSAPP_PHONE_NUMBER_ID (voir guide setup).`
      );
    }
    if (/Numéro WhatsApp invalide/i.test(msg) || /E\.164/i.test(msg)) {
      return msg;
    }
    // Legacy string errors from older throws
    const httpMatch = msg.match(/WhatsApp Cloud API HTTP (\d+)/i);
    if (httpMatch) {
      const status = Number(httpMatch[1]);
      const detail = msg.replace(/^WhatsApp Cloud API HTTP \d+:\s*/i, '').trim();
      return formatWhatsAppUserError(new WhatsAppProviderError(status, detail || msg));
    }
    return msg.slice(0, 500);
  }

  return 'Envoi WhatsApp impossible (erreur inconnue).';
}

/** Statut affiché après un envoi réussi (persisté SENT côté ITC). */
export function formatWhatsAppSendSuccess(input: {
  tenantName?: string;
  toPhone: string;
  providerMessageId: string;
  messageId?: string;
}): string {
  return (
    `Message WhatsApp envoyé.\n` +
    `• Destinataire : ${input.tenantName ?? 'le locataire'} (${input.toPhone})\n` +
    `• Provider ID (Meta) : ${input.providerMessageId}\n` +
    (input.messageId ? `• ID message ITC : ${input.messageId}\n` : '') +
    `• Statut ITC : SENT (channel WHATSAPP)\n` +
    `• Canal : WhatsApp Business (Meta Cloud API)`
  );
}
