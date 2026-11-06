import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Orchestrator-owned. The proxy matches contracts/api.md.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: ['..'] }, // lets web import ../contracts and ../demo JSON
    proxy: {
      '/api': 'http://localhost:8787',
      '/gallery': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
});
