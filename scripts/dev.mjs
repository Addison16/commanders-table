import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
if (existsSync('.env')) loadEnvFile('.env');
const env = { PUBLIC_ORIGIN: 'http://localhost:5173', ALLOW_INSECURE_HTTP: 'true', ...process.env };
const dev = spawn(
  'concurrently',
  ['-k', '-n', 'api,web', 'tsx watch src/server/index.ts', 'vite --host 0.0.0.0'],
  { env, stdio: 'inherit' },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => dev.kill(signal));
dev.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
