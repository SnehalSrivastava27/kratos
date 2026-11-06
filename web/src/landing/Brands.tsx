import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import channels from '../../../data/channels.csv?raw';

// Logos in web/public/brands (credits: CREDITS.md). Simple Icons files are monochrome paths, painted with a CSS mask.
const share = Object.fromEntries(channels.trim().split('\n').slice(1).map((l) => { const c = l.split(','); return [c[0], Math.round(+c[2] * 100)]; }));
const tip = (channel: string, label = channel) => `${label} · ${share[channel]}% of Kesar’s orders`;

/** A monochrome Simple Icons mark in its brand colour. */
export function Mark({ name, color, className }: { name: string; color: string; className?: string }) {
  const url = `url(/brands/${name}.svg)`;
  return <span aria-hidden="true" className={cn('inline-block size-6 shrink-0', className)} style={{ background: color, maskImage: url, WebkitMaskImage: url, maskSize: 'contain', WebkitMaskSize: 'contain', maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat', maskPosition: 'center' } as CSSProperties} />;
}

const Img = ({ src, h, alt }: { src: string; h: string; alt: string }) => <img src={`/brands/${src}`} alt={alt} className={cn('w-auto', h)} draggable={false} />;
const Word = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => <span className="text-[19px] font-semibold tracking-tight text-foreground md:text-[22px]" style={style}>{children}</span>;

// Equal optical height: ~28px desktop, ~22px mobile.
const LOGOS: { key: string; tip: string; logo: ReactNode }[] = [
  { key: 'shopify', tip: tip('Brand website (Shopify)', 'Brand website'), logo: <><Mark name="shopify" color="#7AB55C" className="size-[22px] md:size-[26px]" /><Word>Shopify</Word></> },
  { key: 'amazon', tip: tip('Marketplaces'), logo: <Img src="amazon.svg" h="h-[22px] md:h-[28px] translate-y-[3px]" alt="Amazon" /> },
  { key: 'flipkart', tip: tip('Marketplaces'), logo: <Img src="flipkart.svg" h="h-[27px] md:h-[32px]" alt="Flipkart" /> },
  { key: 'myntra', tip: tip('Marketplaces'), logo: <><Img src="myntra.png" h="h-[20px] md:h-[24px]" alt="" /><Word>Myntra</Word></> },
  { key: 'nykaa', tip: tip('Beauty marketplaces'), logo: <Img src="nykaa.svg" h="h-[20px] md:h-[25px]" alt="Nykaa" /> },
  { key: 'purplle', tip: tip('Beauty marketplaces'), logo: <Word style={{ color: '#7A2C8F', fontWeight: 700, letterSpacing: '-0.02em' }}>purplle</Word> },
  { key: 'blinkit', tip: tip('Quick commerce'), logo: <Img src="blinkit.svg" h="h-[30px] md:h-[36px] rounded-[7px]" alt="Blinkit" /> },
  { key: 'zepto', tip: tip('Quick commerce'), logo: <Img src="zepto.svg" h="h-[20px] md:h-[25px]" alt="Zepto" /> },
  { key: 'instamart', tip: tip('Quick commerce'), logo: <><Mark name="swiggy" color="#FC8019" className="size-[22px] md:size-[26px]" /><Word>Instamart</Word></> },
  { key: 'meta', tip: 'Meta Ads · where the Ads Lead runs campaigns', logo: <><Mark name="meta" color="#0467DF" className="size-[22px] md:size-[26px]" /><Word>Meta</Word></> },
  { key: 'instagram', tip: 'Instagram · creator and ad placements', logo: <><Mark name="instagram" color="#FF0069" className="size-[20px] md:size-[24px]" /><Word>Instagram</Word></> },
  { key: 'youtube', tip: 'YouTube · creator videos', logo: <><Mark name="youtube" color="#FF0000" className="size-[22px] md:size-[26px]" /><Word>YouTube</Word></> },
];

function Logo({ tip, logo, dup }: { tip: string; logo: ReactNode; dup?: boolean }) {
  return (
    <span className="group/logo relative flex shrink-0 items-center outline-none" tabIndex={dup ? -1 : 0} aria-label={dup ? undefined : tip}>
      <span className="flex h-7 items-center gap-2 opacity-55 grayscale transition duration-300 group-hover/logo:opacity-100 group-hover/logo:grayscale-0 group-focus-visible/logo:opacity-100 group-focus-visible/logo:grayscale-0">{logo}</span>
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 mb-2.5 -translate-x-1/2 translate-y-1 rounded-md bg-foreground px-2 py-1 text-[11.5px] whitespace-nowrap text-white opacity-0 shadow-sm transition duration-200 group-hover/logo:translate-y-0 group-hover/logo:opacity-100 group-focus-visible/logo:translate-y-0 group-focus-visible/logo:opacity-100">{tip}</span>
    </span>
  );
}

/** Sales channels as a calm, infinite logo marquee. Pauses on hover; a static wrap when the OS asks for less motion. */
export function BrandMarquee() {
  const reduce = useReducedMotion();
  if (reduce) return <div className="flex flex-wrap items-center gap-x-8 gap-y-5">{LOGOS.map(({ key, ...l }) => <Logo key={key} {...l} />)}</div>;
  const row = (dup: boolean) => LOGOS.map((l) => <span key={l.key + dup} className="pr-11" aria-hidden={dup || undefined}><Logo tip={l.tip} logo={l.logo} dup={dup} /></span>);
  return (
    // the top padding gives the tooltips room inside the clipping mask
    <div className="relative -mt-10 overflow-hidden pt-10 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      <div className="flex w-max animate-marquee items-center hover:[animation-play-state:paused]">{row(false)}{row(true)}</div>
    </div>
  );
}


const CHAT_APPS = [
  { key: 'whatsapp', name: 'WhatsApp', logo: <Mark name="whatsapp" color="#25D366" className="size-[0.95em]" /> },
  { key: 'telegram', name: 'Telegram', logo: <Mark name="telegram" color="#26A5E4" className="size-[0.95em]" /> },
  { key: 'slack', name: 'Slack', logo: <img src="/brands/slack.svg" alt="" className="size-[0.9em]" draggable={false} /> },
];

/** Inline "the [chat app] you already use": rotates WhatsApp → Telegram → Slack, logo + name. */
export function ChatAppRotator({ every = 2200 }: { every?: number }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(1); // start on Telegram, the one that's live today
  const sizer = useRef<HTMLSpanElement>(null);
  const [widths, setWidths] = useState<number[]>([]);
  // Measure every name as the browser really renders it (font, size, zoom), and re-measure on resize/font load.
  useLayoutEffect(() => {
    const el = sizer.current;
    if (!el) return;
    const measure = () => setWidths([...el.children].map((c) => Math.ceil((c as HTMLElement).getBoundingClientRect().width)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setI((n) => (n + 1) % CHAT_APPS.length), every);
    return () => clearInterval(t);
  }, [reduce, every]);
  const k = reduce ? 1 : i;
  const app = CHAT_APPS[k];
  const row = 'inline-flex items-center gap-[0.3em] font-normal whitespace-nowrap';
  return (
    <span className="relative inline-block h-[1lh] align-top" aria-label="WhatsApp, Telegram or Slack">
      {/* invisible copies, used only to measure each name's real width */}
      <span ref={sizer} aria-hidden="true" className="pointer-events-none invisible absolute top-0 left-0 flex flex-col items-start">
        {CHAT_APPS.map((a) => <span key={a.key} className={row}>{a.logo}{a.name}</span>)}
      </span>
      <motion.span
        className="relative inline-flex h-[1lh] overflow-hidden align-top" // exactly one line box tall, so the name sits on the sentence baseline
        initial={false}
        animate={{ width: widths[k] ? widths[k] + 2 : 'auto' }}
        transition={{ duration: reduce ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={app.key}
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            exit={{ y: '-100%', opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className={`absolute inset-y-0 left-0 text-foreground ${row}`}
            aria-hidden="true"
          >
            {app.logo}
            {app.name}
          </motion.span>
        </AnimatePresence>
      </motion.span>
    </span>
  );
}
