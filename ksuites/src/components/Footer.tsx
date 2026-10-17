import { BRAND, NAV, WHATSAPP_E164 } from '../data/content';

type Props = {
  onReserve: () => void;
};

export function Footer({ onReserve }: Props) {
  const wa = WHATSAPP_E164.length > 0;

  return (
    <footer className="site-footer">
      <div>
        <div className="footer-brand">{BRAND.name.toUpperCase()}</div>
        <p className="footer-tag">
          {BRAND.tagline[0]}
          <br />
          {BRAND.tagline[1]}
        </p>
        <p className="muted">{BRAND.cityCountry}</p>
      </div>
      <div>
        <nav className="footer-nav" aria-label="Pied de page">
          {NAV.map((item) => (
            <a key={item.id} href={`#${item.id}`}>
              {item.label}
            </a>
          ))}
          <button type="button" onClick={onReserve}>
            Réserver
          </button>
          {wa ? (
            <a href={`https://wa.me/${WHATSAPP_E164.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          ) : (
            <span className="muted">WhatsApp — à confirmer</span>
          )}
        </nav>
        <p className="credit" style={{ marginTop: '2rem' }}>
          Designed &amp; crafted by FM Agence
        </p>
      </div>
    </footer>
  );
}
