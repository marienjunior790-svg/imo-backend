import { WHATSAPP_E164 } from '../data/content';

export function WhatsAppBand() {
  const ready = WHATSAPP_E164.length > 0;
  const href = ready ? `https://wa.me/${WHATSAPP_E164.replace(/\D/g, '')}` : undefined;

  return (
    <aside className="wa-band">
      <div>
        <p className="kicker">Conciergerie</p>
        <h2>Besoin d&apos;aide pour choisir votre suite ?</h2>
        <p className={ready ? undefined : 'muted'}>
          {ready
            ? 'Parler à K Suites.'
            : 'Le canal WhatsApp s\'ouvrira dès que le numéro officiel sera confirmé.'}
        </p>
      </div>
      {ready ? (
        <a className="btn btn--solid" href={href} target="_blank" rel="noreferrer">
          Parler à K Suites
        </a>
      ) : (
        <span className="chip">WhatsApp — à confirmer</span>
      )}
    </aside>
  );
}
