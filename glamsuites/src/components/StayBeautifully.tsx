import { useReveal } from '../hooks/useReveal';
export function StayBeautifully() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section className="scene-stay section--cream">
      <div className="scene-stay__inner wrap">
        <p className="tag">Glam Suites Congo</p>
        <h2 className="display reveal" ref={ref}>
          Stay.<br />Beautifully.
        </h2>
        <p className="lede">
          Des suites meublées contemporaines au cœur de Bounguila, Pointe-Noire.
          Un espace conçu pour que votre séjour commence avant même que vous posiez vos bagages.
        </p>
        <p className="lede" style={{ marginTop: '.9rem', color: 'var(--gs-champagne)', fontSize: '.88rem', letterSpacing: '.14em', textTransform: 'uppercase' }}>
          Séjours professionnels · En famille · Entre amis
        </p>
      </div>
    </section>
  );
}
