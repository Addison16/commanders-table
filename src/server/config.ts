import { resolve } from 'node:path';
export type Config = {
  port: number;
  dataDir: string;
  publicOrigin: string;
  secure: boolean;
  roomTtlDays: number;
  sessionTtlDays: number;
  trustProxy: number;
  production: boolean;
};
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const origin = new URL(env.PUBLIC_ORIGIN ?? 'http://localhost:8080');
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw new Error('PUBLIC_ORIGIN must be a plain http(s) origin with no path, credentials or query.');
  const insecure = env.ALLOW_INSECURE_HTTP === 'true';
  if (origin.protocol === 'http:' && !insecure)
    throw new Error(
      'HTTP requires ALLOW_INSECURE_HTTP=true for deliberate local/LAN use. Use HTTPS for public deployments.',
    );
  if (origin.protocol === 'https:' && insecure)
    throw new Error('Set ALLOW_INSECURE_HTTP=false when PUBLIC_ORIGIN uses HTTPS.');
  const integer = (value: string | undefined, fallback: number, max: number) => {
    const n = Number(value ?? fallback);
    if (!Number.isInteger(n) || n < 1 || n > max) throw new Error('Invalid port or retention configuration');
    return n;
  };
  const trustProxy = Number(env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 5)
    throw new Error('TRUST_PROXY_HOPS must be 0–5');
  return {
    port: integer(env.PORT, 8080, 65535),
    dataDir: resolve(env.DATA_DIR ?? '.mtg-data'),
    publicOrigin: origin.origin,
    secure: origin.protocol === 'https:',
    roomTtlDays: integer(env.ROOM_TTL_DAYS, 30, 3650),
    sessionTtlDays: integer(env.SESSION_TTL_DAYS, 90, 3650),
    trustProxy,
    production,
  };
}
