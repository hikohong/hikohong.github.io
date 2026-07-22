# DeepSignalWeb Agent Memory

## Identity
You are the **DeepSignalWeb agent** for `hikohong/hikohong.github.io`.
Your job is to maintain and evolve the public GitHub Pages site at https://hikohong.github.io,
with a primary focus on the **DeepSignal** SETI/anomaly research portal.

Owner: Hiko Hong (hikohong@gmail.com)
Live site: https://hikohong.github.io
DeepSignal portal: https://hikohong.github.io/deepsignal/

---

## Repository Structure

```
/
├── CLAUDE.md                    ← this file (agent memory)
├── README.md                    ← public-facing one-liner
├── index.html                   ← homepage (dark sci-fi theme, links to DeepSignal)
├── assets/
│   ├── deepsignal-footprint.jpg ← tile thumbnail on homepage
│   ├── deepsignal-reference.jpg ← reference visual
│   └── deepsignal-web-icon.jpg  ← browser favicon
└── deepsignal/
    ├── index.html               ← DeepSignal landing/report page
    ├── gallery.html             ← candidate gallery (all DS-XXXX cards)
    ├── catalog.json             ← machine-readable candidate catalog
    ├── report.md                ← full analysis report (English)
    ├── report_zh.md             ← full analysis report (Chinese)
    ├── anomalies/
    │   ├── anomalies.json       ← anomaly event records
    │   ├── candidates.json      ← SETI candidate records (scored, ranked)
    │   └── detection_summary.json ← aggregate detection stats
    ├── images/                  ← multi-wavelength sky cutout JPEGs
    │   └── DS-XXXX_TargetName.jpg  (naming: zero-padded 4-digit ID, underscore, target)
    ├── processed/
    │   ├── observations.json    ← merged/cleaned observation data
    │   └── statistics.json      ← summary stats (counts, score distributions)
    ├── raw/                     ← raw pipeline inputs (do not hand-edit)
    │   ├── breakthrough_targets.json
    │   ├── exoplanet_targets.json
    │   ├── fermi_sources.json
    │   ├── frb_observations.json
    │   ├── gaia_stars.json
    │   ├── interstellar_objects.json
    │   ├── ir_observations.json
    │   ├── jwst_atmospheric.json
    │   ├── optical_observations.json
    │   ├── radio_observations.json
    │   ├── stellar_catalog.json
    │   ├── tess_lightcurves.json
    │   └── xray_sources.json
    ├── reports/                 ← versioned copies of report outputs (mirrors deepsignal/)
    │   ├── catalog.json
    │   ├── gallery.html
    │   ├── report.md
    │   └── report_zh.md
    └── search/                  ← per-target search/detail pages (static HTML)
        └── TargetName.html      (19 files: stars, planets, FRBs, interstellar objects)
```

---

## DeepSignal Data Pipeline

Data flows from an **upstream pipeline** (separate repo) into this site:

```
Upstream pipeline output
        ↓
deepsignal/raw/          ← raw JSON from telescopes / catalogs
        ↓
deepsignal/processed/    ← cleaned, merged observations + statistics
        ↓
deepsignal/anomalies/    ← scored candidates + anomaly events
        ↓
deepsignal/{index.html, gallery.html, catalog.json, report.md, images/}
deepsignal/reports/      ← versioned copy of current outputs
deepsignal/search/       ← per-target static pages
```

Commits landing from the upstream pipeline use the message pattern:
`Update DeepSignal public website output`

---

## Site Design

- **Color palette:** `#08111f` (deep navy background), `#eef3f8` (light text), `#7dd3fc` (sky blue accent), `#f97316` (orange accent), `#94a3b8` (silver auxiliary), `#10b981` (green Map)
- **Font:** system-ui / -apple-system / "Segoe UI" / sans-serif
- **Layout:** CSS Grid, `min(1080px, 100%)` centered shell, responsive tiles
- **No framework, no build step** — pure HTML/CSS/JS, static files only
- **Favicon:** `assets/deepsignal-web-icon.jpg`

### Modal color hierarchy

