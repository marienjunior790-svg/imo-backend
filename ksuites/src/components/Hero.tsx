import { BRAND } from '../data/content';

type Props = {
  onDiscover: () => void;
  onReserve: () => void;
};

export function Hero({ onDiscover, onReserve }: Props) {
  return (
    <section className="hero" id="top" aria-label="Accueil K Suites">
      <div className="hero__media">
        <img
          src="/media/hero.jpg"
          alt="Intérieur d'une suite contemporaine, lumière chaude — visuel de substitution en attendant les photographies officielles K Suites"
          width={2000}
          height={1333}
        />
        <div className="hero__shade" />
        <div className="hero__grain" />
      </div>
      <div className="frame" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <p className="hero__spine" aria-hidden="true">
        {BRAND.cityCountry}
      </p>
      <div className="hero__copy">
        <p className="eyebrow">{BRAND.name}</p>
        <h1>
          {BRAND.tagline[0]}
          <br />
          <em>{BRAND.tagline[1]}</em>
        </h1>
        <p className="hero__place">{BRAND.cityCountry}</p>
        <div className="hero__actions">
          <button className="btn" type="button" onClick={onDiscover}>
            Découvrir les suites
          </button>
          <button className="btn btn--ghost" type="button" onClick={onReserve}>
            Réserver votre séjour →
          </button>
        </div>
      </div>
      <div className="scroll-hint" aria-hidden="true">
        Scroll
        <i />
      </div>
    </section>
  );
}
