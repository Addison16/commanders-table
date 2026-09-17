# Deployment and maintenance

The same Node process serves the app, API, and WebSockets. Use one instance with one SQLite database on local disk. Static hosting alone cannot provide shared rooms. The Docker image runs as UID 1000 (`node`) and listens on `0.0.0.0:8080`; a named volume initializes `/data` with the correct ownership.

## Configuration

| Variable              | Default                                     | Meaning                                                                            |
| --------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `PUBLIC_ORIGIN`       | `http://localhost:8080`                     | Exact browser origin, including a nonstandard port; no path, credentials, or query |
| `ALLOW_INSECURE_HTTP` | `false` in the server/image                 | Must explicitly be `true` for local/LAN HTTP; must be `false` for HTTPS            |
| `PORT`                | `8080`                                      | HTTP listen port; retain 8080 inside the image for its health check                |
| `DATA_DIR`            | `.mtg-data` locally, `/data` in Docker      | SQLite database and sidecars                                                       |
| `ROOM_TTL_DAYS`       | `30`                                        | Days since last committed room activity                                            |
| `SESSION_TTL_DAYS`    | `90`                                        | Rolling guest-cookie/session lifetime                                              |
| `TRUST_PROXY_HOPS`    | `0`                                         | Number of trusted reverse-proxy hops, 0–5                                          |
| `MTG_IMAGE`           | `ghcr.io/addison16/commanders-table:latest` | Pull-based image; use a version or digest to pin a release                         |

Development uses port 5173 through Vite. The Compose examples deliberately default to local HTTP with `ALLOW_INSECURE_HTTP=true`; these examples do not change the server's secure default. `.env.example` is a development example. Set the actual origin explicitly when using it with a production server or Compose.

Do not alternate between localhost, a numeric IP, and a domain while expecting the same browser state. Origin checks also reject shared commands sent from an unconfigured alias. Use a stable hostname where practical. Guest cookies, local games, and installed-app storage are scoped by browser rules; exports move game data, not authority.

## Start a locally built image

```sh
PUBLIC_ORIGIN=http://localhost:8080 ALLOW_INSECURE_HTTP=true \
  docker compose -p mtg-util -f compose.local.yaml up -d --build
docker compose -p mtg-util -f compose.local.yaml ps
curl --fail http://localhost:8080/api/health
```

For LAN phones, substitute the server's reachable address, for example `http://192.168.1.50:8080`, in `PUBLIC_ORIGIN`, and open that exact URL everywhere. QR codes include this address. Core play works over deliberate LAN HTTP; use HTTPS for installation/offline reopening and supported secure-context enhancements. Only expose this service to networks you intend to use.

The volume is `mtg-util_mtg-util-data` when using the project name above. Keep both the project name and volume when recreating containers. `docker compose down` preserves the volume; `down -v` deletes server games and identities. Browser-local games are separate.

If using a bind mount instead, prepare a local directory writable by container UID/GID 1000. Do not put the live SQLite database on NFS/SMB. SQLite WAL needs its sidecars on the same local filesystem.

## HTTPS through a proxy

Use [Caddyfile.example](Caddyfile.example) with your actual domain on a host where Caddy can reach `127.0.0.1:8080`. Point the domain to the host and obtain a trusted certificate through your proxy. Start the app with:

```sh
PUBLIC_ORIGIN=https://table.example.com ALLOW_INSECURE_HTTP=false TRUST_PROXY_HOPS=1 \
  docker compose -p mtg-util -f compose.local.yaml up -d --build
```

Caddy's `reverse_proxy` forwards WebSocket upgrades. For another proxy, retain the original Host/Origin, forward upgrades, and allow long-lived connections. HTTPS clients automatically use `wss://`. Set trusted hops to match the actual proxy chain, and restrict direct access to the backend port when public traffic should pass through the proxy. The sample Caddy address assumes the proxy runs on the host; a proxy container needs a shared network and service hostname instead.

