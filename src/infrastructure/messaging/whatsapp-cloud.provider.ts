import { env } from '../../config/env.js';
import type { MessagingSendResult } from './messaging.types.js';
import { WhatsAppProviderError } from './whatsapp-errors.js';

type GraphMessagesResponse = {
  messaging_product?: string;
  contacts?: Array<{ input?: string; wa_id?: string }>;
  messages?: Array<{ id?: string }>;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_data?: { details?: string };
    error_user_msg?: string;
  };
};

function graphMessagesUrl(): string {
  const version = env.WHATSAPP_API_VERSION || 'v21.0';
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID!;
  return `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
}

function buildPayload(toE164: string, body: string, templateParams?: string[]): Record<string, unknown> {
  const to = toE164.replace(/^\+/, '');
  const templateName = env.WHATSAPP_TEMPLATE_NAME?.trim();

  if (templateName) {
    const params = templateParams?.length ? templateParams : [body];
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE || 'fr' },
        components: [
          {
            type: 'body',
            parameters: params.map((text) => ({ type: 'text', text: String(text).slice(0, 1024) })),
          },
        ],
      },
    };
  }

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body: body.slice(0, 4096) },
  };
}

/**
 * Envoi WhatsApp via Meta Cloud API (Graph).
 * Ne journalise jamais le token ; les messages d’erreur restent sans secrets.
 */
export async function sendWhatsAppCloudMessage(input: {
  toE164: string;
  body: string;
  templateParams?: string[];
}): Promise<MessagingSendResult> {
  const res = await fetch(graphMessagesUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildPayload(input.toE164, input.body, input.templateParams)),
  });

  const data = (await res.json().catch(() => ({}))) as GraphMessagesResponse;
  if (!res.ok) {
    const detail =
      data.error?.error_user_msg ||
      data.error?.error_data?.details ||
      data.error?.message ||
      res.statusText ||
      'erreur inconnue';
    throw new WhatsAppProviderError(res.status, detail, data.error?.code);
  }

  const providerMessageId = data.messages?.[0]?.id;
  if (!providerMessageId) {
    throw new WhatsAppProviderError(502, 'réponse sans messages[0].id');
  }

  return {
    provider: 'whatsapp_cloud',
    providerMessageId,
    to: input.toE164,
    channel: 'WHATSAPP',
  };
}
