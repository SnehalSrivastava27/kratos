// Orchestrator-owned shell. Workers export components; they don't edit this file.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './landing/Landing';
import Office from './office/Office';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/office" element={<Office mode="live" />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
