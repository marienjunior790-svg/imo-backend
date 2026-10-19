import { BRAND, NAV } from '../data/content';
export function Footer() {
  const wa = `https://wa.me/${BRAND.phoneE164}`;
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer__grid">
          <div>
            <div className="footer__brand">Glam Suites</div>
            <p className="footer__tag">Pointe-Noire · Congo</p>
            <p style={{ color: 'var(--gs-champagne)', fontFamily: 'var(--font-s)', fontStyle: 'italic', fontSize: '1.2rem', marginTop: '.3rem' }}>Stay beautifully.</p>
            <div style={{ marginTop: '1.4rem', display: 'grid', gap: '.4rem' }}>
              <a href={`tel:${BRAND.phoneE164}`} style={{ color: 'rgba(245,241,234,.65)', fontSize: '.84rem' }}>{BRAND.phone}</a>
              <a href={wa} target="_blank" rel="noreferrer" style={{ color: 'var(--gs-champagne)', fontSize: '.84rem' }}>WhatsApp</a>
              {BRAND.instagram && <a href={BRAND.instagram} target="_blank" rel="noreferrer" style={{ color: 'rgba(245,241,234,.5)', fontSize: '.84rem' }}>Instagram</a>}
            </div>
          </div>
          <nav aria-label="Navigation">
            <p className="tag" style={{ marginBottom: '1rem' }}>Navigation</p>
            <div className="footer__links">
              {NAV.map(n => <a key={n.id} href={`#${n.id}`}>{n.label}</a>)}
              <a href="#contact">Réserver</a>
              <a href={BRAND.googleMapsUrl} target="_blank" rel="noreferrer">Google Maps</a>
            </div>
          </nav>
          <div>
            <p className="tag" style={{ marginBottom: '1rem' }}>Adresse</p>
            <p style={{ color: 'rgba(245,241,234,.6)', fontSize: '.88rem', lineHeight: 1.65 }}>
              {BRAND.district}<br />{BRAND.address}
            </p>
          </div>
        </div>
        <div className="footer__bottom">
          <span className="footer__legal" id="legal">Glam Suites Congo · Pointe-Noire, République du Congo. Mentions légales à compléter.</span>
          <span className="footer__legal">Designed &amp; crafted by FM Agence</span>
        </div>
      </div>
    </footer>
  );
}
