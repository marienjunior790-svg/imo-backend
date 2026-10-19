export function Breath() {
  return (
    <section className="breath">
      <div className="breath__bg">
        <img src="/media/terrace.jpg" alt="" aria-hidden="true" loading="lazy" />
        <div className="breath__veil" />
      </div>
      <div className="breath__text">
        <p className="label" style={{ marginBottom: '1.4rem', letterSpacing: '.4em' }}>Résidence Gabriella</p>
        <h2 className="display">
          Arrivez.<br />
          Posez-vous.<br />
          Profitez.
        </h2>
        <p style={{ marginTop: '1.6rem', opacity: .75, fontSize: '1.05rem' }}>
          Pointe-Noire, à votre rythme.
        </p>
      </div>
    </section>
  );
}