HTTPS cookies are Secure, HttpOnly, SameSite=Lax, and host-only. Contradictory HTTP/HTTPS cookie configuration fails at startup. Production responses include CSP and framing/content-type protections. API responses are private `no-store`; hashed assets are immutable; HTML and service-worker files revalidate.

`npm run test:proxy` tests secure cookie attributes, configured join URLs, CSRF/origin protection, and an actual WSS update using an ephemeral self-signed local proxy. It requires a production build and OpenSSL. Trust a real certificate on phones for deployment; the smoke certificate is only for the test.

## Back up

The app's JSON export backs up a game, without credentials or installation identity. A server backup includes room snapshots, guest credential hashes, memberships, and deduplication records; treat it as private operational data. It does not contain browser-local games.

For a non-container server:

```sh
npm run backup -- ./backups/before-update.sqlite
```

Use the same `DATA_DIR` as the running server. The backup command uses SQLite's online backup API, validates the result with `integrity_check`, and refuses to overwrite an existing destination.

For the locally built Compose deployment:

```sh
docker compose -p mtg-util -f compose.local.yaml exec mtg-util \
  node scripts/backup.mjs /data/backups/before-update.sqlite
mkdir -p backups
docker compose -p mtg-util -f compose.local.yaml cp \
  mtg-util:/data/backups/before-update.sqlite ./backups/before-update.sqlite
```

Choose a fresh filename for each backup and keep a copy off the server. Do not copy only a live `mtg-util.sqlite` file: committed data may still be in its WAL. Copying all database files is appropriate only after a controlled shutdown; the online backup command handles this while the server runs.

## Restore a verified backup

Restoring replaces server state with the backup's point in time. Save a fresh backup first, and stop every app process using the volume. The following restores the file copied above; it validates the backup, stages a copy, clears stopped-database sidecars, and installs the staged file. Use the same application version that created the backup or a compatible newer version.

```sh
docker compose -p mtg-util -f compose.local.yaml stop
docker compose -p mtg-util -f compose.local.yaml run --rm --no-deps \
  --entrypoint node -v "$PWD/backups:/restore:ro" mtg-util -e '
    const fs = require("node:fs");
    const Database = require("better-sqlite3");
    const source = "/restore/before-update.sqlite";
    const db = new Database(source, { readonly: true, fileMustExist: true });
    if (db.pragma("integrity_check", { simple: true }) !== "ok") throw Error("Invalid backup");
    db.close();
    fs.copyFileSync(source, "/data/mtg-util.sqlite.restore");
    for (const suffix of ["-wal", "-shm"]) fs.rmSync("/data/mtg-util.sqlite" + suffix, { force: true });
    fs.renameSync("/data/mtg-util.sqlite.restore", "/data/mtg-util.sqlite");
  '
docker compose -p mtg-util -f compose.local.yaml start
curl --fail http://localhost:8080/api/health
```

For the published-image deployment, use `compose.yaml` in all commands and keep `MTG_IMAGE` and origin configuration set. For non-container restoration, stop Node, validate the backup, replace the stopped database and sidecars in `DATA_DIR`, then restart. Never run the restore against an active database.

Open a previously joined browser and confirm its room, seat, and game. Existing guest cookies remain usable if their matching sessions were in the backup and have not expired. Restoring cannot recover cookies missing from the browser. A backup from before a new room/member was created does not contain that room/member.

## Update

1. Make and copy out a verified server backup; export any important browser-local game separately.
2. For a local build, update the source and run `docker compose -p mtg-util -f compose.local.yaml up -d --build` with the same origin configuration. For a published image, set `MTG_IMAGE` to the chosen immutable version, then `docker compose -p mtg-util -f compose.yaml pull` and `docker compose -p mtg-util -f compose.yaml up -d`.
3. Check `/api/health`, reconnect a room, and confirm the saved game. Clients receive an update prompt after the new service worker is available. Apply it when ready; the app does not force a mid-game reload.

