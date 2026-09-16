# MTG Util — product and implementation handoff

Prepared for GPT Sol on September 15, 2026.

This is the build specification, not an existing implementation. The folder had no application code when inspected. Build the application described below, verify it, and document how to run it locally and through Docker. Do not stop after making a visual mockup or scaffold.

## 1. Product goal and settled decisions

Create a beautiful, fast browser companion for playing physical Magic: The Gathering with friends. Its central job is tracking life and common game information for up to eight players. It must be pleasant to leave on the table for an entire game: readable at a glance, easy to touch, visually distinctive, and dependable after refresh or interruption.

**Audience priority: the user expects approximately 99% mobile usage, specifically iPhone and Android browsers. Design, implementation tradeoffs, and acceptance testing must start with phones. Desktop is a secondary adaptation.** The complete experience must work in an ordinary mobile browser tab; installing the app is optional.

The user explicitly requested **both play modes as options**:

| Mode | Experience | Where the authoritative game lives |
| --- | --- | --- |
| One device | One phone/tablet manages the whole table; everyone can use its controls. | That browser's local storage database. |
| Shared room | Host creates a room; friends join by code, link, or QR code and see live updates. The host can still manage all seats from one device. | The self-hosted server's database. |

Both modes belong in the first complete release. Implement one-device play first as a development milestone, then finish shared rooms before calling the requested application complete. Accounts are deferred. Local mode must not depend on a guest session or server connection.

Other decisions:

- Support 2–8 normal seats and an optional 1-seat practice setup.
- Default quick start: four players, Commander, 40 life. Offer a clearly visible two-player, 20-life option.
- iPhone Safari and Android Chrome are primary release targets; include other common mobile browsers in compatibility checks. Tablets and desktop browsers must also work.
- Make life, poison, commander damage, commander tax, dice, and first-player selection complete features.
- Hide less-used counters behind player details and a utilities menu.
- Remember the last mode, game, seat settings, and display preferences without account setup.
- Use an original arcane fantasy design influenced by MTG's colors and tabletop atmosphere.
- Develop and test without requiring Docker. Deliver Docker packaging and publication instructions afterward.
- Use `MTG Util` as the working name. Keep the name and branding easy to replace.

## 2. Account-free identity and resuming games

### What “remember this device” means

An ordinary browser application cannot read a device's MAC address. Do not implement hardware fingerprinting, IP-based identity, or a fingerprinting service. Generate a random local installation ID and store it with the browser's preferences and local games. This ID is an organizational key, not a credential.

The experience is: open the same site in the same browser profile and resume where you left off. A different browser, private session, cleared storage, or changed site address can start fresh. Browser storage is scoped to the site's origin, which includes scheme, host, and port. Include export/import so users can move a local game between addresses or browsers. [MDN: client-side storage](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Client-side_APIs/Client-side_storage), [MDN: storage limits and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

On launch:

1. Hydrate and validate saved data before displaying setup or allowing mutations.
2. Resume a valid local game directly with a brief, nonblocking “Game restored” message.
3. For a saved room, reconnect with the guest session and fetch current server state before enabling controls.
4. If the room is unavailable, show its last confirmed state with a clear connection message, plus options to retry or open local play.
5. If no usable game exists, show the mode selector and quick setup.

Provide an always-accessible New game action. Starting a new game must not silently overwrite the current game; confirm replacing it or archive a bounded recent-game snapshot first. Keep the last ten completed/local games by default, with explicit deletion controls.

### Guest identity in shared rooms

