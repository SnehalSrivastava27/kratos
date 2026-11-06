// KRATOS brand mark and lockup as inline SVG (pure vector, no font). Generated from the brand
// geometry: a stem plus a detached chevron whose lower leg is saffron, a teammate stepping forward.
// Ink parts use currentColor, so set the colour with a text-* class. Static assets: /brand/*.svg.
import { cn } from '@/lib/utils';

const SAFFRON = '#F4A300';
const MARK = (
  <>
    <path d="M0 0H14V48H0Z" fill="currentColor" />
    <path d="M18 24H33.75L50 0H34.25Z" fill="currentColor" />
    <path d="M18 24H33.75L50 48H34.25Z" fill={SAFFRON} />
  </>
);
const LOCKUP_W = 203.46;

export function Logo({ variant = 'lockup', className, label = 'Kratos' }: {
  variant?: 'mark' | 'lockup'; className?: string; /** '' = decorative (aria-hidden). */ label?: string;
}) {
  const lockup = variant === 'lockup';
  return (
    <svg
      viewBox={`0 0 ${lockup ? LOCKUP_W : 50} 48`}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      className={cn('h-6 w-auto shrink-0 text-foreground', className)}
    >
      {MARK}
      {lockup && (
        // KRATOS wordmark: geometric caps, cap height 24 centred on the mark
        <g transform="translate(66 12) scale(0.6)">
          <g><path d="M0 0L7.8 0L7.8 40L0 40Z" fill="currentColor" /><path d="M10.4 20L19.37 20L29.8 0L20.82 0Z" fill="currentColor" /><path d="M10.4 20L19.37 20L29.8 40L20.82 40Z" fill="currentColor" /></g>
          <g transform="translate(39.1 0)"><path d="M0 0L7.8 0L7.8 40L0 40Z" fill="currentColor" /><path d="M3.9 3.9H17.6A7.3 7.3 0 0 1 17.6 18.5H3.9" fill="none" stroke="currentColor" strokeWidth="7.8" /><path d="M11.65 22.4L20.55 22.4L29.35 40L20.45 40Z" fill="currentColor" /></g>
          <g transform="translate(75.4 0)"><path d="M0 40L17.2 0L34.4 40L25.91 40L17.2 19.75L8.49 40Z" fill="currentColor" /></g>
          <g transform="translate(115.3 0)"><path d="M0 0L29.6 0L29.6 7.8L0 7.8Z" fill="currentColor" /><path d="M10.9 0L18.7 0L18.7 40L10.9 40Z" fill="currentColor" /></g>
          <g transform="translate(152.4 0)"><ellipse cx="20.4" cy="20" rx="16.5" ry="16.7" fill="none" stroke="currentColor" strokeWidth="7.8" /></g>
          <g transform="translate(202.7 0)"><path d="M20.99 8.81A8.4 7.85 0 1 0 13.2 19.6A9.3 8.25 0 1 1 4.58 30.94" fill="none" stroke="currentColor" strokeWidth="7.8" /></g>
        </g>
      )}
    </svg>
  );
}
