import { BRAND, FOOTER } from '../data/content';

export function Footer() {
  return (
    <>
      <div className="fade-end" aria-hidden="true" />
      <footer className="site-footer">
        <div className="foot-grid">
          <div>
            <div className="brand">{BRAND.name}</div>
            <p className="lede" style={{ fontSize: '1.15rem' }}>
              {BRAND.tagline}
            </p>
          </div>
          {FOOTER.columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h3>{col.title}</h3>
              {col.links.map((l) => (
                <a key={l.href} href={l.href}>
                  {l.label}
                </a>
              ))}
            </nav>
          ))}
        </div>
        <p className="legal" id="legal">
          Mentions légales — raison sociale, siège et RCS à renseigner. © ITC.
        </p>
      </footer>
    </>
  );
}
