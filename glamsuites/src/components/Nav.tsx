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
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', key);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', key); };
  }, [open]);
  const go = (id: string) => { setOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); };
  return (
    <>
      <header className={`nav${solid ? ' solid' : ''}`}>
        <a className="nav__brand" href="#top">{BRAND.name}</a>
        <nav className="nav__links" aria-label="Principal">
          {NAV.map(n => <a key={n.id} href={`#${n.id}`}>{n.label}</a>)}
        </nav>
        <a className="btn btn--champ" href="#contact">Réserver</a>
        <button className={`nav__burger${open ? ' open' : ''}`} type="button" aria-expanded={open} aria-label={open ? 'Fermer' : 'Menu'} onClick={() => setOpen(v => !v)}>
          <span /><span /><span />
        </button>
      </header>
      <div className={`mmenu${open ? ' open' : ''}`}>
        {NAV.map(n => <button key={n.id} className="mlink" type="button" onClick={() => go(n.id)}>{n.label}</button>)}
        <button className="btn btn--champ" style={{ marginTop: '1.8rem' }} type="button" onClick={() => go('contact')}>Réserver</button>
      </div>
    </>
  );
}
