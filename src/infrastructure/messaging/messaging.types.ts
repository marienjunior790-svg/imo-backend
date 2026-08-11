export type MessagingChannel = 'WHATSAPP' | 'EMAIL' | 'SMS' | 'IN_APP';

export type MessagingSendResult = {
  provider: 'whatsapp_cloud' | 'none';
  providerMessageId: string;
  to: string;
  channel: MessagingChannel;
};

export type WhatsAppSendInput = {
  organizationId: string;
  toE164: string;
  body: string;
  templateParams?: string[];
};
