import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The proxy matches contracts/api.md. Server port resolves exactly like server/src/index.ts
// (PORT ?? SERVER_PORT ?? 8787); WEB_PORT overrides 5173.
const api = `localhost:${process.env.PORT ?? process.env.SERVER_PORT ?? 8787}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    fs: { allow: ['..'] }, // lets web import ../contracts and ../demo JSON
    proxy: {
      '/api': `http://${api}`,
      '/gallery': `http://${api}`,
      '/ws': { target: `ws://${api}`, ws: true },
    },
  },
});
