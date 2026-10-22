import { ABOUT } from '../data/content';
import { Reveal } from './Reveal';

export function About() {
  return (
    <section className="pad about" id="a-propos">
      <Reveal>
        <p className="kicker">{ABOUT.kicker}</p>
        <h2 className="display">{ABOUT.title}</h2>
      </Reveal>
      <div>
        {ABOUT.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
    </section>
  );
}
