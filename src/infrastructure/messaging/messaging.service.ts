import { injectable } from 'tsyringe';
import { env, isWhatsAppConfigured } from '../../config/env.js';
import { ValidationError } from '../../shared/errors/app.error.js';
import { isValidWhatsAppPhone, normalizePhoneE164 } from '../../shared/utils/phone.util.js';
import type { MessagingSendResult, WhatsAppSendInput } from './messaging.types.js';
import { sendWhatsAppCloudMessage } from './whatsapp-cloud.provider.js';

@injectable()
export class MessagingService {
  async sendWhatsAppText(input: WhatsAppSendInput): Promise<MessagingSendResult> {
    if (!isWhatsAppConfigured) {
      throw new ValidationError(
        'WhatsApp non configuré : définissez WHATSAPP_ENABLED=true, WHATSAPP_TOKEN et WHATSAPP_PHONE_NUMBER_ID.',
      );
    }

    const toE164 =
      normalizePhoneE164(input.toE164, env.WHATSAPP_DEFAULT_COUNTRY_CODE) ?? input.toE164.trim();
    if (!isValidWhatsAppPhone(toE164)) {
      throw new ValidationError(
        `Numéro WhatsApp invalide (« ${input.toE164} »). Attendu E.164 (ex. +24206XXXXXXX).`,
      );
    }

    const body = input.body?.trim();
    if (!body) {
      throw new ValidationError('Corps du message WhatsApp manquant.');
    }

    return sendWhatsAppCloudMessage({
      toE164,
      body,
      templateParams: input.templateParams,
    });
  }
}
