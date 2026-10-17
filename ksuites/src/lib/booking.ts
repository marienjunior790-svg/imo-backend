import { INQUIRY_API_URL } from '../data/content';

export type Inquiry = {
  checkIn: string;
  checkOut: string;
  suiteId: string;
  guests: string;
  name: string;
  email: string;
  phone: string;
  message: string;
};

/**
 * Point d'extension pour l'API K Suites / IMMO-tec.
 * Si VITE_INQUIRY_API_URL est défini, POST JSON.
 * Sinon : aucune fausse réservation — l'UI confirme une demande locale.
 */
export async function submitInquiry(payload: Inquiry): Promise<'api' | 'local'> {
  if (INQUIRY_API_URL) {
    const res = await fetch(INQUIRY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('inquiry_failed');
    return 'api';
  }
  await new Promise((r) => setTimeout(r, 450));
  return 'local';
}
