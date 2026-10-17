import { useState } from 'react';
import { EXPERIENCE } from '../data/content';
import { Reveal } from './Reveal';

export function Experience() {
  const [active, setActive] = useState(0);

  return (
    <section className="pad experience" id="experience">
      <Reveal>
        <p className="kicker">Expérience</p>
        <h2 className="display">Plus qu&apos;un séjour. Une expérience.</h2>
      </Reveal>
      <div className="exp-wrap">
        <div className="exp-visual">
          <img
            src={EXPERIENCE[active].image}
            alt=""
            key={EXPERIENCE[active].id}
          />
        </div>
        <div className="exp-list">
          {EXPERIENCE.map((item, i) => (
            <article
              key={item.id}
              className="exp-item"
              tabIndex={0}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
            >
              <span className="exp-item__n">0{i + 1}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
