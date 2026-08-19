import { useEffect, useState } from 'react';
import { BRAND, NAV } from '../data/content';

export function Nav() {
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <header className={`nav${compact ? ' is-compact' : ''}`}>
        <a className="brand" href="#top">
          {BRAND.name}
        </a>
        <nav className="nav-links" aria-label="Principal">
          {NAV.map((item) => (
            <a key={item.id} href={`#${item.id}`}>
              {item.label}
            </a>
          ))}
        </nav>
        <a className="enter" href="#download">
          Entrer dans ITC →
        </a>
        <button
          className="icon-btn burger"
          type="button"
          aria-expanded={open}
          aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '×' : '☰'}
        </button>
      </header>
      <div className={`mobile-nav${open ? ' open' : ''}`}>
        {NAV.map((item) => (
          <button key={item.id} className="link" type="button" onClick={() => go(item.id)}>
            {item.label}
          </button>
        ))}
        <button className="btn btn--solid" type="button" onClick={() => go('download')} style={{ marginTop: '1.5rem' }}>
          Entrer dans ITC
        </button>
      </div>
    </>
  );
}
