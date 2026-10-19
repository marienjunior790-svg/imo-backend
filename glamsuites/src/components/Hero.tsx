import { BRAND } from '../data/content';
export function Hero() {
  return (
    <section className="hero" id="top" aria-label="Glam Suites Congo — accueil">
      <div className="hero__img">
        <img src="/media/hero.jpg" alt="Suite contemporaine — photographie de substitution" width={2000} height={1333} fetchPriority="high" />
        <div className="hero__veil" />
        <div className="hero__grain" />
      </div>
      <div className="hero__body">
        <p className="tag hero__label">Pointe-Noire · {BRAND.country}</p>
        <h1 className="hero-title hero__title">
          Glam<br /><em className="serif" style={{ fontWeight: 300, fontStyle: 'italic' }}>Suites</em>
        </h1>
        <p className="hero__sub">{BRAND.tagline}</p>
        <div className="hero__ctas">
          <a className="btn btn--champ" href="#suites">Découvrir les suites</a>
          <a className="btn" style={{ borderColor: 'rgba(245,241,234,.35)', color: 'var(--gs-ivory)' }} href="#contact">Réserver</a>
        </div>
      </div>
      <div className="scroll-line" aria-hidden="true">Scroll</div>
    </section>
  );
}
