import { useEffect, useRef } from 'react';
import type { ItcSceneHandle } from '../three/scene';

export function Stage() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobile = window.matchMedia('(max-width: 768px)').matches || window.innerWidth < 768;
    let handle: ItcSceneHandle | null = null;
    let cancelled = false;

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      handle?.setScroll(max > 0 ? window.scrollY / max : 0);
      const bar = document.querySelector<HTMLElement>('.progress');
      if (bar) bar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
    };
    const onMove = (e: PointerEvent) => {
      handle?.setPointer(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
      const c = document.querySelector<HTMLElement>('.cursor');
      if (c) c.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) rotate(45deg)`;
    };
    const onOrient = (e: DeviceOrientationEvent) => {
      handle?.setGyro(e.beta ?? 0, e.gamma ?? 0);
    };

    void (async () => {
      try {
        const { createItcScene } = await import('../three/scene');
        if (cancelled) return;
        handle = createItcScene(canvas, { reduced, mobile });
        onScroll();
      } catch {
        /* WebGL indisponible : le site reste lisible sans la maquette. */
      }
    })();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('deviceorientation', onOrient);
    return () => {
      cancelled = true;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('deviceorientation', onOrient);
      handle?.destroy();
    };
  }, []);

  return (
    <>
      <div id="stage" aria-hidden="true">
        <canvas ref={ref} />
      </div>
      <div className="veil" aria-hidden="true" />
      <div className="progress" aria-hidden="true" />
      <div className="cursor" aria-hidden="true" />
    </>
  );
}
