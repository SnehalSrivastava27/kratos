// Orchestrator-owned shell. Workers export components; they don't edit this file.
import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';

// Routes are split so the landing page doesn't ship three.js unless it asks for it.
const Landing = lazy(() => import('./landing/Landing'));
const Office = lazy(() => import('./office/Office'));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense fallback={<div className="min-h-svh bg-background" />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/office" element={<Office mode="live" />} />
        </Routes>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  </React.StrictMode>
);
