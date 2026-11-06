import { Navigate, Link, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Office from '@/office/Office';

/**
 * /demo: the public, scripted office (Kesar & Co., made-up data, replayed in the browser from
 * demo/feeds/sale-demo.json). Office plays the local story when the URL has `?demo`.
 */
export default function Demo() {
  const { search } = useLocation();
  if (!new URLSearchParams(search).has('demo')) return <Navigate to="/demo?demo" replace />;
  return (
    <div className="fixed inset-0 overflow-hidden">
      <Office mode="live" />
      <Link
        to="/signup"
        className="fixed bottom-3 left-3 z-[60] inline-flex items-center gap-2 rounded-full bg-neutral-900 py-2 pr-3 pl-4 text-[13px] font-medium text-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] ring-2 ring-white/90 transition-transform hover:scale-[1.02] focus-visible:ring-saffron focus-visible:outline-none md:bottom-4 md:left-4"
      >
        <span className="hidden text-white/60 sm:inline">Demo with made-up data ·</span> Use it with your team <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
