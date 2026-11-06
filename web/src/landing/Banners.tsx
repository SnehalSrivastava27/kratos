/// <reference types="vite/client" />
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
// The Designer's real banners (1080×1080 HTML). Inlined with srcDoc so they render without the API server.
import hero from '../../../gallery/hero.html?raw';
import serum from '../../../gallery/serum.html?raw';
import glowkit from '../../../gallery/glowkit.html?raw';

export const BANNERS = [
  { id: 'hero', title: 'Festive Sale · 30% off', html: hero },
  { id: 'serum', title: 'Vitamin C Serum spotlight', html: serum },
  { id: 'glowkit', title: 'Glow Kit bundle card', html: glowkit },
];

/** A 1080×1080 banner scaled to fit its (square) box. */
export function Banner({ html, title, className }: { html: string; title: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / 1080));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className={cn('relative aspect-square overflow-hidden rounded-lg bg-[#FBF1E3]', className)}>
      {scale > 0 && (
        <iframe
          srcDoc={html}
          title={title}
          sandbox=""
          loading="lazy"
          tabIndex={-1}
          className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
          style={{ width: 1080, height: 1080, transform: `scale(${scale})` }}
        />
      )}
    </div>
  );
}
