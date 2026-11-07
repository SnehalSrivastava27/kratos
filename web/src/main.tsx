// Orchestrator-owned shell. Workers export components; they don't edit this file.
import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { BrowserRouter, Navigate, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AuthRoot, GuestOnly, RealOnly, RequireAuth } from './auth/guards';

// Routes are split so the landing page doesn't ship three.js unless it asks for it.
// Public: / (landing) and /demo (scripted office). Everything real sits behind a session (contracts/api.md v3).
const Landing = lazy(() => import('./landing/Landing'));
const Demo = lazy(() => import('./app/Demo'));
const AuthPage = lazy(() => import('./auth/AuthPage'));
const Connect = lazy(() => import('./auth/Connect'));
const AppShell = lazy(() => import('./app/AppShell'));

/** Old links: /office?demo → the public demo, /office → the private office. */
function OfficeRedirect() {
  return <Navigate to={new URLSearchParams(useLocation().search).has('demo') ? '/demo?demo' : '/app'} replace />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense fallback={<div className="min-h-svh bg-canvas" />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/office" element={<OfficeRedirect />} />
          <Route path="/signin" element={<Navigate to="/login" replace />} />
          <Route element={<AuthRoot />}>
            <Route element={<GuestOnly />}>
              <Route path="/login" element={<AuthPage mode="login" />} />
              <Route path="/signup" element={<AuthPage mode="signup" />} />
            </Route>
            <Route element={<RequireAuth />}>
              <Route element={<RealOnly />}><Route path="/connect" element={<Connect />} /></Route>
              <Route path="/app" element={<AppShell />} />
              <Route path="/app/:ws" element={<AppShell />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  </React.StrictMode>
);
