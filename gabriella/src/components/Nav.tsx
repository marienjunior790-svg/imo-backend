import { useEffect, useState } from 'react';
import { BRAND, NAV } from '../data/content';

export function Nav() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fn = () => setSolid(window.scrollY > 40);
    fn(); window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <header className={`nav${solid ? ' is-solid' : ''}`}>
        <a className="nav__brand" href="#top">{BRAND.shortName}</a>
        <nav className="nav__links" aria-label="Principal">
          {NAV.map(n => <a key={n.id} href={`#${n.id}`}>{n.label}</a>)}
        </nav>
        <a className="btn btn--brass nav__cta" href="#reserver">Réserver</a>
        <button
          className={`nav__burger${open ? ' is-open' : ''}`}
          type="button"
          aria-expanded={open}
          aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
          onClick={() => setOpen(v => !v)}
        >
          <span /><span /><span />
        </button>
      </header>
      <div className={`mobile-menu${open ? ' open' : ''}`}>
        {NAV.map(n => (
          <button key={n.id} className="menu-link" type="button" onClick={() => go(n.id)}>
            {n.label}
          </button>
        ))}
        <button className="btn btn--brass" style={{ marginTop: '1.8rem', width: 'auto' }} type="button"
          onClick={() => go('reserver')}>
          Réserver
        </button>
      </div>
    </>
  );
}
