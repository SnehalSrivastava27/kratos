// Starts the built prod server on :8803, runs smoke.mjs against it, stops the server. Needs `npm run build` first.
import { spawn } from 'node:child_process';

const PORT = process.env.E2E_PORT ?? '8803';
const BASE_URL = `http://127.0.0.1:${PORT}`;
const root = new URL('..', import.meta.url);
const server = spawn(process.execPath, ['server/dist/index.js'], { cwd: root, env: { ...process.env, PORT }, stdio: 'inherit' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let code = 1;
try {
  let up = false;
  for (let i = 0; i < 40 && !up && server.exitCode === null; i++) {
    up = await fetch(`${BASE_URL}/api/health`).then((r) => r.ok, () => false);
    if (!up) await sleep(250);
  }
  if (!up) throw new Error(`server did not come up on ${BASE_URL}`);
  const smoke = spawn(process.execPath, ['e2e/smoke.mjs'], { cwd: root, env: { ...process.env, BASE_URL }, stdio: 'inherit' });
  code = await new Promise((r) => smoke.on('exit', (c) => r(c ?? 1)));
} catch (e) {
  console.error(e.message);
} finally {
  server.kill('SIGTERM');
}
process.exit(code);
