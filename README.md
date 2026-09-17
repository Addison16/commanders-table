# Commander's Table

A mobile-first companion for a physical Magic table. Track one to eight players on **One device**, or create a **Shared room** and invite friends by code, link, or QR. No accounts and no installation required.

Get the [latest release](https://github.com/Addison16/commanders-table/releases/latest) or follow the [Docker setup](#docker) to host your own table.

**Source-available for noncommercial use:** free to use, modify, and share under the [PolyForm Noncommercial License 1.0.0](LICENSE). Commercial use is not licensed. See [licensing](#publication-and-project-scope) for the scope and earlier releases.

Commander damage belongs to individual commanders, including partners and your own commanders. Life, poison, cast counts, optional turns, timers, dice, and first-player selection share the same game model in both modes. Warnings are reminders; elimination and rules decisions stay with the players.

| Four-player table                                             | Eight-player table                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------- |
| ![Actual four-player board](docs/screenshots/four-player.png) | ![Actual eight-player board](docs/screenshots/eight-player.png) |

## Run locally

Use **Node 24 LTS** (`.nvmrc`) and npm. A compiler toolchain (Python 3, make, and a C++ compiler on Linux) is needed if the native SQLite dependency cannot use a prebuilt binary.

```sh
npm ci
npm run dev
```

Open **http://localhost:5173**. This starts Vite and the API server together; Vite proxies HTTP and WebSockets to port 8080. Application data goes in ignored `.mtg-data/`. Docker is optional.

For phones on the same network, replace the example address with your computer's LAN IP:

```sh
PUBLIC_ORIGIN=http://192.168.1.50:5173 ALLOW_INSECURE_HTTP=true npm run dev
```

Open **that exact address** on the computer and every phone. A phone's `localhost` refers to the phone. Allow port 5173 through your local firewall if needed; the development proxy uses API port 8080 internally. Avoid exposing a development server publicly.

To run a production build without Docker:

```sh
npm run build
PUBLIC_ORIGIN=http://localhost:8080 ALLOW_INSECURE_HTTP=true npm start
```

`npm start` serves both the built frontend and backend at port 8080. Optional configuration can be copied from `.env.example` to `.env`; explicit environment variables take precedence. The example `.env` uses **5173 for development**: change `PUBLIC_ORIGIN` to the actual production address before starting or sharing a room.

## Play

- Choose **Quick 4 · 40 life**, **Quick 2 · 20 life**, or customize a table. Tap life controls or hold to repeat. Open a player's name for **Edit player & commanders**, exact values, poison, commander tools, and rotation. **Save changes** saves the player name, color and commander names/artwork together; Undo restores the whole edit. Recorded damage and casts stay intact. Undo groups an uninterrupted hold while each increment is saved immediately.
- For a phone in the middle of four players, choose **Game menu → Table layout → Shared table** and lay it sideways. The top two counters face the far side, the bottom two face you, and larger +/− areas are easy to reach. This preference stays on your phone; individual seats can still be flipped in their details. Choose **All facing me** to return to the original layout.
- To share, choose **Create room**, choose a table size, and open **Live room** for the code and QR. Friends enter their name, choose their own player name and one or two commanders in the lobby, then request a seat. The host previews their choices and taps **Approve seat**; the names appear on everyone's board without resetting any totals. Commander names can be left for later, and commander fields stay hidden when those tools are off. Pending choices survive refresh and can be revised with **Update request**. Pending guests cannot see the game.
- Hosts control every seat. Approved guests control their own numerical trackers, player name, and commander labels, and can roll dice. The host may enable **Friends can edit every seat** for numerical adjustments; this does not grant administration or another player's name edits. **My seat** makes a guest's controls larger.
- **Commander artwork** is optional in setup, joining, and **Edit player & commanders**. Type a name and choose a suggested card, or paste a Scryfall card link and tap **Find artwork**. During play, tap **Save changes** to save the selected art with the rest of the player details; partners share the panel. Artwork follows approved guests, saved games and rematches. **Remove artwork** restores the plain background after saving. Player details show artist credits and a link to the full card. Manual names still work without artwork or internet.
- **Utilities** rolls polished 3D dice over the life-counter board, with rounded edges/corners, subtle grain and engraved numbers. **Roll for** matches the pearl body to a player’s seat color; local rolls default to the last player saved or selected, and shared guests default to their own seat. Table rolls keep the original ivory finish. Rerolls, percentile pairs and replays keep the selected player. The result face lands centered and upright. Each player gets a matching colored die in **d20 for everyone**; tied leaders roll again before the starting player is revealed. Every approved room member can roll for the table. Results are saved before animation; skipping or reopening a result never rolls again. Sound effects add a dice clatter; **Display & preferences → Test dice sound** previews it.
- **Turn tracking** is off by default. Enable it in Utilities to show a compact **Next turn** button beside Undo; shared turn controls belong to the host. The game timer is also in Utilities. The former Extra trackers section has been removed.
- **New game** asks **One phone** or **Multiple phones** again. Tap the **Commander's Table** logo for Home and the last ten unfinished local/shared games. **Resume** reopens the original local game with its names, totals, and history, or reconnects to a shared room using the current guest cookie.
- **End game** returns everyone to the starting options after the ending is saved. **Recently ended** keeps up to ten recent games available for 24 hours. **Reopen** restores the original totals, damage, commanders and history; the timer stays paused. In shared rooms, only the host can reopen play, and existing seat assignments remain intact. **View final game** lets you inspect a finished game and still use its dice. Starting another game does not remove the recovery entry. Expired recovery entries disappear; existing archives and server retention remain separate.
- **Game menu** also offers history, settings, export/import, rematch, and archived local games. A rematch keeps room assignments and seat identities. A new shared setup creates a new room; previous unfinished rooms stay resumable. Local archives and the unfinished-game list are each bounded to ten stored entries.

If a shared connection drops, new edits pause. Reconnecting accounts for already-submitted actions before enabling controls. **Continue a copy on this device** forks the last confirmed game into independent local play; it never merges back into the room.

## What is remembered

| Data                                          | Location and lifetime                                                |
| --------------------------------------------- | -------------------------------------------------------------------- |
| Local game, ten recent games, preferences     | IndexedDB in this browser at this exact scheme, host, and port       |
| Shared games, memberships, operation receipts | Server SQLite volume; inactive rooms expire after 30 days by default |
| Guest authority                               | Persistent HttpOnly cookie with a rolling 90-day lifetime by default |
| Local installation ID                         | Random organizational ID; never a login or room credential           |

Clearing site data, switching browser profiles, or changing the URL can lose local access. **Export game backup** creates portable JSON without credentials. Import validates the file and creates a local game, preserving the receiving browser's identity. Server backups do not include browser-local games.

Losing a guest cookie means requesting host approval for a replacement seat. A lost host cookie has no invitation-code recovery; transfer host to another approved guest before leaving when appropriate. Heartbeats alone do not keep an inactive room alive. Room details show its expiry and previous match exports.

If browser storage is blocked, local play continues in memory with a visible warning. Export before leaving. Unreadable or future-version saves are preserved for recovery rather than silently reset.

## Docker

Pull the latest published image:

```sh
docker pull ghcr.io/addison16/commanders-table:latest
```

Build and start locally:

```sh
PUBLIC_ORIGIN=http://localhost:8080 ALLOW_INSECURE_HTTP=true \
  docker compose -p mtg-util -f compose.local.yaml up -d --build
```

For LAN play, set `PUBLIC_ORIGIN` to the server's LAN address and use that address on every device. The container runs as non-root, serves port 8080, and stores SQLite plus its WAL sidecars in the named volume `mtg-util_mtg-util-data`. Keep the same Compose project name and volume when updating. Use local disk storage for this single-instance database.

Release images use **`ghcr.io/addison16/commanders-table`**, with `latest` and `stable` following stable releases and version tags such as `0.1.4` for a fixed release. Images support standard 64-bit PCs/servers (`amd64`) and 64-bit ARM machines (`arm64`). A tag becomes available after its release workflow succeeds.

Download **compose.yaml** and **docker.env.example** from [Releases](https://github.com/Addison16/commanders-table/releases). Put them in a folder, copy `docker.env.example` to `.env`, and set `PUBLIC_ORIGIN` to the exact address your phones will open—for example, `http://192.168.1.50:8080`. The source checkout keeps this example at `.env.docker.example`. Then run:

```sh
docker compose -p mtg-util -f compose.yaml pull
docker compose -p mtg-util -f compose.yaml up -d
```

To update, back up first, then run those same two commands. Existing games remain in the named volume. Selecting `latest` makes new releases available to pull; it does not restart your running container automatically. Docker managers that check image tags can detect the updates. Set `MTG_IMAGE=ghcr.io/addison16/commanders-table:0.1.4` in `.env` to stay on a particular version after it is published.

For public hosting, use HTTPS, `ALLOW_INSECURE_HTTP=false`, and a reverse proxy that supports WebSockets. See [deployment](docs/deployment.md) for configuration, Caddy, updates, verified backup/restore commands, and the publication workflow.

## Offline and installation

One-device play works without a guest session or network connection. A production build can reopen offline after its service worker has installed through HTTPS or localhost. Plain HTTP on a LAN supports core play and saving, but is not a secure context for offline installation or wake lock.

Looking up new artwork requires internet access. Selected card metadata is saved with the game. On an installed production app, viewed Scryfall art crops are cached separately (up to 64 images for 30 days); uncached or unavailable artwork falls back to the normal panel while counters keep working.

On iPhone Safari, use **Share → Add to Home Screen**. On Android, use the browser's install/home-screen menu. Installed apps and ordinary browser tabs can have separate storage. Settings explain optional fullscreen, vibration, sound, and keep-awake behavior. System reduced motion always takes priority. Updates wait for **Save & update**, then confirmation; they do not force a reload during play.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium webkit
npm run test:e2e
npm run test:pwa
npm run test:proxy
npm run test:lan
docker build -t mtg-util:local .
npm run test:container
```

`test:e2e` starts development servers when needed. `test:pwa` starts a temporary production server and verifies offline reopening and prompted updates in both browser engines. `test:proxy` requires OpenSSL and verifies HTTPS cookies and WSS using a temporary certificate. Container checks use their own temporary volumes.

See [testing evidence and the physical-device checklist](docs/testing.md), [architecture](docs/architecture.md), [milestone status](docs/progress.md), and [asset licenses](docs/assets.md). Automated browser coverage is not a claim of physical iPhone/Android validation.

## Publication and project scope

Starting with v0.1.2, application code, documentation, and original artwork are available under the [PolyForm Noncommercial License 1.0.0](LICENSE), SPDX identifier `PolyForm-Noncommercial-1.0.0`. You may use, modify, self-host, and share the app for noncommercial purposes, retaining the license terms and required notice.

Commercial use is not granted, including resale, paid hosting, and use for commercial purposes even when no copy is sold. The license defines its permitted personal and noncommercial organizational uses. These terms are **source-available, not OSI open source**; see the full [license](LICENSE) and [official license text](https://polyformproject.org/licenses/noncommercial/1.0.0).

**Earlier releases keep their original permissions:** [v0.1.0 remains MIT](https://github.com/Addison16/commanders-table/blob/v0.1.0/LICENSE), and [v0.1.1 remains MIT with Commons Clause](https://github.com/Addison16/commanders-table/blob/v0.1.1/LICENSE). This change does not revoke permissions already granted for those releases or code available under their original terms. Bundled fonts and dependencies retain their separate licenses; see [asset licenses](docs/assets.md).

The release workflow verifies the app, Chromium/WebKit journeys, offline updates, HTTPS/WebSockets, and native amd64/arm64 containers before publishing GHCR images and GitHub release downloads. Maintainers publish updates by bumping the package version and pushing a matching `vX.Y.Z` tag; see [publishing a release](docs/deployment.md#publishing-a-release).

This is an independent manual tracker, not a Wizards of the Coast product or a rules engine. Accounts, card databases, team-format automation, and multi-server deployment are outside this release. The original specification remains in [BUILD_PLAN.md](BUILD_PLAN.md).