Migrations execute in transactions. An older app refuses a newer database schema, so a rollback may need the matching pre-update backup. Retaining a mutable `latest` tag is convenient for discovery; pin a version or digest for controlled updates.

## Verification and image publication

```sh
docker build -t mtg-util:local .
node scripts/container-smoke.mjs mtg-util:local
```

The smoke test uses temporary containers and a private named volume, checks non-root execution/native SQLite/health/assets, creates and updates a room, recreates its container, retries the same operation, and verifies a live backup and stopped restore. It cleans up its own test resources.

The main Dockerfile supports amd64 and arm64. CI uses native `ubuntu-24.04` and `ubuntu-24.04-arm` runners to build and run the smoke test. On this development machine, amd64 passed natively and ARM64 Node plus its compiled SQLite addon passed using QEMU. The optional fallback recipe used was:

```sh
docker build -f tests/deployment/Dockerfile.arm64-smoke -t mtg-util:arm64-smoke .
SMOKE_QEMU=/usr/local/bin/qemu-aarch64-static \
  node scripts/container-smoke.mjs mtg-util:arm64-smoke
```

This fallback is an emulation-only verification image, not the published runtime. It needs neither privileged binfmt installation nor changes to host packages. The [v0.1.0 release gate](https://github.com/Addison16/commanders-table/actions/runs/35163473158) also passed native amd64 and arm64 container checks on GitHub's Ubuntu runners.

## Publishing a release

Source is published at `Addison16/commanders-table`, with public images at `ghcr.io/addison16/commanders-table`. The workflow uses the repository owner's lowercase name, so a fork publishes under its own owner. Set `MTG_IMAGE` when consuming a fork's image. No Docker Hub account or stored registry password is needed: the workflow uses GitHub's scoped `GITHUB_TOKEN`.

For a new fork, enable GitHub Actions and verify its image configuration before publishing. The initial release used:

```sh
git tag v0.1.0
git push origin v0.1.0
```

For subsequent releases, update the package and lockfile together, add notes under `docs/releases/vX.Y.Z.md`, commit, and tag that commit:

```sh
npm version 0.1.1 --no-git-tag-version
node scripts/check-release.mjs v0.1.1
git add package.json package-lock.json docs/releases/v0.1.1.md
git commit -m "Release v0.1.1"
git tag v0.1.1
git push origin main v0.1.1
```

Release validation rejects a tag that differs from the package/lockfile version or lacks a source license. The same reusable verification workflow runs on PRs, `main`, and releases: lint, types, domain/storage/server tests, Chromium/WebKit, production PWA/HTTPS checks, and native container smoke tests for both architectures. Only a passing release builds and pushes the combined image, creates GitHub release notes, and attaches the Compose/environment files. Official actions are pinned to verified release commits. A failed release can be rerun; publication does not alter the running server.

Each release publishes a version tag and a full commit `sha-…` tag. Stable versions also update `stable` and `latest`; prereleases such as `v0.2.0-rc.1` do not move those aliases. Users pull the updated tag and recreate their container while keeping the same volume and origin, or use their Docker manager's update controls. Automatic unattended restarts require an updater configured by that server's operator.

The Commander's Table package is public, and its unauthenticated pull has been verified. For a new package or fork, check its visibility after the first image publishes. If it is private, open the package's settings, select **Change visibility → Public**, and confirm. Subsequent versions keep the package's visibility. See [GitHub's package visibility documentation](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility#configuring-visibility-of-packages-for-your-personal-account).

Releases attach `compose.yaml` and `docker.env.example`. Copy the latter to `.env` before configuring the origin and starting Compose. The source file remains `.env.docker.example`; the workflow gives the download a visible filename that GitHub preserves.

Verify both platform manifests and an unauthenticated pull before announcing availability. The digest in each GitHub release identifies the exact published image. Users can download the source ZIP/tarball directly from the release without installing Git.
