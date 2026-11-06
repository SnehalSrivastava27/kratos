// Lazy-loaded by Hero so three.js never blocks first paint.
import Office from '@/office/Office';
import { saleDemo } from './data';

export default function HeroOffice() {
  return <Office mode="autoplay" feed={saleDemo} />;
}
