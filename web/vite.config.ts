import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The proxy matches contracts/api.md. Server port resolves exactly like server/src/index.ts
// (PORT ?? SERVER_PORT ?? 8787); WEB_PORT overrides 5173.
const api = `localhost:${process.env.PORT ?? process.env.SERVER_PORT ?? 8787}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    fs: { allow: ['..'] }, // lets web import ../contracts and ../demo JSON
    // xfwd: the server sees the real client in X-Forwarded-For, so `vite --host` can't make a phone or
    // another laptop look like this Mac (office actions trust only local hops; reads stay open).
    proxy: {
      '/api': { target: `http://${api}`, xfwd: true },
      '/gallery': { target: `http://${api}`, xfwd: true },
      '/ws': { target: `ws://${api}`, ws: true, xfwd: true },
    },
  },
});
