import { useEffect, useState } from 'react';

export function Intro() {
  const [done, setDone] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setGone(true);
      return;
    }
    const hide = window.setTimeout(() => setDone(true), 1400);
    const unmount = window.setTimeout(() => setGone(true), 2300);
    return () => {
      window.clearTimeout(hide);
      window.clearTimeout(unmount);
    };
  }, []);

  if (gone) return null;

  return (
    <div className={`intro${done ? ' is-done' : ''}`} aria-hidden="true">
      <div className="intro__inner">
        <div className="intro__mark">K SUITES</div>
        <div className="intro__line" />
      </div>
    </div>
  );
}