| Color | Hex | Usage |
|-------|-----|-------|
| Blue | `#7dd3fc` | Primary interactive; **all modal chrome** (border/glow/header/filter chips/links) — News modal matches Report/Map dialog |
| Green | `#10b981` | Map button + modal chrome only |
| Silver | `#94a3b8` | Auxiliary entry-point buttons only (e.g. `.btn-news` card button) — NOT modal chrome |
| Orange | `#f97316` | Reserved for urgent/alert states ONLY |
| Avionics green | `#3fe08f` | NAVCON HUD instrument layer ONLY (telemetry bar, corner brackets, self-test panel, radar sweep, sensor ticks, reticle) — never content/modal chrome |

### Homepage (`index.html`) structure
- Signature bar (HH monogram + name)
- Hero section: eyebrow → H1 → intro paragraph → CTA buttons
- Portal tiles grid (one tile per project, currently just DeepSignal)

### DeepSignal pages
- `deepsignal/index.html` — full inline report with candidate summaries, stats, methodology
- `deepsignal/gallery.html` — all candidate cards with images, scores, metadata
- `deepsignal/search/*.html` — individual target detail pages

---

## Candidate Naming Convention

Images: `DS-{XXXX}_{Target_Name}.jpg`
- XXXX = zero-padded 4-digit candidate ID
- Target = star/FRB/object name with underscores (e.g. `Proxima_Centauri`, `FRB20121102A`)
- Multiple images per candidate ID are normal (multi-wavelength cutouts)

---

## Git Workflow

- **Feature branches:** `claude/<slug>` for design/code changes; `claude/update-website-YYYYMMDD` for pipeline publishes
- **Production:** `master` branch → auto-deploys to GitHub Pages
- **Never push directly to master** — always PR + squash merge
- **Commit message convention:** imperative mood; pipeline publishes use "Publish DeepSignal website output YYYY-MM-DD"
- **After merge:** delete remote branch (`git push origin --delete <branch>`) and local branch (`git branch -d <branch>`), then `git checkout master && git pull origin master`

```bash
# Feature work
git checkout -b claude/<slug>
git push -u origin claude/<slug>

# Website publish
BRANCH="claude/update-website-$(date -u +%Y%m%d)"
git checkout -b $BRANCH
# ... copy files, commit ...
git push -u origin $BRANCH
```

---

## Deployment

GitHub Pages serves `master` branch root directly. No build step needed.
Changes to `master` are live at https://hikohong.github.io within ~1 minute.

### Custom deploy workflow (preferred path)

`.github/workflows/deploy-pages.yml` deploys the repo root directly via
`actions/upload-pages-artifact` + `actions/deploy-pages`, with an automatic
in-run retry for the transient 401. Requires Settings → Pages → Source =
"GitHub Actions" (`configure-pages` with `enablement: true` attempts the
switch automatically). Once active, the built-in `pages build and deployment`
workflow stops running.

### Deploy troubleshooting — 401 "Requires authentication" failure (legacy workflow)

The built-in `pages build and deployment` workflow occasionally fails at the **Deploy** step with a 401 error after the build succeeds. This is a transient GitHub infrastructure issue (hit 3 of 5 merges in July 2026 — hence the custom workflow above).

**Fix:**
1. Use `rerun_failed_jobs` on the failed run (via MCP GitHub tools).
2. If the re-run stays in `queued` for more than ~2 minutes, push a trivial change through a new PR (e.g. trailing newline in README.md). The fresh merge triggers a new clean run that succeeds.
3. Never push directly to master — always use a PR.

---

## Common Tasks

### Update site content from pipeline output
1. Receive new files (raw/, processed/, anomalies/, images/, HTML, JSON)
2. Copy into appropriate `deepsignal/` subdirectories
3. Commit with message: `Update DeepSignal public website output`
4. Push to feature branch, open PR to master

### Add a new search/target page
- Create `deepsignal/search/{TargetName}.html` following the pattern of existing pages
- Add link from `deepsignal/index.html` or `gallery.html` as appropriate

### Add a new project tile to homepage
- Add image to `assets/`
- Add `.tile` block to `index.html` portal section

### Add a new candidate
- Add entry to `deepsignal/anomalies/candidates.json`
- Add image(s) to `deepsignal/images/`
- Rebuild `deepsignal/gallery.html` and `catalog.json`
- Update `deepsignal/index.html` stats section if needed

---

## SFX Audio Engine

`deepsignal/sounds/` contains WAV files used by both the Search and Gallery pages:

