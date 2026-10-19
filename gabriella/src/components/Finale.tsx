export function Finale() {
  return (
    <section className="breath" style={{ minHeight: '65svh' }}>
      <div className="breath__bg">
        <img src="/media/city.jpg" alt="" aria-hidden="true" loading="lazy" />
        <div className="breath__veil" />
      </div>
      <div className="breath__text">
        <p className="label" style={{ marginBottom: '1.2rem' }}>Votre prochaine escale</p>
        <h2 style={{ fontFamily: 'var(--font-s)', fontWeight: 400, fontSize: 'clamp(2rem,5vw,3.6rem)', letterSpacing: '.02em', lineHeight: 1.15 }}>
          Votre prochaine escale<br />à Pointe-Noire.
        </h2>
        <a className="btn btn--brass" href="#reserver" style={{ marginTop: '2rem' }}>
          Réserver
        </a>
      </div>
    </section>
  );
}
