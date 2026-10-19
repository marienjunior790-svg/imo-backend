import { BRAND } from '../data/content';

export function Hero() {
  return (
    <section className="chapter chapter--center" id="top">
      <p className="kicker">{BRAND.name}</p>
      <h1>
        {BRAND.manifesto.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </h1>
      <p className="lede">{BRAND.lede}</p>
      <div className="actions">
        <a className="btn" href="#explorer">
          Découvrir ITC
        </a>
        <a className="btn" href="#patrimoine">
          Explorer l&apos;expérience
        </a>
      </div>
    </section>
  );
}
