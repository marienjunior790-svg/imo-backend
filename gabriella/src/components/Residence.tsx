import { useReveal } from '../hooks/useReveal';

export function Residence() {
  const r1 = useReveal() as React.RefObject<HTMLElement>;
  const r2 = useReveal() as React.RefObject<HTMLElement>;

  return (
    <section className="section" id="residence">
      <div className="wrap">
        <div className="residence-grid">
          <div className="residence-image reveal" ref={r1 as React.RefObject<HTMLDivElement>}>
            <img src="/media/facade.jpg" alt="Façade de la Résidence Gabriella" loading="lazy" />
          </div>
          <div>
            <p className="label">La résidence</p>
            <h2 className="editorial reveal" ref={r2 as React.RefObject<HTMLHeadingElement>} style={{ marginTop: '.8rem', marginBottom: '1.4rem' }}>
              Plus qu&apos;un lieu où dormir.
            </h2>
            <p className="lede">
              Située au 77 Avenue Jean Marie Concko à Pointe-Noire, la Résidence Gabriella propose
              des appartements de standing sur six étages. Un environnement calme, des espaces
              généreux et une équipe accueillante pour vos séjours professionnels, en famille ou
              entre amis.
            </p>
            <p className="lede" style={{ marginTop: '1rem' }}>
              À moins de 2 km de la plage et de l&apos;entrée du port. À 4,3 km de l&apos;aéroport.
            </p>
            <div style={{ marginTop: '2rem', display: 'flex', gap: '1.4rem', flexWrap: 'wrap' }}>
              <div>
                <div className="label" style={{ marginBottom: '.3rem' }}>Check-in</div>
                <div style={{ fontFamily: 'var(--font-s)', fontSize: '1.8rem' }}>07h00</div>
              </div>
              <div>
                <div className="label" style={{ marginBottom: '.3rem' }}>Check-out</div>
                <div style={{ fontFamily: 'var(--font-s)', fontSize: '1.8rem' }}>14h00</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
