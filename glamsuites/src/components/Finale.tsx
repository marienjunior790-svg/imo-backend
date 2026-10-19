export function Finale() {
  return (
    <section className="finale">
      <div className="finale__img">
        <img src="/media/texture.jpg" alt="" aria-hidden="true" loading="lazy" />
        <div className="finale__veil" />
      </div>
      <div className="finale__body">
        <p className="tag" style={{ marginBottom: '1.2rem' }}>Glam Suites Congo</p>
        <h2 style={{ fontFamily: 'var(--font-s)', fontWeight: 300, fontSize: 'clamp(3rem,8vw,6rem)', lineHeight: .9, letterSpacing: '-.02em', marginBottom: '2rem' }}>
          Your suite<br /><em style={{ fontStyle: 'italic' }}>awaits.</em>
        </h2>
        <a className="btn btn--champ" href="#contact">Réserver →</a>
      </div>
    </section>
  );
}
