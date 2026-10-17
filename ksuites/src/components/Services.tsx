import { SERVICES } from '../data/content';
import { Reveal } from './Reveal';

export function Services() {
  return (
    <section className="pad" id="services">
      <Reveal>
        <p className="kicker">Services</p>
        <h2 className="display">L&apos;essentiel, sans ostentation.</h2>
        <p className="lede">
          Ce que l&apos;on peut dire aujourd&apos;hui, sans en rajouter. Le reste
          s&apos;écrira ici dès qu&apos;il sera confirmé.
        </p>
      </Reveal>
      <div className="services-grid">
        {SERVICES.map((item) => (
          <article className="service-card" key={item.id}>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
            <span className="chip">{item.scope === 'collection' ? 'Collection' : 'Selon les suites'}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
