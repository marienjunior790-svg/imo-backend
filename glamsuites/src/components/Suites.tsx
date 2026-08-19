import { AMENITIES, SUITES } from '../data/content';
import { useReveal } from '../hooks/useReveal';
function AmenityPill({ id }: { id: string }) {
  const a = AMENITIES.find(x => x.id === id);
  if (!a) return null;
  return <span style={{ fontSize: '.65rem', letterSpacing: '.16em', textTransform: 'uppercase', border: '1px solid var(--gs-line)', padding: '.25rem .55rem', color: 'var(--gs-stone)', display: 'inline-block' }}>{a.label}</span>;
}
export function Suites() {
  const ref = useReveal<HTMLHeadingElement>();
  return (
    <section className="pad" id="suites">
      <div className="wrap" style={{ marginBottom: '3rem' }}>
        <p className="tag">Les suites</p>
        <h2 className="display reveal" ref={ref} style={{ marginTop: '.8rem' }}>
          Une collection.
        </h2>
        <p className="lede" style={{ marginTop: '1rem' }}>
          Chaque suite est un espace à part entière. Les noms et descriptions officiels seront renseignés
          dès que Glam Suites Congo confirme son catalogue complet.
        </p>
      </div>
      <div className="suite-list">
        {SUITES.map(s => (
          <article className="suite-item" key={s.id}>
            <div className="suite-item__visual">
              <img src={s.image} alt={`Suite ${s.index} — photographie de substitution`} loading="lazy" />
              <div className="suite-item__num">{s.index}</div>
            </div>
            <div className="suite-item__body">
              <p className="tag">{s.index} / 03</p>
              <h2>{s.name}</h2>
              <p style={{ color: 'var(--gs-stone)', lineHeight: 1.6 }}>{s.editorial}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', marginTop: '.4rem' }}>
                {AMENITIES.map(a => <AmenityPill key={a.id} id={a.id} />)}
              </div>
              <p className="suite-item__note">{s.note}</p>
              <a className="btn" href="#contact" style={{ marginTop: '.4rem', width: 'fit-content' }}>Réserver cette suite</a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
