import { useEffect, useState } from 'react';

export function Intro() {
  const [gone, setGone] = useState(false);
  const [out, setOut] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setGone(true); return; }
    const t1 = setTimeout(() => setOut(true), 1800);
    const t2 = setTimeout(() => setGone(true), 2700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (gone) return null;
  return (
    <div className={`intro-overlay${out ? ' done' : ''}`} aria-hidden="true">
      <div className="intro-name">Résidence Gabriella</div>
      <div className="intro-line" />
      <div className="intro-loc">Pointe-Noire · Congo</div>
    </div>
  );
}
