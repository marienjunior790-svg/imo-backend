import { useEffect, useRef } from 'react';

export function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    if (!fine || reduced) return;
    let x = 0, y = 0, cx = 0, cy = 0, raf = 0;
    const move = (e: PointerEvent) => {
      x = e.clientX; y = e.clientY;
      const t = e.target as HTMLElement | null;
      const isImg = !!t?.closest('img, .gallery-grid__thumb, .residence-image');
      if (label.current) {
        label.current.style.opacity = isImg ? '1' : '0';
        label.current.textContent = 'VIEW';
      }
    };
    const loop = () => {
      cx += (x - cx) * .16; cy += (y - cy) * .16;
      if (dot.current) dot.current.style.transform = `translate3d(${cx}px,${cy}px,0)`;
      if (label.current) label.current.style.transform = `translate3d(${cx}px,${cy}px,0)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener('pointermove', move, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, []);

  return (
    <>
      <div ref={dot} className="cursor-dot" aria-hidden="true" />
      <div ref={label} className="cursor-label" aria-hidden="true" />
    </>
  );
}
