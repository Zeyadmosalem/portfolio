# portfolio

Personal portfolio site for **Zeyad M. Salem**, QA automation engineer / SDET.

A static site with no build step: plain HTML, CSS and JavaScript.

| File | What it is |
| --- | --- |
| `index.html` | Page content: hero, numbers, work, try-the-apps, approach, about, contact |
| `styles.css` | Pixel-art styles in dark red |
| `fx.js` | pixelfx effects: the burning skull, hover sparks, the copy burst |
| `script.js` | Hero particle field, pill hover fill, copy-email, scroll reveals, mobile menu (motion off with reduced motion) |
| `Zeyad_Salem_Resume_QA.pdf` | Resume linked from the hero |
| `assets/` | Skull logo (light and dark versions), favicons and touch icon; `assets/apps/` holds app screenshots |

## Libraries

- [pixelfx](https://github.com/patch-gg/pixelfx) (MIT): `vendor/pixelfx/pixelfx.bundle.js` is an esbuild bundle of `src/core` plus the spirit-flame, hit-spark and collect-burst effects.
- [Glisse.js](https://github.com/Victa/Glisse.js) v1.1.1: screenshot viewer, in `vendor/glisse/`, patched for jQuery 3 (`.load(fn)` → `.on('load', fn)`).
- jQuery 3.7.1 (MIT), self-hosted in `vendor/` because Glisse needs it.

## Run locally

Serve the folder (`fx.js` is an ES module, so opening `index.html` straight from disk won't run the effects):

```bash
npx serve .
```

## Deploy

Works as-is on GitHub Pages: Settings → Pages → Deploy from branch → `main` / root.
