// Pre-deploy smoke test for the static site — no browser needed.
// 1. node --check every inline <script> block (catches JS syntax regressions)
// 2. content invariants: no unreplaced {{placeholders}} in the Search page,
//    no ../images/ refs in the gallery.
// Run by .github/workflows/deploy-pages.yml before publishing.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const files = ['index.html', 'deepsignal/index.html', 'deepsignal/gallery.html'];
let fail = 0;

for (const f of files) {
  let html;
  try { html = readFileSync(f, 'utf8'); }
  catch { console.log('SKIP (missing):', f); continue; }

  const re = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m, idx = 0, blocks = 0;
  while ((m = re.exec(html))) {
    const body = m[1];
    if (!body.trim()) { idx++; continue; }
    const tmp = join(tmpdir(), `chk_${process.pid}_${idx}.js`);
    writeFileSync(tmp, body);
    try { execFileSync('node', ['--check', tmp]); blocks++; }
    catch (e) { console.log(`FAIL ${f} script#${idx}:`, String(e.stderr || e).slice(0, 500)); fail++; }
    finally { unlinkSync(tmp); }
    idx++;
  }
  console.log(`OK  ${f}: ${blocks} inline script block(s) parsed`);

  if (f === 'deepsignal/index.html' && html.includes('{{')) {
    console.log(`FAIL ${f}: unreplaced {{ }} placeholder(s)`); fail++;
  }
  if (f.endsWith('gallery.html') && html.includes('../images/')) {
    console.log(`FAIL ${f}: ../images/ reference(s) — must be images/`); fail++;
  }
}

if (fail) { console.log(`\nWEB VALIDATION FAILED (${fail} problem(s))`); process.exit(1); }
console.log('\nWEB VALIDATION PASSED');
