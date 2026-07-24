# Aladin Lite (vendored)

Aladin Lite v3.8.2 — interactive HiPS sky atlas by CDS Strasbourg.
Vendored (not CDN) per the site's no-external-dependency policy.

- Upstream: https://github.com/cds-astro/aladin-lite
- License: LGPL-3.0 (see LICENSE) — used unmodified.
- `aladin.js` is the upstream ES-module build; the pages load it via dynamic
  `import()` from `_aladinOpen()` (lazy, only when the atlas is opened).
- Runtime: needs WebGL2; fetches its WASM core + HiPS tiles from CDS servers
  at load time. When any of that is unavailable the console falls back to the
  static multi-survey cutout — the atlas is purely additive.
