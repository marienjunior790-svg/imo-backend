export function Cinematic() {
  return (
    <section className="cinematic">
      <div className="cinematic__bg">
        <img src="/media/scene.jpg" alt="" aria-hidden="true" loading="lazy" />
        <div className="cinematic__veil" />
      </div>
      <div className="cinematic__text">
        <p className="tag" style={{ marginBottom: '1.6rem', letterSpacing: '.46em' }}>Glam Suites Congo</p>
        <h2 className="display">
          Feel<br /><em style={{ fontStyle: 'italic' }}>at home.</em>
        </h2>
        <p style={{ marginTop: '1.8rem', fontSize: '1rem', opacity: .72 }}>
          Pointe-Noire, à votre rythme.
        </p>
      </div>
    </section>
  );
}
