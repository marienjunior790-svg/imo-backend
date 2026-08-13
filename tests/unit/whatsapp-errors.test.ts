import {
  WhatsAppProviderError,
  formatWhatsAppSendSuccess,
  formatWhatsAppUserError,
} from '../../src/infrastructure/messaging/whatsapp-errors.js';

describe('whatsapp-errors (Phase J5)', () => {
  it('mappe 401 → token Meta invalide', () => {
    const msg = formatWhatsAppUserError(
      new WhatsAppProviderError(401, 'Invalid OAuth access token', 190),
    );
    expect(msg).toMatch(/Token Meta invalide/i);
    expect(msg).toMatch(/WHATSAPP_TOKEN/);
    expect(msg).not.toMatch(/Bearer |EAA/);
  });

  it('mappe 403 → permissions', () => {
    const msg = formatWhatsAppUserError(new WhatsAppProviderError(403, 'permission denied'));
    expect(msg).toMatch(/Token Meta invalide|permissions/i);
  });

  it('mappe 400 → template / fenêtre / fenêtre 24h', () => {
    const msg = formatWhatsAppUserError(
      new WhatsAppProviderError(400, 'Template name does not exist in the translation'),
    );
    expect(msg).toMatch(/400/);
    expect(msg).toMatch(/template|sandbox|24/i);
  });

  it('mappe legacy string HTTP 401', () => {
    const msg = formatWhatsAppUserError(
      new Error('WhatsApp Cloud API HTTP 401: Invalid OAuth access token'),
    );
    expect(msg).toMatch(/Token Meta invalide/i);
  });

  it('mappe non configuré', () => {
    const msg = formatWhatsAppUserError(
      new Error(
        'WhatsApp non configuré : définissez WHATSAPP_ENABLED=true, WHATSAPP_TOKEN et WHATSAPP_PHONE_NUMBER_ID.',
      ),
    );
    expect(msg).toMatch(/non configuré/i);
    expect(msg).toMatch(/WHATSAPP_ENABLED/);
  });

  it('formate un succès avec providerMessageId + SENT', () => {
    const reply = formatWhatsAppSendSuccess({
      tenantName: 'Fortune Libolo',
      toPhone: '+242061234567',
      providerMessageId: 'wamid.ABC',
      messageId: 'cmsg000000000000000001',
    });
    expect(reply).toMatch(/Fortune Libolo/);
    expect(reply).toMatch(/wamid\.ABC/);
    expect(reply).toMatch(/SENT/);
    expect(reply).toMatch(/Meta/);
  });
});
