import { useEffect, useState } from 'react';

export function Intro() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDone(true);
      return;
    }
    const t = window.setTimeout(() => setDone(true), 1450);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className={`intro${done ? ' is-done' : ''}`} aria-hidden={done}>
      <div className="intro__inner">
        <div className="intro__mark">K SUITES</div>
        <div className="intro__line" />
      </div>
    </div>
  );
}
