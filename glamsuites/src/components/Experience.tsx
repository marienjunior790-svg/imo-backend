import { AMENITIES, WHY } from '../data/content';
export function Experience() {
  return (
    <section className="pad section--dark" id="experience">
      <div className="wrap">
        <p className="tag">The Glam Experience</p>
        <h2 className="editorial" style={{ marginTop: '.8rem', color: 'var(--gs-ivory)', marginBottom: '1.4rem' }}>
          It&apos;s not just a stay.
        </h2>
        <div style={{ display: 'grid', gap: '2.5rem', maxWidth: '56rem' }}>
          {WHY.map((w, i) => (
            <div key={w.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1.4rem', alignItems: 'start', paddingTop: '1.4rem', borderTop: '1px solid var(--gs-line-l)' }}>
              <span style={{ fontFamily: 'var(--font-s)', fontSize: '2.5rem', lineHeight: 1, color: 'var(--gs-champagne)', fontWeight: 300 }}>0{i + 1}</span>
              <div>
                <h3 style={{ fontFamily: 'var(--font-s)', fontSize: '1.8rem', fontWeight: 300, marginBottom: '.4rem' }}>{w.label}</h3>
                <p style={{ color: 'rgba(245,241,234,.7)', fontSize: '1rem' }}>{w.text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="amenities-list" style={{ marginTop: '3.5rem' }}>
          {AMENITIES.map(a => (
            <div className="amenity" key={a.id}>
              <div className="tag" style={{ marginBottom: '.3rem' }}>{a.id}</div>
              <h3>{a.label}</h3>
              <p>{a.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
