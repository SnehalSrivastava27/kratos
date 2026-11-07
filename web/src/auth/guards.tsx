import { Suspense } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Logo } from '@/landing/ui';
import { AuthProvider, useAuth } from './AuthProvider';

/** Full-viewport placeholder while the session resolves or a page chunk loads. */
export function FullSkeleton() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-canvas" role="status" aria-label="Loading">
      <div className="flex flex-col items-center gap-5">
        <Logo className="animate-pulse motion-reduce:animate-none" />
        <div className="h-0.5 w-28 overflow-hidden rounded-full bg-black/[0.06]">
          <div className="h-full w-1/3 animate-[hq-load_1.1s_ease-in-out_infinite] rounded-full bg-saffron motion-reduce:animate-none" />
        </div>
      </div>
      <style>{'@keyframes hq-load{from{transform:translateX(-100%)}to{transform:translateX(300%)}}'}</style>
    </div>
  );
}

/** Layout route for every signed-in/out page: one AuthProvider shared across /login → /connect → /app. */
export function AuthRoot() {
  return (
    <AuthProvider>
      <Suspense fallback={<FullSkeleton />}>
        <Outlet />
      </Suspense>
    </AuthProvider>
  );
}

/** /login, /signup: already signed in → straight to the office. */
export function GuestOnly() {
  const { loading, user } = useAuth();
  const from = (useLocation().state as { from?: string } | null)?.from;
  if (loading) return <FullSkeleton />;
  return user ? <Navigate to={from ?? '/app'} replace /> : <Outlet />;
}

/** /connect links a real Telegram group: the read-only demo account goes back to its office. */
export function RealOnly() {
  return useAuth().demo ? <Navigate to="/app" replace /> : <Outlet />;
}

/** Needs a session; otherwise /login, coming back here afterwards. */
export function RequireAuth() {
  const { loading, user } = useAuth();
  const at = useLocation();
  if (loading) return <FullSkeleton />;
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: at.pathname + at.search }} />;
}
