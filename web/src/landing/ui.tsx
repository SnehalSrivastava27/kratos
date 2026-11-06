import type { ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEPT, PEOPLE } from './data';

export const EASE = [0.22, 1, 0.36, 1] as const;

/** Fade-up once when scrolled into view. MotionConfig reducedMotion="user" drops the slide. */
export function Reveal({ delay = 0, y = 12, ...p }: HTMLMotionProps<'div'> & { delay?: number; y?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.55, ease: EASE, delay }}
      {...p}
    />
  );
}

/** The framed content column. Its edges line up with the page's vertical guide lines. */
export function Container({ className, ...p }: React.ComponentProps<'div'>) {
  return <div className={cn('mx-auto w-full max-w-[1264px] px-5 md:px-12', className)} {...p} />;
}

/** A full-bleed row with a hairline bottom border, like Supercut's section rows. */
export function Band({ className, ...p }: React.ComponentProps<'section'>) {
  return <section className={cn('relative border-b border-black/[0.07]', className)} {...p} />;
}

/** Two-tone heading: first phrase in foreground, second in muted. */
export function TwoTone({ a, b, className, stack, as: Tag = 'h2' }: { a: ReactNode; b: ReactNode; className?: string; stack?: boolean; as?: 'h1' | 'h2' | 'h3' }) {
  return (
    <Tag className={cn('font-medium tracking-tight text-balance', className)}>
      <span className={cn('text-foreground', stack && 'block')}>{a}</span> <span className={cn('text-dim', stack && 'block')}>{b}</span>
    </Tag>
  );
}

/** Small outlined saffron pill: icon + label + arrow (Supercut's "Capture →"). */
export function AccentPill({ href, Icon, children, className }: { href: string; Icon: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      className={cn(
        'group inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-saffron/45 bg-saffron/[0.07] px-3.5 text-sm font-medium text-saffron-ink transition-colors hover:bg-saffron/15 focus-visible:ring-3 focus-visible:ring-saffron/30 focus-visible:outline-none',
        className,
      )}
    >
      <Icon className="size-4" strokeWidth={1.8} />
      {children}
      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
    </a>
  );
}

/** Section intro row: two-tone title left; copy starts on the centre guide; pill on the right. */
export function SectionRow({ id, a, b, children, cta }: { id?: string; a: ReactNode; b: ReactNode; children: ReactNode; cta?: { href: string; Icon: LucideIcon; label: string } }) {
  return (
    <Band id={id} className="scroll-mt-16">
      <Container className="grid gap-5 py-14 md:grid-cols-2 md:gap-0 md:py-20">
        <Reveal>
          <TwoTone stack a={a} b={b} className="text-[28px] leading-[1.12] md:text-[36px]" />
        </Reveal>
        <Reveal delay={0.06} className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between md:gap-8 md:pl-8">
          <p className="max-w-[44ch] text-[17px] leading-[1.55] text-neutral-500 [&_b]:font-normal [&_b]:text-foreground">{children}</p>
          {cta && <AccentPill href={cta.href} Icon={cta.Icon}>{cta.label}</AccentPill>}
        </Reveal>
      </Container>
    </Band>
  );
}

const MATE_SIZE = { sm: ['size-6 rounded-md', 'size-3.5'], md: ['size-8 rounded-[9px]', 'size-[18px]'], lg: ['size-10 rounded-xl', 'size-5'] } as const;

/** A teammate's avatar: their Lucide line icon in their colour, on a soft tinted rounded square. */
export function MateIcon({ id, size = 'md', className }: { id: string; size?: keyof typeof MATE_SIZE; className?: string }) {
  const { Icon } = DEPT[id];
  const color = PEOPLE[id].color;
  return (
    <span className={cn('grid shrink-0 place-items-center', MATE_SIZE[size][0], className)} style={{ background: `${color}17`, color }}>
      <Icon className={MATE_SIZE[size][1]} strokeWidth={1.5} />
    </span>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-flex size-1.5', className)} aria-hidden="true">
      <span className="absolute inset-0 animate-ping rounded-full bg-saffron opacity-60 motion-reduce:hidden" />
      <span className="relative size-1.5 rounded-full bg-saffron" />
    </span>
  );
}

export { Logo } from '@/brand/Logo';