Joining or creating a room creates a server-issued anonymous guest session. Use a random 256-bit opaque token in a persistent `HttpOnly`, `SameSite=Lax`, `Path=/` cookie with no `Domain` attribute; set `Secure` for HTTPS deployments. Store a hash of the token server-side, its expiry, and room memberships. Use a configurable rolling lifetime, initially 90 days. Renew the cookie and server expiry together through a same-origin HTTP session endpoint on launch, foreground/reconnect, and periodically during active use; WebSocket messages cannot refresh an HttpOnly cookie. Never renew expired/revoked authority as though it were still valid. A local installation ID must never grant room or host access. [MDN: Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

Save room references locally, but derive permissions from the server. A returning guest can recover their assigned seat while their session and room still exist. Losing the cookie means a new guest identity: the host can approve a replacement guest for that seat. The application cannot promise recovery of a lost host identity without a recovery mechanism; offer host transfer to another joined guest before leaving. Do not give host powers to whoever enters a room code first after a disconnect.

Settings copy should be brief: “Games and preferences are remembered in this browser. Export a backup before clearing site data or changing browsers.” Shared-room settings also display the room's retention period. Do not promise permanent storage.

## 3. Required screens and primary flows

### Home / mode selector

Present two polished choices: **One device** and **Shared room**. Shared room offers Create and Join. Keep returning players one action away from a recent game if they leave the automatically restored board.

### Setup

Choose player count, preset, starting life, seat names, colors, enabled trackers, and one or two commander labels per player. Use sensible names such as Player 1 initially. Most customization is optional; Quick start should require no typing. Allow custom starting life and clearly labeled house-rule thresholds through advanced setup.

Presets: Commander (40 life, poison and commander tools enabled), 20-life game (commander tools off), and Custom. These configure a tracker; they do not enforce deck legality or adjudicate rules. Do not label an arbitrary 30-life setup as full Two-Headed Giant support.

### Game board

The board dominates the viewport. Each player panel has a name, enormous life total, obvious minus/plus controls, and a Player details affordance. Show enabled poison and commander warning badges when space permits. A compact fixed toolbar provides Utilities, Undo, and Game menu. Shared mode also has a small connection/room indicator.

Player details opens an upright bottom sheet on phones or side panel on larger displays. It contains poison, commander damage received, that player's command-zone cast counters, optional counters, customization, and elimination controls. All overlays remain upright even if the player's tile faces the other side of the table.

### Shared-room lobby and participation

Use Jackbox as a reference for the low-friction join experience. Its official instructions describe joining through a browser with a room code and display name without a player login; its QR flow can prefill the code. Borrow this interaction pattern while keeping MTG Util's own visuals and game behavior. [Jackbox: joining a game](https://support.jackboxgames.com/hc/en-us/articles/15794759479959-How-do-I-join-a-game), [Jackbox: accounts and display names](https://support.jackboxgames.com/hc/en-us/articles/15794759347735-Do-games-require-an-account-or-subscription-to-play), [Jackbox: QR joining](https://www.jackboxgames.com/blog/how-to-play-party-pack-nine-remotely).

The intended mobile flow is **Create room → show code/QR → friends enter a display name → claim/approve seats → play**. Remember each guest's preferred display name locally. A QR/link fills in the room code automatically. Keep the join screen to one short form with a prominent Join button, followed by seat selection. The host runs entirely in this web app; a dedicated TV, console, purchased host game, or native application is unnecessary. A room code is valid on the specific self-hosted instance that created it, so show the site's address with the code and include the full address in its QR link.

The host sets up seats and shares a join URL with an 8-character random room code. Use an unambiguous alphabet, ignore typing case/hyphens, and regenerate on collision. Generate the QR code locally. Friends scan it with their normal phone camera; an in-app camera scanner is unnecessary.

Joining creates a pending participant. They request a seat and the host approves it with one tap. Seat assignment is atomic: simultaneous requests cannot give the same seat to two guests. Host-controlled seats may remain unclaimed. This permits a shared phone plus several individual phones in the same game.

Opening a join link preserves existing local games. Pending guests see seat availability and their request status, including approval, rejection, and seat-taken outcomes, without receiving the live game snapshot. Each guest occupies at most one seat; the host may also occupy a seat while retaining host powers. Separate Release/reassign seat from Transfer host: transferring host does not exchange seats. Replacing a guest who lost their browser session revokes the former membership before granting the replacement control.

Default permissions:

| Action | Host | Approved player | Pending participant |
| --- | --- | --- | --- |
| View board/history | Yes | Yes | Lobby only |
| Edit life/counters/damage received | Every seat | Own seat | No |
| Edit commander cast counts | Every commander | Own commanders | No |
| Use ordinary dice/coin tools | Yes | Yes | No |
| Set first player, reset/end game, change global markers/settings | Yes | No | No |
| Approve seats, remove guests, transfer host, lock joining | Yes | No | No |

Optionally enable **Friends can edit every seat** as a host-controlled room setting. This broadens numerical seat editing, not host administration. Show which mode is active. Enforce all permissions on the server, including WebSocket messages.

All joined devices can switch between Table view and My seat view. Table view shows every seat; My seat emphasizes the assigned player's controls with a compact overview of everyone else. Facing rotations are local presentation preferences, never a room-wide forced rotation. Show connected/reconnecting indicators without confusing a disconnected guest with an eliminated player.

Keep the same shareable room across rematches; give each match a new game ID. Lock joins and rotate the invitation code when requested. Removing a guest revokes their membership and active sockets. The server remains available when the host's phone sleeps; host status does not transfer automatically.

## 4. Game behavior and rules-aware tracking

### Life and input

- Tap minus/plus for −1/+1 with immediate feedback. Offer ±5 and exact adjustment/set in a sheet.
- Press-and-hold repeats after approximately 350 ms. Keep the repetition rate predictable; a larger-step mode must be visibly labeled. Persist/submit every actual increment, not only the final pointer release.
- Cancel repeats on release, pointer cancellation, lost capture, opening a sheet, backgrounding, navigation, and connection loss. Prevent a release from firing an extra click after a hold.
- Track simultaneous touches separately so two players can adjust different seats on a shared tablet.
- Allow negative life. Validate all numbers as bounded safe integers; use practical application limits such as life −999,999 through 999,999 and counters 0 through 999,999. These are input/storage limits, not claimed MTG rules.
- Briefly show an accumulated change label such as `−7` without hiding the total or blocking another tap.

### Poison and loss indicators

Poison is a separate nonnegative counter. Default its warning threshold to 10, including Commander. Life at or below zero, poison at its threshold, and qualifying commander damage should produce warnings rather than forcibly removing a player. Cards and house rules can change outcomes, so elimination is manual and reversible. [Wizards: Comprehensive Rules, especially 101 and 704](https://magic.wizards.com/en/rules).

An eliminated tile stays in place and is dimmed, preserving layout and history. Require an explicit Restore player action to resume normal edits. Exclude eliminated players from first-player selection by default. If the player holds a global marker or the current-turn highlight, keep that state visible and prompt the host/local operator to reassign or clear it; do not silently infer rules outcomes.

### Commander damage

Use `damageReceived[recipientPlayerId][commanderId]`. Commander IDs represent individual commanders and survive renamed players, reordered seats, zone changes, and changes in control. Include the recipient's own commander among possible sources. Never store only one damage total per opposing player.

The normal warning threshold is 21 combat damage from one commander over the game; gaining life does not erase this history. Partner commanders have separate damage totals and separate command-zone cast counts. [Wizards: Commander](https://magic.wizards.com/en/formats/commander), [Wizards: Commander Masters release notes](https://magic.wizards.com/en/news/feature/commander-masters-release-notes).

In the recipient's damage sheet, group sources by their owner and label the commanders individually. At eight players with two commanders each, one recipient can have sixteen sources. Use a scrollable list; do not cram a 128-cell matrix onto a phone.

Provide two distinct operations:

- **Record combat damage:** select source and amount; show an explicit “Also subtract this much life” option, initially enabled. Confirming applies the damage and optional life change as one atomic, undoable event.
- **Correct recorded total:** edit damage history only; do not unexpectedly add or subtract life.

Poison stays independently editable. Infect can change the normal life consequence of damage, and toxic can add poison alongside it; the tracker must not infer these effects from a card name or damage amount. Users can disable the life adjustment and set poison themselves. [Wizards: damage rules, 120.3](https://magic.wizards.com/en/rules).

### Commander tax

Store command-zone casts per individual commander and derive the additional tax for the next cast as `2 × previous command-zone casts`. Label it **Next cast: +N additional mana**. Provide Record cast and a correction action. A cast from another zone does not increment this tracker. Do not imply the tax is the commander's entire casting cost. [Wizards: Commander, Command Zone](https://magic.wizards.com/en/formats/commander).

### Optional trackers included in the release

Provide an extensible registry of simple manual counters: energy, experience, rad, and named custom counters. Optional Monarch and Initiative markers can be assigned/transferred manually; each marker has zero or one holder, independently. Default these extras off so a fresh board stays clean. Display a small “Manual tracker” description where users might otherwise expect automatic rules resolution.

Enable simple turn highlighting/turn number and a game elapsed timer in Utilities. A game timer derives elapsed duration from stored timestamps and pause offsets, not accumulated animation ticks. Shared timers use server timestamps and an estimated client-to-server clock offset refreshed on reconnect, so phones with different clocks agree. Do not reset counters automatically when advancing turns unless the user explicitly configured that behavior. Detailed phases, mana pools, storm automation, day/night automation, dungeon maps, Planechase, and team formats belong in later releases; named counters cover occasional needs now.

### Undo, history, and rematches

Use human-readable history such as “Alex lost 3 life” or “Sam took 5 combat damage from Mira's commander; life −5.” Include actor identity in shared games. Keep a bounded visible history, initially 200 gameplay entries, and separate recent dice results.

Local mode supports at least 50 undoable recent game actions and redo until a new action branches history. Combined commander/life changes undo together. Group adjacent increments from one uninterrupted hold into one undo group without delaying durable saves.

Shared mode uses a conservative undo: reverse only the most recent undoable gameplay action/group if it still matches the server's expected state. A player can reverse their own eligible last action; the host can reverse the latest action regardless of actor. If intervening changes make it unsafe, disable undo with an explanation and allow a normal correction. Never send an old full snapshot to “undo” another player's newer changes. Shared redo can wait for a later release.

Rematch confirmation resets gameplay values, markers, dice history, and timers while retaining seat names, colors, commander labels, enabled trackers, assignments, and local rotations. A new game ID invalidates commands still in flight from the old match. Preserve a final snapshot before replacement. Changing player count during an active game should route through a confirmed new-game setup in this release; names/colors may change without resetting.

## 5. Dice and utilities

The utilities sheet contains animated dice, coin flip, first-player selection, turn/timer controls, optional trackers, history, export/import, and display settings. Avoid a permanently expanded dashboard of minor features.

Dice: d4, d6, d8, d10, d12, d20, d100; 1–20 dice per roll; individual results and total; Roll again; Skip animation; recent results. Treat d100 as 1–100 and make that visible. Coin flip presents readable Heads/Tails.

First player: select uniformly among eligible seats, then run a short traveling highlight that settles on the selected player. Offer manual override and an explicit confirmation to set the turn highlight. Also provide “Roll a d20 for each player” with rerolls among tied highest results if the group prefers that ritual. Selecting first player never reorders seats automatically.

Choose the result once, record it, and then animate its reveal. Skipping, resizing, refreshing, or replaying animation must not reroll. In local mode use `crypto.getRandomValues()` with rejection sampling for unbiased integer selection. In a room the server generates and persists the result and broadcasts the same roll ID/results to everyone. Clients may animate at slightly different times, but every final face and number must agree. This is a friendly tabletop tool, not a provably fair gambling protocol. [MDN: getRandomValues](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues).

## 6. Visual direction and interaction quality

The design should feel like a carefully art-directed fantasy game companion. Aim for the quality of a premium shipped product: coherent materials, typography, motion, and sound, with very little friction during play.

### Design system

- Background: near-black ink (`#090D14`) with a restrained arcane texture/radial glow.
- Panels: layered blue-black (`#141B28`) surfaces, a fine illuminated edge, subtle inner shading, and deliberate space between seats.
- Primary text: warm off-white (`#F3F0E8`); supporting text starts around `#B6C0CE`. Verify contrast on actual backgrounds.
- Accent: restrained antique gold (`#D6B66A`) for global actions. Player palettes include ivory, blue, violet/charcoal, ember, green, teal, rose, and copper. Always add names/icons; color alone must not identify a player.
- Typography: a legible interface face such as locally bundled Inter, an optional restrained fantasy serif for titles, and large tabular numerals for life. Use licensed local fonts and record their licenses.
- Life numbers should dominate: approximately 64–112 px on comfortable layouts and 40–56 px in dense eight-seat layouts. Scale down only as needed; support large values without clipping.
- Use original SVG sigils and CSS effects. Keep backgrounds subordinate to numbers. Use owned or appropriately licensed art if added; document asset provenance so the project can be shared publicly.
- Avoid generic marketing-page structure, dense navigation, excessive glass blur, and a mass of equally prominent buttons. The game board is the product.

### Layout

| Seats | Portrait columns × rows | Landscape columns × rows |
| --- | --- | --- |
| 1 | 1 × 1 | 1 × 1 |
| 2 | 1 × 2 | 2 × 1 |
| 3–4 | 2 × 2 | 2 × 2 |
| 5–6 | 2 × 3 | 3 × 2 |
| 7–8 | 2 × 4 | 4 × 2 |

For odd seat counts, use the vacant position as a quiet utility space or a balanced layout; preserve predictable touch zones. Prefer grids over narrow radial wedges. Offer a 180° facing flip for individual tabletop tiles. Sideways 90° tiles can wait until their interaction and sizing are proven.

Use dynamic viewport height and safe-area insets. Keep tap targets at least 44 × 44 CSS pixels, preferably 48 for frequent actions. At eight seats on a very small phone, use a deliberate scrollable layout if needed instead of shrinking controls below usable size. Never hide that more seats are below the viewport. Test portrait, landscape, browser chrome changes, on-screen keyboards, and zoom. My seat view stays upright and larger.

### Motion and effects

- Tap feedback: approximately 80–140 ms, with a crisp press state and small number transition.
- Life loss/gain: brief ember/energy accents near the affected value; never a full-screen flash.
- Drawers: approximately 180–260 ms with controlled easing and stable focus.
- Dice: a satisfying 600–1,200 ms tumble, bounce, shadow, then a clear final result. Use CSS/SVG and Motion initially. A lazy-loaded 3D renderer is optional only after core functionality and performance are good.
- First-player selection: approximately 900–1,600 ms, skippable.
- Ambient effects: sparse, slow, disabled in low-effects mode and when hidden. No permanent high-cost canvas render loop on the board.

State changes must never wait for animation completion. Effects cannot capture pointer input or obscure control labels. Honor `prefers-reduced-motion` and expose Full/Reduced/Off effects settings. Audio is opt-in, starts only after user interaction, and has a mute control. Haptics are optional and feature-detected. Game results remain fully readable without sound, motion, or haptics.

### Accessibility and browser support

Use real buttons, visible focus, keyboard access, accessible dialog semantics, focus restoration, labeled controls such as “Decrease Alex's life,” and readable contrast. Batch live-region announcements during held adjustments. Preserve page zoom. Apply gesture suppression only to relevant repeated-tap controls, not the entire app.

Target current and previous major releases of Safari/iOS, Chrome/Android, Firefox, and Chromium desktop browsers. Feature-detect fullscreen, wake lock, vibration, and installation prompts. Explain unavailable enhancements without blocking play. Wake lock should be opt-in, visibly active, and reacquired after returning to the foreground when appropriate. [MDN: Screen Wake Lock](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API).

### Mobile release requirements

- Design every screen at phone size first, including setup, join/approval, commander lists, import/export, errors, and settings. No essential hover states, right-click actions, tiny icon menus, or desktop-only forms.
- Put frequent actions within comfortable thumb reach; use bottom sheets and concise menus. Drag/swipe/long-press shortcuts always need visible tap alternatives. Room-code entry supports paste; numerical fields use an appropriate mobile keyboard while still allowing negative life corrections. Use at least 16 px form text and keep sheet confirmations reachable above the keyboard.
- Support ordinary Safari/Chrome tabs with their address bars visible. Use `viewport-fit=cover`, `env(safe-area-inset-*)`, and dynamic-height layouts with fallbacks so the notch, home indicator, browser bars, and on-screen keyboard cannot cover controls. Avoid relying solely on `100vh`. [MDN: CSS env() and safe areas](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env).
- Portrait must be excellent. Landscape is optional for the player and must remain usable; never require successful orientation lock or fullscreen to play. Prevent a sheet's scroll gestures from adjusting life in the board behind it. Back closes an open sheet before unexpectedly leaving a game where browser navigation integration supports this.
- Reconcile state after locking/unlocking the phone, switching apps, opening the camera to scan a QR code, and returning from background suspension. A phone can suspend sockets/timers without firing a clean close event; resume must verify the connection and authoritative room state before accepting input. Test interrupted pointer gestures as part of this lifecycle.
- Provide a useful Add to Home Screen help path on iPhone. Use a native install prompt only where supported; do not depend on `beforeinstallprompt` on iOS. Test browser and installed modes separately, and do not promise that all browsers/installation contexts share saved state. [MDN: PWA installation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
- Copy link and JSON download/import must work through ordinary browser controls; native sharing/file-sharing APIs are optional enhancements with fallbacks. Joining never requires installing another app or granting camera permission inside this application.
- Optimize for battery and modest phones: pause decorative motion when hidden, cap particles, avoid large continuously animated blur layers, and keep game-state updates scoped to affected panels. Check a prolonged session for memory growth, warmth, and excessive battery use instead of judging only a brief desktop demo.

Automate mobile Chromium and WebKit viewport coverage, then physically test at least one iPhone in Safari and one representative Android phone in Chrome. Add Samsung Internet and iPhone Chrome smoke checks when available. Desktop WebKit emulation is useful but does not prove actual iOS keyboard, installation, suspension, or touch behavior. If physical devices are unavailable during implementation, record those specific checks as unverified and give the user a short executable device checklist; do not claim full device validation.

## 7. Recommended implementation architecture

Use a small TypeScript codebase with a shared game domain and two persistence/transport adapters. Recommended choices are decisions to keep the implementation focused, not a requirement to chase every new dependency version.

| Layer | Recommendation |
| --- | --- |
| Frontend | React + TypeScript + Vite |
| Styling | CSS design tokens and CSS Modules; accessible headless dialog primitives where useful |
| Animation | CSS transitions and Motion for React |
| UI state | Zustand with narrow selectors; pure domain functions outside components |
| Validation | Zod schemas shared by client/server for commands and saved data |
| Local persistence | IndexedDB through the small `idb` wrapper |
| Server | Node.js supported LTS, initially Node 24; Fastify |
| Live transport | `@fastify/websocket`, with HTTP for session/create/join/snapshot operations |
| Shared persistence | SQLite through `better-sqlite3`, WAL mode, explicit migrations |
| Production assets | Served by the same Fastify process using `@fastify/static` |
| PWA | `vite-plugin-pwa` with user-prompted updates |
| Tests | Vitest, React Testing Library, Playwright |
| Package management | npm with a committed lockfile and pinned Node version |

Verify compatible stable package versions when implementing; record actual versions in the lockfile. Check native SQLite bindings on both target container architectures. [Vite guide](https://vite.dev/guide/), [Motion for React](https://motion.dev/docs/react), [Fastify docs](https://fastify.dev/docs/latest/), [Fastify WebSocket plugin](https://github.com/fastify/fastify-websocket), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3).

Do not add accounts, a cloud database service, Redis, Kubernetes, a card database, or a full MTG rules engine to satisfy the first release. One server process and one database on a local persistent volume are sufficient. This SQLite deployment is single-instance; horizontally scaled servers would need a later architecture change.

Suggested layout:

```text
src/
  client/
    app/                 # launch, mode selection, hydration, navigation
    components/          # shared accessible controls and surfaces
    features/
      board/
      players/
      commander/
      utilities/
      rooms/
      history/
      settings/
    adapters/            # local-game and shared-room controllers
    storage/             # IndexedDB repositories and migrations
    styles/              # tokens, layout, motion, accessibility
  shared/
    domain/              # types, pure reducer, invariants, history
    schemas/             # validation and protocol definitions
  server/
    http/                # guest sessions, rooms, assets, health
    realtime/            # sockets, subscriptions, presence
    services/            # authorization and transaction orchestration
    database/            # repositories and SQLite migrations
tests/                   # domain, integration, browser tests
public/                  # local icons, fonts, manifest assets
docs/                    # architecture, deployment, testing, assets
Dockerfile
compose.yaml
compose.local.yaml
.env.example
.dockerignore
.github/workflows/
README.md
BUILD_PLAN.md
```

The game reducer must not depend on React, the DOM, storage, sockets, or time/randomness globals. Supply IDs, timestamps, and random outcomes from the controller. Both modes use the same rules and command types. View components call the active adapter; they do not write persistence directly.

### Data contracts

Define stable IDs for players, commanders, games, rooms, members, events, and operations. Reordering a visual seat never changes an ID. Keep presentation preferences apart from shared game state.

At minimum model:

- `GameState`: schema version, game ID, revision, preset/settings, ordered player IDs, players, commanders, damage received, global markers, optional turn state, timer timestamps, lifecycle status.
- `Player`: ID, display name, palette, life, poison, named counters, eliminated flag.
- `Commander`: ID, owner player ID, label, command-zone cast count. Control changes do not replace its ID.
- `HistoryEntry`: event ID, actor, operation ID, command summary, reversible field changes/group ID where applicable, timestamp and committed revision.
- `LocalProfile`: installation ID, device preferences, last active mode/game/room, local seat rotations, schema version.
- `Room`: ID, invitation code, monotonic room revision, current game ID, host member ID, permissions policy, join lock, created/updated/expiry times, protocol version. Keep the code retrievable for the host's share screen, exclude it from general snapshots/logs, and index it uniquely; only guest session bearer credentials must be stored as hashes.
- `GuestSession` and `RoomMember`: hashed credential/expiry, role, guest-to-seat mapping, revoked state. Presence is transient and separate from membership.
- `Roll`: unique ID, requester, dice specification or candidate IDs, persisted results, timestamp. Never persist animation frames.

Use maps keyed by IDs for commander damage, with absent entries interpreted as zero. Impose bounded names, histories, dice counts, and payload sizes. Render player input as text. Imports need a schema version, size limit, structural validation, referential checks, and finite integer checks before any replacement.

## 8. Persistence and synchronization contracts

### Local game saves

Use IndexedDB as the authoritative local store. Save each accepted mutation immediately in a transaction containing game state/revision and relevant history. Serialize writes; do not wait for `beforeunload` and do not defer essential saves until a debounce expires. The interface can show an optimistic preview, but must distinguish pending changes from confirmed saves. Resolve interrupted saves on reload from the last committed transaction. [MDN: Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB).

Use a transaction-level revision comparison so a stale tab cannot overwrite a newer game. Use BroadcastChannel, where supported, to notify other tabs. A second local editing tab should become read-only or request takeover; the revision check remains the correctness mechanism when messaging is unavailable. On conflict, reload committed state and explain the rejected action rather than silently discarding someone else's changes.

Handle unavailable storage, quota errors, corrupt records, and unknown future schema versions. Keep a previous valid checkpoint and provide recovery/export controls. Never overwrite unreadable data with defaults automatically. If only memory storage is available, gameplay may continue with a visible “Changes aren't being saved” notice and export. Request persistent browser storage opportunistically when supported; denial is not a failure to play.

Export a versioned JSON game/backup without guest credentials. Imports preserve the receiving browser's installation ID and validate before a confirmed replacement. In shared mode, export a committed game snapshot; importing creates a new local game or a new host-owned room, never overwrites a live room implicitly. An export is data portability, not a way to inherit host authority.

### Shared-room operations

The server is authoritative. Clients submit commands, not complete replacement state. Use one room subscription per socket and a versioned protocol. A representative command envelope contains:

```ts
type CommandEnvelope = {
  protocolVersion: number;
  roomId: string;
  gameId: string;
  operationId: string;       // unique and stable through retries
  baseRevision: number;      // roomRevision in shared mode
  command: GameCommand;      // validated discriminated union
};
```

The authenticated actor comes from the server session; ignore any client-supplied actor/role. Authenticate and validate the envelope first, then look up an existing receipt for the same actor/operation before testing mutable game IDs or host roles. An identical already-committed operation returns its original acknowledgement, even if that operation changed the match or transferred host. A receipt lookup must not reveal new private room data to a now-revoked member. Only unseen operations proceed through current membership, authorization, and game/precondition checks.

Apply each unseen accepted operation inside one SQLite transaction. Persist the new snapshot, ordered event, and idempotency result together. Acknowledge only after commit, then broadcast the new revision and compact snapshot. Eight-player state is small enough that full current-state broadcasts are preferable to a complicated patch protocol; send history separately or as the newest entry. Authentication revocation and command execution must not race to allow a revoked actor to commit another action.

Define `roomRevision` as a monotonic integer advanced by every shared gameplay or administrative commit, including approval, host transfer, settings, and rematch. It never resets within a room. Broadcast it alongside `gameId` and the game snapshot; use it to order messages and guard structural edits. A new match changes `gameId` without rewinding `roomRevision`. Local games retain their own transaction revision. Do not compare revisions from different rooms or substitute a reset per-game revision for the room revision.

Relative adjustments such as “life −1” apply to current authoritative state in server order even if unrelated edits advanced the revision. Absolute edits, undo, reset, seat reassignment, and other structural operations require the appropriate current revision or field precondition; reject stale operations with a fresh snapshot and a clear correction path. No last-writer-wins replacement of the whole board.

Keep a unique idempotency record for each `(roomId, actorId, operationId)` for the lifetime of the room, including the original game ID and payload hash. Repeated operations return their original outcome without applying again; reject reuse of an ID with different content. Deduplication must survive rematches/server restart and outlive the displayed history limit. Returning an old acknowledgement must not replace a newer client snapshot. Ignore older received revisions on clients; on a detected gap or reconnect fetch a fresh snapshot.

For responsive controls, render pending local deltas on top of confirmed state. Rebase still-pending operations when a new authoritative revision arrives and remove acknowledged IDs. Persist the very small set of submitted but unacknowledged operation envelopes before sending, so a refresh after a lost acknowledgement can query/retry the same IDs. Do not invent a new ID for a retry.

On disconnect, cancel held input and disable new shared mutations. Show “Reconnecting — changes paused” and the last confirmed state. Unsent actions are not silently queued for later. On reconnect, reauthenticate, resolve already-submitted operation IDs, fetch the current game, and reconcile before enabling controls. If the match changed, reject old commands. Unknown submitted operations can be retried with their original IDs only when still valid; stale absolute changes require user correction. If membership/session is lost, show explicit rejoin guidance and retain a readable record of unresolved actions until accounted for.

Provide an explicit **Continue a copy on this device** action during an outage. It forks the last confirmed snapshot into a new local game, clearly labels it independent, and never automatically merges it back. Switching modes otherwise creates/selects a game; it does not erase the other mode's saved game. Promoting a local game to a room may create a server copy from its committed snapshot, leaving the local original archived.

### Room lifetime and server boundaries

Retain inactive rooms for a configurable period, initially 30 days since the last committed game/admin activity. Display expiry information in the room menu. Socket heartbeats alone do not extend retention indefinitely. Clean expired rooms, sessions, and operation records deliberately; test the expiry path. No global searchable room directory is needed.

Check allowed Origin values for state-changing HTTP requests and WebSocket upgrades; use same-origin deployment and explicit CSRF protection for cookie-authenticated mutations. Validate every socket message after connection. Rate-limit session creation, room creation/join attempts, and commands; allow normal held-button and multi-touch use. Bound message size and pending socket buffers. Use heartbeat/reconnect backoff with jitter and detect sleeping/backgrounded clients. [Fastify WebSocket docs](https://github.com/fastify/fastify-websocket), [MDN: WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket).

Separate internal room IDs from public invitation codes. Codes invite participants; they are not host credentials. Do not log cookies, invitation URLs, tokens, or entire player payloads. Configure the public origin and trusted reverse-proxy hops rather than blindly trusting arbitrary forwarding headers. Include protocol/schema version negotiation so an old cached client is asked to update before sending incompatible commands.

## 9. Offline behavior and PWA updates

Cache the app shell and required local assets for offline reopening after a successful initial load. One-device games remain usable offline. A cached shared-room screen cannot synchronize without a reachable server; use the explicit outage behavior above. Local-network rooms can work without public internet if all devices can still reach the host.

Service workers and some enhancements require HTTPS, with a localhost development exception. An HTTP LAN address should still support core play and saving; installability, offline reopening, and wake lock are progressive enhancements. Feature-detect `crypto.randomUUID()` and fall back to UUID-formatted bytes from `crypto.getRandomValues()` so normal LAN HTTP does not crash on ID creation. [MDN: secure-context features](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts/features_restricted_to_secure_contexts), [MDN: getRandomValues](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues).

Precache only application assets; exclude session, room, and mutation endpoints from service-worker caching. Bundle essential fonts/icons locally. Show “Update available” and let the user apply it after saving or finishing the game. Do not force a reload in the middle of play. Migrations must preserve valid games and refuse unsupported future versions safely. [Vite PWA: prompt for update](https://vite-pwa-org.netlify.app/guide/prompt-for-update).

## 10. Local development, Docker, and distribution

### Local development first

Supply root scripts with documented behavior: `npm run dev`, `npm run build`, `npm start`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run test:e2e`. `dev` starts Vite and the API server; Vite proxies API and WebSocket routes so the browser uses one origin. Use a task-specific local data directory excluded from Git. Explain phone testing on the LAN and the difference between the computer's localhost and a URL another phone can reach.

### Docker deliverables

Provide a multi-stage Dockerfile: dependency/build stage, then a minimal production Node runtime running the compiled server and built frontend. Run as a non-root user, bind `0.0.0.0:8080`, and shut down cleanly on SIGTERM. Include only production dependencies/assets. Add a health endpoint that verifies database readiness without exposing room information.

Persist SQLite and required sidecar files under `/data`; mount a named volume backed by local storage, not a network filesystem. Initialize that directory with correct non-root ownership. Use WAL, foreign keys, a sensible busy timeout, transactional migrations, and database-consistent backup/restore instructions. A live backup must use SQLite's backup mechanism or a controlled shutdown; do not tell users to copy only the active `.sqlite` file while ignoring WAL data. [SQLite: WAL constraints](https://sqlite.org/wal.html).

Important distinction: local games live in browsers; shared games, guest sessions, memberships, and deduplication records live in the server volume. Recreating a container with the same volume and URL should preserve shared sessions and rooms. Deleting the volume removes server data; changing scheme/host/port changes the browser storage context.

Deliver `compose.local.yaml` for building locally and `compose.yaml` for pulling the published image. Example target configuration, with placeholders resolved before publication:

```yaml
services:
  mtg-util:
    image: ghcr.io/OWNER/mtg-util:VERSION
    ports:
      - "8080:8080"
    environment:
      NODE_ENV: production
      PORT: "8080"
      DATA_DIR: /data
      PUBLIC_ORIGIN: http://localhost:8080
      ALLOW_INSECURE_HTTP: "true" # deliberate local/LAN example
      ROOM_TTL_DAYS: "30"
    volumes:
      - mtg-util-data:/data
    restart: unless-stopped
volumes:
  mtg-util-data:
```

Document setting `PUBLIC_ORIGIN` to the actual LAN address or HTTPS domain before sharing QR links. Public deployments should use HTTPS through a reverse proxy that forwards WebSocket upgrades and preserves long-lived connections. Derive `wss://` from the HTTPS origin. `ALLOW_INSECURE_HTTP` defaults to false; set it explicitly to true only for the documented HTTP local/LAN setup above. The HTTPS deployment example sets it to false and uses secure cookies. Fail clearly on contradictory configuration instead of shipping a LAN login loop caused by a Secure cookie on HTTP.

Use immutable caching for hashed assets, revalidation for HTML and the service worker, and appropriate no-store headers for session/private API responses. Add `.dockerignore`, `.env.example`, a health check, and practical update/backup/restore commands. A static-only hosting service such as GitHub Pages cannot run the shared-room backend; GitHub can host the source and registry while Docker runs on a suitable server.

### Publishing later

Prepare GitHub Actions that lint, typecheck, test, and build on pull requests. Release builds should publish versioned images to GHCR, with version, commit, and stable/latest tags following a documented policy. Build `linux/amd64` and `linux/arm64`; native SQLite must actually start on both architectures, not merely produce manifests. Use limited workflow permissions and registry credentials through GitHub's supported mechanisms. [Docker: multi-platform GitHub Actions](https://docs.docker.com/build/ci/github-actions/multi-platform/).

Prepare the publication workflow and README, but do not claim publication occurred or push code/images merely because this plan exists. The user's present request is planning, and the repository/registry destination has not been chosen. When publication is requested, finalize owner/image names, select the source license with the owner, publish, make the package public if intended, and verify an unauthenticated pull from a clean environment. Public source alone does not establish package visibility. [GitHub: Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

README instructions must cover installing/running locally, starting from a pulled image, creating/joining a room, persistence and origin limitations, HTTPS/PWA behavior, updating, backing up, and restoring. Include screenshots of an actual built four-player board and eight-player board. Record font/art licenses in `docs/assets.md`; keep credentials, generated databases, and personal exports out of the repository.

## 11. Implementation milestones and completion gates

1. **Foundation and visual system.** Scaffold the repository/scripts, shared schemas/reducer, design tokens, navigation, and responsive board. Establish two-, four-, and eight-seat layouts using realistic data. Gate: local development works and touch/keyboard controls are readable at target sizes.
2. **Complete one-device play.** Add setup, life, poison, per-commander damage/tax, optional counters, persistence/migrations, undo/history, and rematch. Gate: a real game can be played, refreshed, and resumed without losing committed data.
3. **Complete shared rooms.** Add guest sessions, create/join/QR, approvals, room permissions, server storage, live commands, idempotency, reconnect, safe undo, host transfer, and expiry. Gate: independent browsers converge under simultaneous actions and reconnects; the one-device mode still works independently.
4. **Utilities and presentation polish.** Complete animated dice/coin/first-player tools, timing controls, sound/effects settings, accessibility, and PWA caching/updates. Gate: visual inspection on mobile and desktop; reduced-motion behavior is complete and dice results remain stable.
5. **Packaging and release readiness.** Add Docker/Compose, multi-architecture checks, documentation, CI, and release templates. Gate: container restart preserves rooms, LAN play works, HTTPS proxy behavior is tested, and a new developer can follow the README.

These are implementation order, not optional scope cuts. Make each milestone functional before adding its next layer of polish. Record actual verification and any remaining device-specific limitations in `docs/testing.md`. Do not leave visible dead buttons or placeholder shared-room flows in a claimed complete release.

## 12. Verification and acceptance checklist

Write focused tests for invariants, persistence, authorization, and sync failures. Avoid tests that only repeat component internals. Use manual visual/touch review alongside automation.

### Domain and persistence

- [ ] Player counts 1–8 work; setup defaults and custom starting life are correct.
- [ ] Rapid taps and independent simultaneous touches produce the exact expected total.
- [ ] Holds stop after cancellation, modal opening, backgrounding, and disconnect.
- [ ] Negative life is supported; negative nonnegative-counter values are rejected.
- [ ] Partners at 11 damage each do not trigger the same result as one commander at 22.
- [ ] Own/stolen commander damage, life gain, renaming, and seat reordering preserve source identity.
- [ ] Record damage + life change is atomic; correcting damage changes only the chosen total.
- [ ] Cast counts produce the correct next-cast additional tax independently per commander.
- [ ] Undo/redo, rematch, markers, and eliminated players preserve the documented behavior.
- [ ] Immediate refresh, backgrounding, and reopening restore the last committed game and history.
- [ ] Two local tabs cannot silently overwrite one another.
- [ ] Invalid imports, future schemas, quota/storage denial, and corrupted data have recovery paths.
- [ ] Export/import works without copying installation identity or guest credentials.

### Shared rooms

- [ ] Two independent browser contexts and an eight-participant scenario share one consistent game.
- [ ] Unapproved guests cannot read the board or mutate it; approved players cannot edit unauthorized seats.
- [ ] Two guests racing for a seat produce one valid assignment.
- [ ] Simultaneous life −1 operations both count; a stale absolute set/reset is rejected.
- [ ] A duplicate operation applies once, including after lost acknowledgement and server restart.
- [ ] Lost acknowledgements for rematch and host transfer return the original outcome on retry; room revisions never rewind.
- [ ] Disconnect after submit, refresh while pending, out-of-order messages, and game reset while a command is in flight reconcile correctly.
- [ ] Reconnect restores the assigned seat and current server state; a revoked/expired session cannot resume access.
- [ ] Shared undo cannot roll back an intervening player's changes.
- [ ] Every client sees the same recorded dice result; rejoin does not generate another roll.
- [ ] Join lock, invitation rotation, removal, host transfer, and room expiry work as described.
- [ ] Host phone sleep does not end the room; disconnected controls pause and recover honestly.
- [ ] Foreground HTTP session renewal preserves a valid guest identity; expired/revoked authority cannot be renewed, and shared timers tolerate skewed phone clocks.
- [ ] Switching/forking between modes never silently merges or overwrites games.

### UX, browser, and deployment

- [ ] Inspect 320×568, 390×844, 844×390, tablet, and desktop layouts with 2/4/6/8 seats.
- [ ] Primary journeys work in iPhone Safari and Android Chrome browser tabs, including keyboard entry, safe areas, joining, and JSON import/export.
- [ ] Phone lock/unlock, app switching, interrupted touches, and background socket suspension restore a usable and synchronized board.
- [ ] Installed/home-screen mode and mobile install guidance are tested separately; physical-device results are distinguished from emulation.
- [ ] No clipped values, accidental overlay taps, tiny targets, or inaccessible offscreen seats.
- [ ] Keyboard/screen-reader dialogs, focus restoration, contrast, zoom, and reduced motion work.
- [ ] Life feedback is immediate; eight-player animations stay smooth on a representative phone.
- [ ] Target input response below 100 ms locally and shared committed updates below 300 ms on a healthy LAN; record measurements, not unsupported guarantees.
- [ ] Optional heavy dice assets load on demand; no routine animation blocks game input.
- [ ] Local mode reopens offline after a supported HTTPS visit; a service-worker update does not reset a game.
- [ ] LAN HTTP core features work without secure-context API crashes.
- [ ] Docker starts non-root, becomes healthy, serves routes/assets, and passes a create/join/update smoke test.
- [ ] Container recreation with the same volume preserves rooms, guest memberships, and operation deduplication.
- [ ] Backup/restore is verified, and both target CPU architectures start the native database dependency.
- [ ] HTTPS reverse-proxy/WebSocket behavior is checked; publication instructions distinguish prepared artifacts from actually published images.

## 13. Explicit later additions

Accounts and cross-device personal history; optional cloud sync of local games; searchable cards/art; deck integrations; full team formats including Two-Headed Giant; tournament/match statistics; advanced mana/storm/phase tools; dungeon and Planechase assistance; spectator links; richer 3D dice; and multi-instance server hosting.

Keep stable IDs, shared domain functions, versioned storage, and clear guest membership boundaries so these can be added later. Do not build speculative frameworks for them now.

## 14. Copy/paste instruction for Sol

> Read `BUILD_PLAN.md` in full and implement the application in this directory. Assume 99% of users are on iPhone or Android: design and test the entire experience for mobile browsers first, with no installation requirement. Deliver both One device and Shared room modes, account-free resume, all required game trackers, polished responsive fantasy styling and animations, focused tests, local development scripts, and Docker/Compose packaging. Follow the milestone order, verify each gate, preserve any existing user changes, and make routine implementation decisions autonomously. Keep the domain shared between local and server modes. Do not replace anonymous browser/session persistence with fingerprinting or introduce account registration. Prepare publication files and documentation; publishing to a real GitHub/registry destination is a separate user-directed step. Finish with exact run commands, verification results, and any concrete remaining limitations.
