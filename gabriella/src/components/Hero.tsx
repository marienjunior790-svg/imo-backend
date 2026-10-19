import { BRAND } from '../data/content';

export function Hero() {
  return (
    <section className="hero" id="top" aria-label="Résidence Gabriella — accueil">
      <div className="hero__media">
        <img
          src="/media/hero.jpg"
          alt="Intérieur élégant — photographie de substitution en attente du shooting officiel"
          width={2000} height={1333} fetchPriority="high"
        />
        <div className="hero__veil" />
        <div className="hero__grain" />
      </div>
      <div className="hero__content">
        <p className="label hero__overline">Pointe-Noire · République du Congo</p>
        <h1>
          Résidence<br />
          <em>Gabriella</em>
        </h1>
        <p className="hero__sub">{BRAND.tagline}</p>
        <div className="hero__actions">
          <a className="btn btn--brass" href="#reserver">Réserver votre séjour</a>
          <a className="btn" style={{ borderColor: 'rgba(245,240,232,.4)', color: '#f5f0e8' }} href="#residence">
            Découvrir la résidence
          </a>
        </div>
      </div>
      <div className="hero__scroll" aria-hidden="true">Scroll</div>
    </section>
  );
}
