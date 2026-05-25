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

- **Color palette:** `#08111f` (deep navy background), `#eef3f8` (light text), `#7dd3fc` (sky blue accent), `#f97316` (orange accent)
- **Font:** system-ui / -apple-system / "Segoe UI" / sans-serif
- **Layout:** CSS Grid, `min(1080px, 100%)` centered shell, responsive tiles
- **No framework, no build step** — pure HTML/CSS/JS, static files only
- **Favicon:** `assets/deepsignal-web-icon.jpg`

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

- **Development branch:** always use `claude/confident-lovelace-NAJyN` (or a new `claude/` branch for new tasks)
- **Production:** `master` branch → auto-deploys to GitHub Pages
- **Never push directly to master** — use PRs
- **Commit message convention:** imperative mood, describe the change; pipeline commits use "Update DeepSignal public website output"

```bash
git push -u origin claude/confident-lovelace-NAJyN
```

---

## Deployment

GitHub Pages serves `master` branch root directly. No build step needed.
Changes to `master` are live at https://hikohong.github.io within ~1 minute.

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

## Key JSON Schemas (summary)

### `deepsignal/anomalies/candidates.json`
Array of candidate objects. Fields include: `id` (DS-XXXX), `target`, `ra`, `dec`,
`score`, `signal_type`, `wavelengths`, `summary`, `images`, `report_url`.

### `deepsignal/catalog.json`
Top-level catalog served to the gallery page. Contains metadata + candidate array.

### `deepsignal/processed/statistics.json`
Aggregate counts: total_candidates, by_signal_type, score distributions.

---

## Constraints

- No npm, no bundler, no framework — keep it pure static HTML/CSS/JS
- All paths are relative (no absolute URLs to the domain in HTML)
- Images are local; do not hotlink external image hosts
- JSON files use 2-space indentation
- Keep `deepsignal/reports/` in sync with `deepsignal/` top-level outputs
