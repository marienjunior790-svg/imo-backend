import { useEffect, useState } from 'react';
import { BRAND, NAV } from '../data/content';

export function Nav() {
  const [on, setOn] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fn = () => setOn(window.scrollY > 48);
    fn();
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const go = (id: string) => {
    setOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <header className={`bar${on ? ' is-on' : ''}`}>
        <a className="logo" href="#top">
          {BRAND.name.toUpperCase()}
        </a>
        <nav className="links" aria-label="Principal">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`}>
              {n.label}
            </a>
          ))}
        </nav>
        <a className="cta" href="#sejour">
          Réserver
        </a>
        <button className="burger" type="button" aria-expanded={open} aria-label="Menu" onClick={() => setOpen((v) => !v)}>
          {open ? '×' : '☰'}
        </button>
      </header>
      <div className={`menu${open ? ' open' : ''}`}>
        {NAV.map((n) => (
          <button key={n.id} type="button" onClick={() => go(n.id)}>
            {n.label}
          </button>
        ))}
        <button type="button" className="cta" style={{ marginTop: '1.4rem', color: 'inherit' }} onClick={() => go('sejour')}>
          Réserver
        </button>
      </div>
    </>
  );
}
