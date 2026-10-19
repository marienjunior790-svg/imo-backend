import { useEffect, useRef } from 'react';
import type { PortalHandle } from '../three/portal';

export function Portal() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobile = window.innerWidth < 768;
    let handle: PortalHandle | null = null;
    let stop = false;

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const t = max > 0 ? window.scrollY / max : 0;
      handle?.setScroll(Math.min(1, t * 3.2));
      const el = document.getElementById('portal');
      if (el) el.style.opacity = String(Math.max(0, 0.62 - t * 2.2));
    };
    const onMove = (e: PointerEvent) => {
      handle?.setPointer(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
    };

    void (async () => {
      try {
        const { createPortal } = await import('../three/portal');
        if (stop) return;
        handle = createPortal(canvas, { reduced, mobile });
        onScroll();
      } catch {
        /* fallback photographique */
      }
    })();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      stop = true;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onMove);
      handle?.destroy();
    };
  }, []);

  return (
    <div id="portal" aria-hidden="true">
      <canvas ref={ref} />
    </div>
  );
}
