# Verification record

## September 16 v0.1.1 licensing preparation

The v0.1.1 release uses MIT with Commons Clause for the application, documentation and original assets. The package and root lockfile point to `LICENSE`; both the Dockerfile and release metadata explicitly use `LicenseRef-MIT-Commons-Clause-1.0`. The release validator, `actionlint`, targeted formatting checks and `git diff --check` pass. A comparison with the previous lockfile confirms every third-party dependency entry is unchanged. Runtime code, public assets, tests and schema are unchanged, and the existing v0.1.0 tag still contains its original MIT license.

Hosted release verification and public image checks are pending publication. The records below describe their respective historical versions; the v0.1.0 MIT evidence remains valid for that release.

## September 16 public release and deployment

[Release v0.1.0](https://github.com/Addison16/commanders-table/releases/tag/v0.1.0) is published under MIT. Both [main verification](https://github.com/Addison16/commanders-table/actions/runs/35163472611) and the [release workflow](https://github.com/Addison16/commanders-table/actions/runs/35163473158) passed: 58 unit/integration checks, 39 Chromium/WebKit journeys with 3 expected skips, production PWA updates and origin-outage reloads, HTTPS/cookie/CSRF/WSS checks, and native amd64/arm64 container smoke tests.

Anonymous registry requests verified both platform manifests and matching `0.1.0`, `stable`, and `latest` tags at `sha256:c93896565678eddcdccc08254d4c70cf1ed6407650376ec26c5395249c2b6b88`. An empty Docker credential directory successfully pulled the public image, and the downloaded x64 image passed the full isolated container smoke. Public source access, MIT license metadata, release notes/digest, both setup-file downloads, exact file contents, and the downloaded Compose configuration were verified. GitHub had normalized the dot-prefixed environment asset name; the published download and future workflow now use `docker.env.example` consistently.

The live deployment now uses the published `latest` image through `compose.yaml`, retaining its existing Compose project, volume, and HTTPS origin. A fresh `before-public-release-20260916.sqlite` backup passed integrity checks and was copied out before recreation. Checksums matched for all 38 rooms, 62 memberships, 194 events, and 65 session identities/revocation flags. Health and the new title passed in a browser over the configured HTTPS origin. A browser holding the prior service worker applied **Save & update**, displayed the new name, and retained the same local game ID and 39-life score. The previous app remains available as `mtg-util:before-commanders-table-20260916`.

## September 16 Commander's Table naming

The chosen name is applied to the interface, browser/install metadata, exported filenames, source repository links, and published image configuration. Internal storage and protocol identifiers are unchanged for compatibility. TypeScript, ESLint, the production build, all 58 unit/integration checks, and eight focused Chromium/WebKit layout, saved-game, and accessibility journeys pass. Updated four/eight-player and sideways-table screenshots show the new heading; the 320-pixel layout remains within the viewport. The release workflows pass `actionlint`, and the downloadable Compose/environment example validates.

The first hosted run passed native amd64/arm64 container checks and 38 browser cases. Its WebKit accessibility trace sampled the panel entrance at half opacity. Axe opens a temporary page that can background the app; the accessibility journey now brings the app to the foreground and waits for full panel opacity before scanning. It retains all contrast checks and passes in both subsequent hosted runs.

## September 16 public-release preparation

The publication candidate passes TypeScript, ESLint, production build, and **58 Vitest checks**. The complete Chromium/WebKit suite passes **39 cases with 3 expected skips**. Production service-worker updates and real-origin offline reloads pass in both engines, as does the HTTPS/cookie/CSRF/WSS smoke check.

`actionlint` 1.7.12 validates the reusable CI and release workflows, and Docker Compose validates the downloadable environment example. The release validator accepts `v0.1.0` and rejects mismatched or malformed tags. Workflow actions are pinned to commits resolved from official release tags. Publication files were checked for credential patterns and local deployment addresses; databases, backups, environment overrides, browser caches, and local authentication files are ignored. Hosted Actions and public registry pulls remain pending the first authenticated publication.

The final Node 24 release candidate (`f699df37e4e4`) passed the native x64 container smoke: non-root startup, native SQLite, assets/health, create/join/approve/update, receipt deduplication, recreation with memberships intact, online backup, and stopped restore. The image includes the MIT license and OCI source/license labels. Its tests used an isolated temporary volume.

## September 16 joining-player setup

TypeScript, ESLint, formatting, the production build, and **58 Vitest checks across 4 files** pass. All **14 targeted Chromium/WebKit browser cases** for shared rooms, joining-player setup, ended-game recovery, and dice sound pass. The 20-life cases were rerun after correcting the test's preset selector; the application required no change for that failure.

New checks cover pending profile privacy and persistence, revising requests, one/two commander labels, host-only atomic approval, competing/stale requests, deduplicated approval, preserving life/damage/casts/IDs, and protecting a tracked partner from removal. A database test recreates schema version 1 with saved rooms and sessions, upgrades it to version 2, and verifies that pending choices survive reopening the database. Commander-disabled rooms apply the name without changing their commander records.

Browser journeys exercise a joining player choosing and updating partners, refreshing while pending, host preview/approval, retaining life totals, editing their own commander afterward, and being unable to edit another player's names. The 20-life journey hides commander fields and uses the guest's selected name. Axe passes on the new form in both engines; the 320-pixel layout has no horizontal overflow. The lobby was visually inspected in [join-player-setup.png](screenshots/join-player-setup.png).

Image `f3b39ef6c9e4` was deployed to the existing HTTPS service after creating and verifying `before-join-profile-2026-09-16.sqlite`. Migration 1 → 2 preserved all **33 existing rooms and 53 memberships**, with matching hashes of stored room IDs/revisions/game JSON and all existing membership columns. All **4 new joining-player browser cases** also passed against the configured HTTPS deployment, and the live health endpoint passed. The prior image is retained as `mtg-util:before-join-profile-20260916`; rolling back to it requires the matching schema-1 backup.

## September 16 ivory dice, ended-game recovery, and audio

TypeScript, ESLint, formatting, the production build, and **53 Vitest checks across 4 files** pass. The complete Chromium/WebKit development suite passed **35 cases with 3 expected skips**, covering the same production-only/CDP exceptions described below.

Rounded dice geometry is checked for closed, paired edges and finite outward normals at both rendering detail levels for every supported shape. Existing browser checks still verify upright, centered result numbers through full animation and reduced motion. The ivory surfaces, rounded edges, and Recently ended games screen were visually inspected; screenshots are in [screenshots](screenshots/).

Recovery checks cover returning to the initial mode choices after ending a game, surviving a reload and starting another game, and restoring the original IDs, life totals, damage, history, and paused timer. Storage tests exercise competing tab leases and the exact 24-hour deadline. Shared-room tests verify host-only reopening, original guest seats and totals, expired recovery rejection, and both participants returning to the restored board.

Both browser engines measured nonzero audio samples from the actual output graph during dice previews and rolls. Tests also suspend the AudioContext before a roll, verify it resumes and produces sound, and confirm disabling sound prevents further sources. These checks establish browser audio generation, not physical-phone speaker output or operating-system mute behavior.

This Arch-based host lacked GStreamer's automatic audio sink for WebKit. Matching `gst-plugins-good` automatic/PulseAudio sink libraries were extracted into ignored `.browser-cache/gst-good/`, without modifying system packages. The executed browser command used `GST_PLUGIN_PATH_1_0="$PWD/.browser-cache/gst-good" PLAYWRIGHT_BROWSERS_PATH=.browser-cache npm run test:e2e`. Supported Ubuntu CI should install its browser dependencies with `playwright install --with-deps`.

The Node 24 production image was deployed with the HTTPS origin and database volume preserved. A fresh SQLite backup passed its integrity check before recreation. All **31 existing rooms and 49 memberships** matched afterward, including a checksum of every stored room ID, revision, and game JSON. The previous image is retained as `mtg-util:before-ivory-recovery-20260916`; the new image is `b415da7b984d`. The live HTTPS health endpoint and all **10 focused display, recovery, and sound browser checks** passed against the configured HTTPS deployment in Chromium and WebKit.

## September 16 dice polish and shared-table layout

The update passes TypeScript, ESLint, formatting, the production build, and **43 Vitest checks across 4 files**. The complete browser suite passed against the deployed HTTPS site: **29 cases passed, 3 expected skips**, across Chromium and WebKit. New coverage checks the final face normal and glyph axes of every dice mesh, backward-compatible profile loading, and saved layout preferences without changing the installation ID or manual seat flips.

Browser scenarios inspect the actual canvas lettering transforms for d4/d6/d8/d10/d12/d20, both percentile dice, and the coin. Result numbers face the camera, remain upright, and are centered after both full animation and reduced motion. Shared-table checks verify the two far-side seats rotate exactly 180 degrees, both near-side seats stay upright, taps affect the correct players, and totals/layout survive a confirmed save and reload. Manual overrides and switching back to All facing me also work. Axe checks the layout selector in both engines.

All four seats and their eight life controls fit without scrolling at 844×390 and 568×320; each life button is at least 64×52 CSS pixels. The 320×568 portrait view has no horizontal overflow. A separate Chromium check verified poison warnings and turn markers remain inside their panels in the compact landscape layout. The final dice and both landscape layouts were visually inspected; see `dice-upright.png` and `shared-table-*.png` in [screenshots](screenshots/).

The Node 24 image was deployed to the existing service with its database volume and HTTPS-origin configuration preserved. A new verified SQLite backup was saved before recreation. All **27 existing rooms and 43 memberships**, including a checksum of the stored room IDs, revisions and game JSON, matched exactly afterward. The previous image remains tagged for rollback. The deployment uses a configured HTTPS origin; direct LAN HTTP still serves the frontend, but room mutations correctly reject an origin different from the configured HTTPS site.

## September 16 refinements

The updated app passed TypeScript, ESLint, production build, and **42 Vitest checks across 4 files**. The full phone-sized Chromium/WebKit suite passed **25 cases with 3 expected skips** (the same production-only/CDP exceptions described below). Added coverage verifies:

- Actual closed dice meshes for d4/d6/d8/d10/d12/d20, animated canvas frames over the visible board, and winner text remaining absent through a forced tie reroll. Both engines pass an Axe scan of the result dialog. Reduced motion, skip, persisted results and browser Back work without generating another result.
- Player/commander edits retaining life, commander damage and original IDs/history after new-game mode selection, switching games and reload; optional turn controls appearing beside Undo and disappearing when disabled.
- Dice after an ended game, automatic recovery of an expired tab lease, and approved guests rolling for everyone with identical results on both browsers. Shared turns remain host-controlled.
- Bounded unfinished local saves, older archive resumption, rematch/ended-game exclusion, and another tab's lease being respected. Shared recent-game summaries require the existing guest cookie, omit private game/invitation data, and exclude revoked, ended and expired rooms. A browser can switch to local play, then resume its original shared seat.

The production PWA update and real-origin-outage script passed again in both engines. A separate Chromium check exercised all seven dice sizes, total calculations, the coin, and the maximum 20d100 roll (40 visual dice) at 320×568 with reduced motion. Dice were visually inspected in portrait and landscape; screenshots are in `docs/screenshots/`. These are browser checks, not physical-phone measurements.

The updated Node 24 Docker image was deployed to the existing LAN service on port 8080. The live database was backed up with SQLite's backup API and verified before recreation; the existing 23 room records and 37 memberships matched exactly afterward, including a hash of all saved room IDs, revisions and game JSON. All ten refinement/shared-room browser cases passed against the deployed LAN URL in Chromium/WebKit. Health also responded through the LAN IP from a separate Docker bridge. The original database volume and a tagged pre-update image were retained.

## Original milestone verification

Implementation checks were run on September 15, 2026 (America/Chicago; some artifact timestamps are September 16 UTC). Host: Linux x86_64, Node 22.23.2, npm 10.9.8. Production containers used Node 24. Browser automation used Playwright 1.63.0 with its Chromium and WebKit builds. The repository targets Node 24 through `.nvmrc`.

## Results

| Check                                               | Actual result                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ESLint                                              | Passed                                                                                                                                                 |
| TypeScript client/server checks                     | Passed                                                                                                                                                 |
| Production client/server/PWA build                  | Passed                                                                                                                                                 |
| Vitest domain, IndexedDB, HTTP and room integration | 30 tests passed across 3 files                                                                                                                         |
| Chromium and WebKit application journeys            | 19 cases passed; 3 expected skips in the development suite, explained below                                                                            |
| Production service-worker prompt/update             | Passed in Chromium and WebKit; an accepted update preserved the game                                                                                   |
| Real origin outage and offline reload               | Passed in Chromium and WebKit; an offline edit survived a second reload; private API responses were not cached                                         |
| HTTPS reverse proxy                                 | Passed: secure cookie, configured invitation origin, CSRF and real WSS command/acknowledgement                                                         |
| HTTP through a real LAN address                     | Passed in desktop Chromium as an insecure context: ID fallback, local resume, guest cookie, configured room link, shared update/reconnect              |
| amd64 Docker                                        | Passed non-root startup, native SQLite, health/assets, room flow, deduplication, recreation, membership persistence, online backup and stopped restore |
| ARM64 Node/SQLite under QEMU                        | Passed the same room/recreation/backup/restore checks; this was actual ARM64 code under emulation                                                      |
| Physical iPhone/Android and native ARM machine      | Not available; not claimed as verified                                                                                                                 |
| Hosted GitHub Actions / published image             | Prepared only; no remote run, push, or publication                                                                                                     |

The development suite skips its two production-only offline cases; `npm run test:pwa` provides the full production offline/update check in both engines. The third skip is WebKit's CDP-only simultaneous touch injection test. Chromium injects two independent touches at once; both engines separately exercise real pointer holds and cancellation. WebKit's `context.setOffline(true)` could not navigate the cached app in this environment, while a real unreachable origin succeeded. The PWA script deliberately tests that actual outage instead of treating the emulator failure as an application pass.

A simultaneous-touch test originally refreshed immediately after the optimistic totals appeared, while saves were still pending. It now waits for **Saved here** before asserting durable totals after refresh. Reload guarantees the last committed IndexedDB transaction; the UI explicitly distinguishes pending input from a confirmed save. Shared pending changes likewise have an awaiting-confirmation label and retain their original operation IDs for recovery.

## Coverage details

Domain tests exercise 1–8 seats, bounded/negative life, poison limits, stable identities after rename/reorder, partners and own-commander damage, life independence, atomic damage/life undo, correction semantics, hold grouping, 60 undo actions, redo branching, per-commander casts, elimination/marker behavior, rematch IDs, timestamp timers, rejection sampling, tied d20 rerolls, and invalid/future imports.

IndexedDB tests exercise committed reloads, stale writes, explicit takeover, corrupt-record preservation, checkpoints, bounded archives, and credential-free exports. Browser tests also block storage and remove `crypto.randomUUID()` to exercise the memory warning and fallback. The LAN smoke uses a real insecure origin where `randomUUID()` is absent without mocking it.

Room tests cover pending-guest privacy; own-seat versus host/global permissions; concurrent relative deltas; stale absolute revisions; conservative undo; atomic competing seat assignments; replacement revocation; receipt lookup after rematch, host transfer, revocation, restart, and more than 200 events; code rotation/join locks; expiry cleanup; rolling sessions and expired authority; and eight approved guests converging on a single state and recorded dice roll. The eight-participant case is a server integration test, not eight physical phones.

Independent browser contexts perform create → invitation link → display name → seat request → host approval → simultaneous edits → disconnect/reconnect → refresh/seat recovery → My seat → matching dice. A WebSocket interception test loses a real acknowledgement after server commit, reloads, and verifies that the persisted operation is retried once with its original ID and removed from the outbox.

Local journeys exercise life, combined damage, undo, save/refresh/resume, JSON download/import, negative six-digit life, reduced motion, sheet/browser-back behavior, focus restoration, two-tab takeover, holds, and exact two-touch counts. Axe scans the home, board, and player dialog for WCAG 2 A/AA and 2.1 AA issues in both engines. Keyboard and focus checks supplement those scans; automated scans are not full screen-reader certification.

Responsive automation checks 320×568, 390×844, 844×390, 768×1024, and 1440×900. All eight seats remain reachable, no horizontal overflow is permitted, and life controls are at least 44×44 CSS pixels. The four- and eight-player screenshots in [screenshots](screenshots/) were captured from the app and visually inspected. Small eight-player boards may scroll to retain usable controls.

## Measured response

See [performance.json](performance.json) for the machine-readable results. Twenty actions of each kind were measured in a 390×844 Chromium viewport against the development server on healthy loopback, with no CPU throttling:

| Measurement                                                                    |  Median | 95th percentile | Maximum |
| ------------------------------------------------------------------------------ | ------: | --------------: | ------: |
| Local programmatic input → next animation frame after displayed life change    | 14.1 ms |         14.5 ms | 14.5 ms |
| HTTP shared command → server commit → WebSocket display → next animation frame | 14.6 ms |         14.9 ms | 23.2 ms |

The shared measurement bypasses optimistic client commands and waits for the authoritative broadcast, so it includes request/commit/display latency. The local measurement measures immediate feedback, not IndexedDB durability. These observations meet the 100/300 ms targets on this host; they do **not** establish physical-phone or Wi-Fi performance. No prolonged physical-device thermal/battery measurement was possible.

## Reproduce

```sh
npm ci
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

The LAN smoke chooses a private IPv4 interface on this machine; set `LAN_HOST=192.168.1.50` if multiple interfaces require a choice. It does not send requests to unrelated machines. It starts and stops its own production server and in-memory database. The proxy and PWA checks also use isolated temporary servers. The container check removes only its own temporary containers/volume.

For performance, start `npm run dev` separately and run `npm run measure:performance`. It writes `docs/performance.json` and creates an ordinary test room with sample names in that server; normal room retention removes it later. Use `E2E_BASE_URL` to point the browser suite or measurement script at an alternate configured origin.

On this Arch-based development host, browser downloads were stored in ignored `.browser-cache/`, so the executed browser commands used `PLAYWRIGHT_BROWSERS_PATH=.browser-cache`. WebKit needed ICU 74, libxml2, and flite compatibility libraries; extracted copies were placed only in that local browser cache. No system package replacement was performed. A supported Ubuntu runner with `playwright install --with-deps` is the reproducible CI path. Ignore generated `playwright-report/`, `test-results/`, databases, and browser caches when sharing source.

For a direct Chromium `setOffline` check against an already-running production server, the optional command is:

```sh
E2E_BASE_URL=http://localhost:8081 E2E_PWA=1 \
  npm run test:e2e -- --project=chromium-phone tests/e2e/offline.spec.ts
```

`test:pwa` is the preferred full offline check and starts its own server. Architecture smoke and backup commands are in [deployment](deployment.md).

## Physical-device release checklist

These checks remain **unverified**. Use at least one iPhone in Safari and one representative Android phone in Chrome. Record device model, OS/browser version, tab versus installed mode, URL scheme, and date. Run ordinary tab flows first; installation is optional for users.

1. Open the exact configured LAN/HTTPS URL on both phones. Create a four-seat room, scan its QR with the other phone's normal camera, enter a display name, request and approve a seat. Verify the keyboard leaves confirmation buttons reachable and closing it restores layout.
2. Play with 2/4/6/8 seats in portrait and landscape. Check browser bars, notches, home indicators, scrollable eight-seat boards, long names, −999,999 life, rotated seats/upright sheets, and 200% zoom. On a shared tablet, hold or tap two different seats simultaneously and verify exact totals.
3. During a hold, release outside, scroll a sheet, open a modal, switch apps, open the camera, and lock/unlock the phone. Repeat with a shared connection lost mid-hold. No background or canceled repeat should continue. Shared input must pause until the current snapshot is verified.
4. Let the host phone sleep while another approved phone edits. Reopen the host, confirm identical totals, and confirm its host role has not moved. Drop Wi-Fi after a change; reconnect and check that the change appears exactly once. Verify the explicit independent local-copy path during an outage.
5. Export/download JSON and import through the phone's file picker and pasted text. Test a rejected/corrupt file without losing the current game. Confirm a guest cannot edit another seat unless the host enables that policy.
6. Over trusted HTTPS, wait for the production app's first successful load, then enable airplane mode and reopen the local game. Make an edit, reload again, and verify the saved value. Separately test Safari Add to Home Screen and Android installation; record whether each context shares or separates saved data. Accept an app update only after saving and confirm the game survives.
7. Use VoiceOver/TalkBack through setup, board, player details, commander lists, and dialogs. Check focus return, labels, batched hold announcements, contrast, and system reduced motion. Try optional wake lock, fullscreen, vibration, and audio; unsupported enhancements must leave play usable.
8. Play for at least 30 minutes on a modest phone with eight seats and repeated shared updates. Record response latency against the 100 ms local/300 ms healthy-LAN targets, memory trend, animation smoothness, warmth, battery usage, and background recovery. Repeat a short join/edit/resume smoke in Samsung Internet, iPhone Chrome, Firefox, and previous supported major browser versions when available.

Native ARM hardware/hosted runner results, physical screen-reader checks, real installed-mode behavior, current/previous mobile browser coverage, and prolonged battery/thermal checks must be added before claiming full device release validation.
