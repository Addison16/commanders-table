import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { loadEnvFile } from 'node:process';
if (existsSync('.env')) loadEnvFile('.env');
const source = resolve(process.env.DATA_DIR ?? '.mtg-data', 'mtg-util.sqlite');
const destination = resolve(
  process.argv[2] ??
    join(
      process.env.DATA_DIR ?? '.mtg-data',
      'backups',
      `mtg-util-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`,
    ),
);
if (source === destination || existsSync(destination))
  throw new Error('Choose a new backup filename; existing files are never overwritten.');
mkdirSync(dirname(destination), { recursive: true });
const db = new Database(source, { readonly: true, fileMustExist: true });
try {
  await db.backup(destination);
  const copy = new Database(destination, { readonly: true });
  try {
    if (copy.pragma('integrity_check', { simple: true }) !== 'ok')
      throw new Error('Backup integrity check failed');
  } finally {
    copy.close();
  }
  console.info(`Verified SQLite backup: ${destination}`);
} finally {
  db.close();
}