| File | Logical key | Use |
|------|-------------|-----|
| `click.wav` | `click` | Nav buttons, card clicks, any interactive tap |
| `scan.wav` | `scan` | Search initiated |
| `open2.wav` | `open` | Modal open (Map, Report, Literature) |
| `close2.wav` | `close` | Modal close |

The engine is embedded in `deepsignal/index.html` and `deepsignal/gallery.html`.

**Critical patterns:**
- Audio elements stored in `_loaded` immediately on page load (not waiting for `oncanplaythrough`) — prevents silent clicks on fast interactions
- `playFile`: reuses the preloaded element (`currentTime = 0; a.play()`) — do NOT replace with `new Audio(src)` (unreliable on Mac Safari)
- `navTo(href)`: calls `SFX.click()`, detects same-page URL to avoid reload, navigates after 350ms delay
- `mapOpen()` / `reportOpen()` / `litOpen()`: call `SFX.open()` internally — do NOT add extra `SFX.click()` on the trigger buttons
- ESC key: only closes open modals — does NOT call `history.back()`
- Paper cards in Literature dialog: entire card is clickable (opens DOI → arXiv → semUrl); `.lit-actions` buttons guard against double-open

---

## Key JSON Schemas (summary)

### `deepsignal/anomalies/candidates.json`
Array of candidate objects. Fields include: `id` (DS-XXXX), `target`, `ra`, `dec`,
`score`, `signal_type`, `wavelengths`, `summary`, `images`, `report_url`.

### `deepsignal/catalog.json`
**Plain JSON array** of candidate objects (NOT a wrapped dict). Published by the pipeline.
Fields per entry: `obs_id`, `target_name`, `ra_deg`, `dec_deg`, `candidacy_score`, etc.

### `deepsignal/processed/statistics.json`
Aggregate counts: total_candidates, by_signal_type, score distributions.

### `deepsignal/catalog_history.json`
Array of `{date, scores: {target_name: score}}` — one entry per pipeline publish (last 30).
Appended by the upstream `publish-pages.yml`; powers per-candidate score sparklines.
Mirrored to `deepsignal/reports/`. Companion `catalog.prev.json` (previous run snapshot)
powers the NEW/Δ run-diff badges.

### NAVCON PRO-6 — JARVIS / Iron Man HUD (deployed in index.html + gallery.html)
Offline rule-based JARVIS assistant (`_ask`, voice I/O, daily briefing), Target Lock
overlay, radial quick-menu, cursor micro-HUD, NOW opportunity queue, instrument
gauges, AR live-sky camera overlay, haptics. Advisory CI test:
`.github/scripts/e2e-full/pro6test.mjs`. Deep dive lives in the upstream deepsignal
CLAUDE.md; these files are generated output — edit upstream, never hand-patch here.

### NAVCON PRO-7 — JARVIS deepening (deployed in index.html + gallery.html)
Conversational upgrades to JARVIS (multi-turn context, planning/comparison/explain
intents, proactive voice), Session Mode (guided live observing run), similar-candidate
search, shareable Target Lock card PNG export, ⌘K command palette, and an accessibility
pass (aria-live, focus-visible, reduced-motion). Advisory CI test:
`.github/scripts/e2e-full/pro7test.mjs`. Generated output — edit upstream, never here.

### NAVCON PRO-8 — JARVIS conversational reach (deployed in index.html + gallery.html)
JARVIS gains an offline glossary knowledge base ("what is doppler drift", "what does
tier 2 mean"), fuzzy/typo-tolerant target resolution, one-phrase action chains ("track
the best 3 tonight", "clear my tracking list"), and natural-language conditional alerts
("notify me when Vega reaches 40 degrees") with a 60 s watcher that fires a Web
Notification + voice + CAS. Advisory CI test: `.github/scripts/e2e-full/pro8test.mjs`.
Generated output — edit upstream, never here.

---

## Constraints

- No npm, no bundler, no framework — keep it pure static HTML/CSS/JS
- All paths are relative (no absolute URLs to the domain in HTML)
- Images are local; do not hotlink external image hosts
- JSON files use 2-space indentation
- Keep `deepsignal/reports/` in sync with `deepsignal/` top-level outputs
- `catalog.json` must remain a plain array (not a wrapped `{"version":…,"candidates":[…]}` dict)
- `gallery.html` must have 0 `../images/` references (use `images/` relative path)
- `index.html` must have 0 `{{N_CANDIDATES}}` or `{{UPDATED}}` placeholders after publish
