import { AMENITY_LABEL, FEATURED_SUITES, SUITES, type Suite } from '../data/content';
import { Reveal } from './Reveal';

type Props = {
  onExplore: (suite: Suite) => void;
};

export function Suites({ onExplore }: Props) {
  return (
    <section className="pad" id="suites">
      <Reveal>
        <div className="suites-intro">
          <p className="kicker">Les suites</p>
          <h2 className="display">Chaque adresse, une intimité.</h2>
          <p className="lede">
            Une collection d&apos;appartements à Pointe-Noire — Wharf, Mpita, centre-ville.
            Cinq adresses à lire comme un éditorial. Les autres se découvrent ensuite,
            une à une.
          </p>
        </div>
      </Reveal>
      {FEATURED_SUITES.map((suite, i) => (
        <article className="suite-spread" key={suite.id}>
          <div className="suite-spread__visual">
            <img
              src={suite.image}
              alt={`${suite.name}, ${suite.district} — photographie de substitution`}
              width={1600}
              height={1200}
              loading={i < 2 ? 'eager' : 'lazy'}
            />
            <span className="suite-spread__index">{suite.number}</span>
          </div>
          <div className="suite-spread__meta">
            <p className="quiet">
              {suite.district} · {suite.capacity} voyageur{suite.capacity > 1 ? 's' : ''}
            </p>
            <h3>{suite.name}</h3>
            <p>{suite.editorial}</p>
            <ul className="facts">
              {suite.amenities.map((a) => (
                <li key={a}>{AMENITY_LABEL[a]}</li>
              ))}
            </ul>
            <p className="muted">Tarif sur demande</p>
            <div>
              <button className="btn" type="button" onClick={() => onExplore(suite)}>
                Explorer cette suite
              </button>
            </div>
          </div>
        </article>
      ))}
      <Reveal>
        <p className="kicker">Catalogue</p>
        <h2 className="display" style={{ fontSize: 'clamp(2rem, 4vw, 3.2rem)' }}>
          Les autres suites
        </h2>
        <ul className="other-suites">
          {SUITES.filter((s) => !s.featured).map((suite) => (
            <li key={suite.id}>
              <button type="button" onClick={() => onExplore(suite)}>
                <span>{suite.number}</span>
                <strong>{suite.name}</strong>
                <em>
                  {suite.district}
                  {suite.seaView ? ' · Vue mer' : ''}
                </em>
              </button>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
