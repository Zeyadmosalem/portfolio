<p align="center">
  <img src="assets/skull-px.png" width="96" alt="Pixel-art skull logo" style="image-rendering: pixelated" />
</p>

<h1 align="center">Zeyad M. Salem · portfolio</h1>

<p align="center">
  QA automation engineer / SDET. A one-page portfolio in dark red pixel art.<br />
  <a href="https://zeyadmosalem.github.io/portfolio/"><b>zeyadmosalem.github.io/portfolio</b></a>
</p>

---

## Stack

| Layer | What | Why |
| --- | --- | --- |
| Markup | Plain HTML5, one page | No framework or build step. The repo *is* the site. |
| Styles | Hand-written CSS, custom properties | A small set of tokens (`--red`, `--u` for one UI pixel) keeps the pixel look consistent. |
| Scripts | Vanilla JavaScript, plus one ES module (`fx.js`) | Each effect is a few dozen lines. No dependencies to keep updated. |
| Pixel effects | [pixelfx](https://github.com/patch-gg/pixelfx) (MIT) | Code-driven pixel-art effects, recolored in the site's dark red. |
| Screenshot viewer | [Glisse.js](https://github.com/Victa/Glisse.js) v1.1.1 + jQuery 3.7.1 | Full-screen viewer for the app screenshots, with keyboard arrows and captions. |
| Fonts | [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans) and [Silkscreen](https://fonts.google.com/specimen/Silkscreen) from Google Fonts | Pixel type that stays readable at body size. |
| Hosting | GitHub Pages from `main` / root | Free, and every push to `main` redeploys. |
| Built with | [Claude Code](https://claude.com/claude-code) | Design, code and checks were done with Claude Code; I reviewed every version locally. |

## Project layout

```
index.html                 the page: hero, numbers, work, try the apps, approach, about, contact
styles.css                 the whole pixel-art theme
script.js                  nav, copy-email, scroll reveals, Glisse setup, the hero particle field
fx.js                      pixelfx effects (ES module)
Zeyad_Salem_Resume_QA.pdf  resume linked from the About section
assets/
  skull-px.png             32×32 pixel skull logo (scaled up with image-rendering: pixelated)
  favicon-*.png            favicons and the apple-touch icon
  apps/                    NC Spark screenshots and the Samboza icon
vendor/
  pixelfx/                 esbuild bundle of pixelfx + its LICENSE and NOTICE
  glisse/                  Glisse.js and its base CSS (patched for jQuery 3)
  jquery-3.7.1.min.js      self-hosted, Glisse needs it
```

## How it was built

### 1. Content first

The copy comes from my resume and GitHub profile README, written for QA automation roles: what each test suite proves, with real numbers (2,900+ tests, 91% coverage, 532 pgTAP policy tests). The page leads with the work and keeps everything else short.

### 2. Three design passes

1. **Clean purple version.** A first draft matching my GitHub profile colors.
2. **Calm, type-led version.** Removed the gradient text, glows and tilting cards that made the first draft look like a template. Added the cursor ring in the hero, inspired by the hover effect on [antigravity.google](https://antigravity.google/).
3. **Pixel art in dark red (current).** Pixel fonts, notched frames, stepped motion, and pixelfx effects.

### 3. The pixel look in CSS

- **Notched frames without images.** Four hard `box-shadow`s, one per side and offset by one UI pixel (`--u: 4px`), draw a border with stepped corners at any size:

  ```css
  --frame: 0 -4px 0 0 var(--c), 0 4px 0 0 var(--c), -4px 0 0 0 var(--c), 4px 0 0 0 var(--c);
  ```

- **Stepped motion.** Transitions and animations use `steps()` instead of smooth easing, so things move in frames like a sprite.
- **Buttons** lift 2px on hover and press down on click with an inset shadow.
- **Scanlines.** A fixed `repeating-linear-gradient` overlay darkens every third screen row.
- **Crisp images.** The logo is a real 32×32 sprite scaled with `image-rendering: pixelated`.

### 4. The hero particle field (`script.js`)

The canvas is drawn at one third of screen resolution and scaled up, so every particle is one chunky pixel. Each particle has a home on a jittered grid. Near the cursor, a smoothstep weight pulls it toward a ring around the pointer, with a slow swirl, and turns it to face the pointer. A spring brings it back home when the cursor leaves. When nobody moves the mouse (or on phones), the ring drifts on a slow loop by itself. The loop pauses when the hero is off screen or the tab is hidden.

### 5. pixelfx effects (`fx.js`)

[pixelfx](https://github.com/patch-gg/pixelfx) effects are small modules that draw into a pixel frame. Only the parts the site uses are bundled:

```bash
# from a pixelfx checkout
npx esbuild fx-entry.js --bundle --format=esm --minify --outfile=vendor/pixelfx/pixelfx.bundle.js
```

where `fx-entry.js` re-exports `createFrame`, `clearFrame`, `createFx` and `composite` from `src/core`, plus three effects:

| Effect | Where | Palette |
| --- | --- | --- |
| `fire/spirit-flame` | loops behind the skull in the hero, so it burns | dark red ramp `#0b0303 … #ffd9c9` |
| `impacts/hit-spark` | where the cursor enters a button, project card or screenshot, aimed along the mouse direction | red to white |
| `pickups/collect-burst` | over the Copy button when the email is copied | dark red ramp |

Each frame is composited with a transparent background and drawn to a low-resolution canvas, scaled with `image-rendering: pixelated`. One-shot effects share one full-screen overlay canvas that only animates while an effect is alive.

### 6. Glisse.js screenshot viewer

The NC Spark screenshots open in Glisse.js. Each `<img class="shot">` has `data-glisse-big` and `rel="ncspark"` so they form one gallery. Glisse is from 2012 and calls `.load(fn)`, which jQuery 3 removed, so `vendor/glisse/glisse.js` has three lines patched to `.on('load', fn)`. Its controls are restyled as pixel buttons in `styles.css`.

### 7. Contact that always works

A plain `mailto:` link does nothing on a computer with no mail app set up, so the email card has three ways in: **Write in Gmail** (Gmail's compose URL), **Mail app** (`mailto:`), and **Copy**, which copies the address with the Clipboard API (falling back to `execCommand`) and shows a toast. LinkedIn has no public "message me" link, so that button opens the profile.

### 8. Accessibility and performance

- `prefers-reduced-motion` turns off every animation. The hero then draws one still frame and the flame shows a single frame.
- Skip link, visible focus outlines, real buttons and links, alt text, and `aria-hidden` on decorative canvases.
- Animation loops stop when off screen or in a background tab.
- CSS and JS links carry a `?v=` number, so browsers fetch new files after an update.
- The page is about 45 KB of hand-written code, plus a 45 KB pixelfx bundle, 87 KB of jQuery and the images.

### 9. Checks

Every version was rendered in headless Chromium (Playwright) at 1440px and 390px wide, in light and dark where relevant. Each check confirmed no console errors and no horizontal scroll, and covered hovering a button, opening Glisse and copying the email. Then I reviewed it on my own machine at `localhost:5500` before anything was merged.

## Run locally

`fx.js` is an ES module, so serve the folder instead of opening `index.html` from disk:

```bash
python -m http.server 5500
# or
npx serve .
```

Then open http://localhost:5500.

## Deploy

GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / `(root)`**. Every push to `main` redeploys in about a minute. When you change `styles.css`, `script.js` or `fx.js`, bump the `?v=` number in `index.html` so returning visitors don't get a cached copy.

## Credits

- [pixelfx](https://github.com/patch-gg/pixelfx) by Patch and Hugo Duprez, MIT. See `vendor/pixelfx/LICENSE`.
- [Glisse.js](https://github.com/Victa/Glisse.js) by Victor Coulon.
- [jQuery](https://jquery.com/), MIT.
- Fonts: Pixelify Sans and Silkscreen, SIL Open Font License, via Google Fonts.

## License

The code (`index.html`, `styles.css`, `script.js`, `fx.js`) is [MIT](LICENSE): reuse it freely, just keep the copyright notice.

Personal content is **not** covered and stays all rights reserved: the skull logo and favicons, the resume PDF, the screenshots in `assets/apps/`, and the written text about me and my work. Libraries in `vendor/` keep their own licenses. See [LICENSE](LICENSE) for the full scope.
