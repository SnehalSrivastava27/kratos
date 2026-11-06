// Lazy-loaded by Hero so three.js never blocks first paint.
import type { ComponentType } from 'react';
import Office from '@/office/Office';
import type { OfficeEvent } from '@/shared/types';
import { saleDemo } from './data';

// framing/onReady are the office's hero props (P1); older builds ignore them, hence the loose type.
const O = Office as ComponentType<{ mode: 'autoplay'; feed: OfficeEvent[]; framing?: 'hero'; onReady?: () => void }>;

export default function HeroOffice({ onReady }: { onReady: () => void }) {
  // An office build without onReady never fires it, so the clean poster simply stays up.
  return <O mode="autoplay" feed={saleDemo} framing="hero" onReady={onReady} />;
}
