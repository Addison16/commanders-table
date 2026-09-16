# Assets and licenses

The interface uses original geometric SVG linework and CSS, with local font files. It includes no Wizards of the Coast card art, mana symbols, logos, scanned cards, or third-party illustration packs. No remote asset service is required during play.

| Asset                                       | Origin                                                                         | License / location                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Inter, Latin 400/500/600/700                | Inter Project Authors, distributed by `@fontsource/inter`                      | SIL Open Font License 1.1; [included notice](../public/licenses/Inter-OFL.txt)              |
| Cormorant Garamond, Latin 500 normal/italic | Cormorant Project Authors, distributed by `@fontsource/cormorant-garamond`     | SIL Open Font License 1.1; [included notice](../public/licenses/Cormorant-Garamond-OFL.txt) |
| Brand sigil / favicon                       | Original SVG for this project                                                  | `public/icon.svg`; [MIT License](../LICENSE)                                                |
| Install icons                               | Raster renderings of the original brand SVG                                    | `public/icon-192.png`, `public/icon-512.png`; [MIT License](../LICENSE)                     |
| UI icons and seat sigils                    | Original SVG paths/components                                                  | `src/client/components/ui.tsx`; [MIT License](../LICENSE)                                   |
| Textures, glow and reveal effects           | CSS authored for this project                                                  | `src/client/styles/app.css`, `styles/dice.css`                                              |
| Dice solids and animation                   | Original 3D geometry projected with Canvas2D; no downloaded meshes or textures | `src/client/dice/geometry.ts`, `DiceCanvas.tsx`, `DiceRoll.tsx`                             |
| Optional sound cues                         | Synthesized tones and dice impacts, no recordings                              | `src/client/components/feedback.ts`                                                         |
| Room QR codes                               | Generated locally from the configured invitation URL                           | `qrcode` dependency; no external QR API                                                     |
| Board screenshots                           | Captured from the working application with sample player names                 | `docs/screenshots/`; no personal game exports                                               |

Vite bundles the font subsets into the app shell, and the license notices ship under `/licenses/`. Dependency packages retain their own notices and licenses in the lockfile-resolved packages; choosing an application license does not replace those licenses.

The application and original project assets use the [MIT License](../LICENSE). Third-party fonts retain their separate notices. `MTG Util` is a replaceable working name and an independent fan utility, without endorsement by Wizards of the Coast.
