import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
assert.match(
  tag ?? '',
  /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/,
  'Release a tag such as v0.1.0 or v0.2.0-rc.1.',
);
assert.equal(tag, `v${pkg.version}`, 'The release tag must match package.json.');
assert.equal(lock.version, pkg.version, 'Update package-lock.json with the release version.');
assert.equal(lock.packages[''].version, pkg.version, 'The lockfile root version must match.');
assert.ok(pkg.license && pkg.license !== 'UNLICENSED', 'Choose a source license before publication.');
assert.ok(readFileSync(new URL('../LICENSE', import.meta.url), 'utf8').trim(), 'A license file is required.');
console.info(`Release ${tag} matches the package, lockfile, and source license.`);
