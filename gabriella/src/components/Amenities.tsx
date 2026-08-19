import { AMENITIES } from '../data/content';

export function Amenities() {
  return (
    <section className="section" id="equipements">
      <div className="wrap">
        <p className="label">Équipements</p>
        <h2 className="editorial" style={{ marginTop: '.8rem', marginBottom: '.5rem' }}>
          Tout le nécessaire, rien de superflu.
        </h2>
        <p className="lede">Équipements confirmés dans les appartements de la Résidence Gabriella.</p>
        <div className="amenities-grid">
          {AMENITIES.map(a => (
            <article className="amenity-card" key={a.id}>
              <div className="label">{a.id}</div>
              <h3>{a.label}</h3>
              <p>{a.detail}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
