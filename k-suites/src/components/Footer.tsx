import { BRAND, NAV } from '../data/content';

export function Footer() {
  return (
    <footer>
      <div>
        <div className="logo">{BRAND.name.toUpperCase()}</div>
        <p className="lede">
          {BRAND.tagline[0]}
          <br />
          {BRAND.tagline[1]}
        </p>
        <p className="note">
          {BRAND.city}, {BRAND.country}
        </p>
      </div>
      <nav aria-label="Pied de page">
        {NAV.map((n) => (
          <a key={n.id} href={`#${n.id}`} style={{ display: 'block', marginBottom: '0.4rem' }}>
            {n.label}
          </a>
        ))}
        <a href="#sejour">Réserver</a>
        <p className="credit">Mentions légales à renseigner · Designed &amp; crafted by FM Agence</p>
      </nav>
    </footer>
  );
}
