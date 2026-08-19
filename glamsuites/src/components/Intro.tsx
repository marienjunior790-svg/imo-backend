import { useEffect, useState } from 'react';
export function Intro() {
  const [out, setOut] = useState(false);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) { setGone(true); return; }
    const t1 = setTimeout(() => setOut(true), 1900);
    const t2 = setTimeout(() => setGone(true), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  if (gone) return null;
  return (
    <div className={`intro${out ? ' out' : ''}`} aria-hidden="true">
      <div className="intro__name">Glam Suites</div>
      <div className="intro__line" />
      <div className="intro__sub">Pointe-Noire · Congo</div>
    </div>
  );
}
