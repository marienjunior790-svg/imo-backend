import { useState } from 'react';
import { GALLERY } from '../data/content';

export function Gallery() {
  const [lightbox, setLightbox] = useState<number | null>(null);

  const prev = () => setLightbox(i => (i !== null ? (i - 1 + GALLERY.length) % GALLERY.length : null));
  const next = () => setLightbox(i => (i !== null ? (i + 1) % GALLERY.length : null));

  return (
    <section className="section section--sand" id="espaces">
      <div className="wrap">
        <p className="label">Les espaces</p>
        <h2 className="display--sm reveal" style={{ marginTop: '.8rem', marginBottom: '1.4rem', fontFamily: 'var(--font-s)', fontWeight: 400, lineHeight: 1.05, letterSpacing: '-.02em', fontSize: 'clamp(2rem,5vw,3.6rem)' }}>
          Votre espace.
        </h2>
        <p className="lede">
          Appartements de trois chambres avec salles de bain, salon, salle à manger et cuisine
          entièrement équipée. Terrasse avec vue sur la ville.
        </p>
        <div className="gallery-grid" style={{ marginTop: '2.5rem' }}>
          <div className="gallery-grid__main">
            <img src={GALLERY[0].src} alt={GALLERY[0].alt} loading="lazy" />
          </div>
          {GALLERY.slice(1).map((g, i) => (
            <div key={g.src} className="gallery-grid__thumb" onClick={() => setLightbox(i + 1)}
              role="button" tabIndex={0} aria-label={`Voir : ${g.alt}`}
              onKeyDown={e => e.key === 'Enter' && setLightbox(i + 1)}>
              <img src={g.src} alt={g.alt} loading="lazy" />
            </div>
          ))}
        </div>
      </div>
      {lightbox !== null && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="Galerie"
          onClick={e => e.target === e.currentTarget && setLightbox(null)}>
          <button className="lightbox__close" onClick={() => setLightbox(null)} aria-label="Fermer">×</button>
          <button className="lightbox__prev" onClick={prev} aria-label="Image précédente">‹</button>
          <img src={GALLERY[lightbox].src} alt={GALLERY[lightbox].alt} />
          <button className="lightbox__next" onClick={next} aria-label="Image suivante">›</button>
        </div>
      )}
    </section>
  );
}
