import { BRAND, NAV } from '../data/content';

export function Footer() {
  const wa = `https://wa.me/${BRAND.phoneE164}`;
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-top">
          <div>
            <div className="footer-brand">Résidence Gabriella</div>
            <p className="footer-tagline">{BRAND.tagline}</p>
            <p style={{ color: 'rgba(245,240,232,.45)', fontSize: '.8rem', marginTop: '.5rem' }}>
              Pointe-Noire · République du Congo
            </p>
            <div style={{ marginTop: '1.4rem', display: 'grid', gap: '.45rem' }}>
              <a href={`tel:${BRAND.phoneE164}`} style={{ fontSize: '.84rem', color: 'rgba(245,240,232,.72)' }}>{BRAND.phone}</a>
              <a href={`mailto:${BRAND.email}`} style={{ fontSize: '.84rem', color: 'rgba(245,240,232,.72)' }}>{BRAND.email}</a>
              <a href={wa} target="_blank" rel="noreferrer" style={{ fontSize: '.84rem', color: 'var(--g-brass)' }}>WhatsApp</a>
              <a href={BRAND.facebookUrl} target="_blank" rel="noreferrer" style={{ fontSize: '.84rem', color: 'rgba(245,240,232,.55)' }}>Facebook</a>
            </div>
          </div>
          <nav aria-label="Navigation">
            <p className="label" style={{ marginBottom: '1rem' }}>Navigation</p>
            <div className="footer-nav">
              {NAV.map(n => <a key={n.id} href={`#${n.id}`}>{n.label}</a>)}
              <a href={BRAND.googleMapsUrl} target="_blank" rel="noreferrer">Google Maps</a>
            </div>
          </nav>
          <div>
            <p className="label" style={{ marginBottom: '1rem' }}>Accès</p>
            <p style={{ color: 'rgba(245,240,232,.6)', fontSize: '.88rem', lineHeight: 1.6 }}>
              {BRAND.address}
            </p>
            <p style={{ marginTop: '.8rem', color: 'rgba(245,240,232,.45)', fontSize: '.8rem' }}>
              Check-in {BRAND.checkin} · Check-out {BRAND.checkout}
            </p>
          </div>
        </div>
        <div className="footer-bottom">
          <span className="footer-legal" id="legal">Résidence Gabriella — Pointe-Noire, République du Congo. Mentions légales à compléter.</span>
          <span className="footer-legal">Designed &amp; crafted by FM Agence</span>
        </div>
      </div>
    </footer>
  );
}
