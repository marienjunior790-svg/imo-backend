import { useState } from 'react';
import { GALLERY_ALL } from '../data/content';
export function Gallery() {
  const [lb, setLb] = useState<number | null>(null);
  const prev = () => setLb(i => i !== null ? (i - 1 + GALLERY_ALL.length) % GALLERY_ALL.length : null);
  const next = () => setLb(i => i !== null ? (i + 1) % GALLERY_ALL.length : null);
  return (
    <section className="pad section--cream" id="galerie">
      <div className="wrap">
        <p className="tag">Galerie</p>
        <h2 className="editorial" style={{ marginTop: '.8rem', marginBottom: '1.4rem' }}>
          L&apos;atmosphère avant le logement.
        </h2>
        <div className="gallery-masonry">
          {GALLERY_ALL.map((g, i) => (
            <div key={g.src} className="gallery-masonry__item" data-label="View"
              onClick={() => setLb(i)} role="button" tabIndex={0} aria-label={g.alt}
              onKeyDown={e => e.key === 'Enter' && setLb(i)}>
              <img src={g.src} alt={g.alt} loading={i < 2 ? 'eager' : 'lazy'} />
            </div>
          ))}
        </div>
      </div>
      {lb !== null && (
        <div className="lb" role="dialog" aria-modal="true" aria-label="Galerie"
          onClick={e => e.target === e.currentTarget && setLb(null)}>
          <button className="lb__x" onClick={() => setLb(null)} aria-label="Fermer">×</button>
          <button className="lb__p" onClick={prev} aria-label="Précédent">‹</button>
          <img src={GALLERY_ALL[lb].src} alt={GALLERY_ALL[lb].alt} />
          <button className="lb__n" onClick={next} aria-label="Suivant">›</button>
        </div>
      )}
    </section>
  );
}
