import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { buildApp } from './app.js';
import { readConfig } from './config.js';
if (existsSync('.env')) loadEnvFile('.env');
try {
  const config = readConfig();
  const { app } = await buildApp({ config });
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.info(`MTG Util listening on port ${config.port}; public origin ${config.publicOrigin}`);
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      void app.close().then(() => process.exit(0));
    });
} catch (e) {
  console.error(e instanceof Error ? e.message : 'Server startup failed');
  process.exitCode = 1;
}
