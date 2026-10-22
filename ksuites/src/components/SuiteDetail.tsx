import { useEffect, useState } from 'react';
import { AMENITY_LABEL, type Suite } from '../data/content';

type Props = {
  suite: Suite;
  onClose: () => void;
  onReserve: (id: string) => void;
};

export function SuiteDetail({ suite, onClose, onReserve }: Props) {
  const [shot, setShot] = useState(suite.gallery[0]);

  useEffect(() => {
    setShot(suite.gallery[0]);
  }, [suite]);

  useEffect(() => {
    document.body.classList.add('lock');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('lock');
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="suite-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="panel suite-panel">
        <div className="suite-panel__gallery">
          <img src={shot} alt={`${suite.name} — galerie`} />
        </div>
        <div>
          <div className="thumbs">
            {suite.gallery.map((src) => (
              <button
                key={src}
                type="button"
                className={src === shot ? 'is-on' : ''}
                onClick={() => setShot(src)}
                aria-label="Voir cette photographie"
              >
                <img src={src} alt="" />
              </button>
            ))}
          </div>
          <div className="suite-panel__body">
            <div className="panel-head">
              <p className="quiet">
                {suite.number} · {suite.district}
              </p>
              <button className="btn btn--ghost" type="button" onClick={onClose}>
                Fermer
              </button>
            </div>
            <h2 id="suite-title" className="display" style={{ fontSize: 'clamp(2rem, 4vw, 3.2rem)' }}>
              {suite.name}
            </h2>
            <p>{suite.editorial}</p>
            <ul className="facts" style={{ margin: '1.2rem 0' }}>
              <li>
                {suite.capacity} voyageur{suite.capacity > 1 ? 's' : ''}
              </li>
              {suite.amenities.map((a) => (
                <li key={a}>{AMENITY_LABEL[a]}</li>
              ))}
            </ul>
            <p className="muted">Tarif et disponibilité : sur demande. Chambres et surface exactes à confirmer.</p>
            <button className="btn btn--solid" type="button" onClick={() => onReserve(suite.id)}>
              Réserver cette suite
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
