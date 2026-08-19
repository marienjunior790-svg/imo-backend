import { SERVICES } from '../data/content';
import { Reveal } from './Reveal';

export function Services() {
  return (
    <section className="pad" id="services">
      <Reveal>
        <p className="kicker">Services</p>
        <h2 className="display">L&apos;essentiel, sans ostentation.</h2>
        <p className="lede">
          Wi-Fi, climatisation, cuisine, vue mer : uniquement ce que le catalogue public
          permet d&apos;affirmer. Le reste s&apos;ajoutera ici, sans reconstitution.
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
