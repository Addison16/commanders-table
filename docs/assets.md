# Assets and licenses

The interface uses original geometric SVG linework and CSS, with local font files. No card-art collection is bundled. Players may optionally select commander artwork supplied by Scryfall; ordinary life tracking and manually entered commander names work without it. Card artwork remains the property of its respective rights holders and is not covered by this project’s license.

| Asset                                       | Origin                                                                                                        | License / location                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Inter, Latin 400/500/600/700                | Inter Project Authors, distributed by `@fontsource/inter`                                                     | SIL Open Font License 1.1; [included notice](../public/licenses/Inter-OFL.txt)              |
| Cormorant Garamond, Latin 500 normal/italic | Cormorant Project Authors, distributed by `@fontsource/cormorant-garamond`                                    | SIL Open Font License 1.1; [included notice](../public/licenses/Cormorant-Garamond-OFL.txt) |
| Brand sigil / favicon                       | Same original geometry as the homepage's default `Sigil`, with dark icon background and maskable-safe padding | `public/icon.svg`; [PolyForm Noncommercial 1.0.0](../LICENSE)                               |
| Install icons                               | Rendered directly from `public/icon.svg` with `rsvg-convert` at 192 and 512 pixels                            | `public/icon-192.png`, `public/icon-512.png`; [PolyForm Noncommercial 1.0.0](../LICENSE)    |
| UI icons and seat sigils                    | Original SVG paths/components                                                                                 | `src/client/components/ui.tsx`; [PolyForm Noncommercial 1.0.0](../LICENSE)                  |
| Textures, glow and reveal effects           | CSS authored for this project                                                                                 | `src/client/styles/app.css`, `styles/dice.css`                                              |
| Dice solids and animation                   | Original 3D geometry projected with Canvas2D; no downloaded meshes or textures                                | `src/client/dice/geometry.ts`, `DiceCanvas.tsx`, `DiceRoll.tsx`                             |
| Optional sound cues                         | Synthesized tones and dice impacts, no recordings                                                             | `src/client/components/feedback.ts`                                                         |
| Room QR codes                               | Generated locally from the configured invitation URL                                                          | `qrcode` dependency; no external QR API                                                     |
| Board screenshots                           | Captured from the working application with sample player names                                                | `docs/screenshots/`; no personal game exports                                               |

Vite bundles the font subsets into the app shell, and the license notices ship under `/licenses/`. Dependency packages retain their own notices and licenses in the lockfile-resolved packages; choosing an application license does not replace those licenses.

Beginning with v0.1.2, the application, documentation, and original project assets use [PolyForm Noncommercial License 1.0.0](../LICENSE). Noncommercial use, modification, self-hosting, and sharing are permitted under its terms and required notice; commercial use is not licensed. This is source-available licensing, not OSI open source. The previously published [v0.1.0 remains MIT](https://github.com/Addison16/commanders-table/blob/v0.1.0/LICENSE) and [v0.1.1 remains MIT with Commons Clause](https://github.com/Addison16/commanders-table/blob/v0.1.1/LICENSE); their original permissions are not revoked. Third-party fonts and dependencies keep their separate licenses.

`Commander's Table` is an independent fan utility, without endorsement by Wizards of the Coast.

## Optional commander artwork

Scryfall provides card metadata and its dedicated `art_crop` images. The app searches through a bounded, rate-limited server cache, uses only trusted Scryfall card/image URLs, and retains selected public metadata in saved games. Player details and the selection preview identify the artist, link to Scryfall, and show the Wizards of the Coast copyright. Two commanders can share a panel. Images use their natural colors and aspect ratio; only the art crop is displayed behind the counter controls.

The production service worker keeps a separate, bounded cache for viewed public art images; private game APIs are never cached. New searches and uncached images require internet access. Missing art leaves the normal counter usable. See [Scryfall API usage and attribution](https://scryfall.com/docs/api), [image formats](https://scryfall.com/docs/api/images), and [rate limits](https://scryfall.com/docs/api/rate-limits).

Commander's Table is unofficial Fan Content permitted under the [Fan Content Policy](https://company.wizards.com/fancontentpolicy). Not approved or endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. © Wizards of the Coast. This notice also appears in display/browser settings, with per-card credits in the app.
