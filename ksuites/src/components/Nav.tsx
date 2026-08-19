import { useEffect, useState } from 'react';
import { BRAND, NAV } from '../data/content';

type Props = {
  onReserve: () => void;
};

export function Nav({ onReserve }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('lock', open);
    return () => document.body.classList.remove('lock');
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (id: string) => {
    setOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <header className={`site-header${scrolled ? ' is-scrolled' : ''}`}>
        <a className="brand" href="#top">
          {BRAND.name.toUpperCase()}
        </a>
        <nav className="nav-desktop" aria-label="Principal">
          {NAV.map((item) => (
            <a key={item.id} href={`#${item.id}`}>
              {item.label}
            </a>
          ))}
          <button className="btn" type="button" onClick={onReserve}>
            Réserver
          </button>
        </nav>
        <button
          className="icon-btn menu-toggle"
          type="button"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="burger">
            <i />
          </span>
        </button>
      </header>
      <div id="mobile-nav" className={`mobile-nav${open ? ' is-open' : ''}`}>
        {NAV.map((item) => (
          <button key={item.id} className="linkish" type="button" onClick={() => go(item.id)}>
            {item.label}
          </button>
        ))}
        <button
          className="btn btn--solid"
          type="button"
          onClick={() => {
            setOpen(false);
            onReserve();
          }}
        >
          Réserver
        </button>
      </div>
    </>
  );
}
