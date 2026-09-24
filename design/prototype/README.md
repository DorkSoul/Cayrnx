# Prototype sources (reference only)

Extracted from `CAYRNX_Design_mockup.html` (the bundled React prototypes: desktop 1440×900 and
mobile 390×844, dark/light). The bundle is a page that iframes two nested bundles; each carries
React 18 UMD, a small "dc-runtime" template engine, Google-font woff2 files and one logic class.

| File | What it is |
|---|---|
| `desktop.css` / `mobile.css` | Token sets (`.cx.dark` / `.cx.light`) and component styles, ported to `apps/web/src/styles/` |
| `desktop.template.html` / `mobile.template.html` | dc-runtime templates (`sc-if`, `sc-for`, `{{binding}}`): the markup the React components follow |
| `desktop.logic.js` / `mobile.logic.js` | The prototype's state and actions (`writeMsg`, `buildCmd`, `dotsOf`, `diffLines`, seed data) |
| `extract-bundle.py` | Unpacks the bundle again: `python3 extract-bundle.py CAYRNX_Design_mockup.html <out>` |

Fonts and React aren't kept here; the app self-hosts fonts via `@fontsource`.
Sample content (demo-app, login-timeout, …) is fixture data only; see `tools/fixtures`.
