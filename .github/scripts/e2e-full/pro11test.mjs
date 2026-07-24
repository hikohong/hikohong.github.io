import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const CAT = JSON.parse(readFileSync(process.cwd() + '/deepsignal/catalog.json', 'utf8'));

// a stub ES module standing in for the vendored aladin.js (real one needs WebGL2)
const stubOK = `export default { init: Promise.resolve(), aladin: function(sel, opts){ var d = document.querySelector(sel); if (d) { d.setAttribute('data-aladin-ready','1'); d.__opts = opts; } window.__aladinOpts = opts; return { __stub: true }; } };`;
const stubThrow = `export default { init: Promise.reject('WebGL2 not supported by your browser'), aladin: function(){ return {}; } };`;

async function baseMocks(p) {
  for (const u of ['**/services.swpc.noaa.gov/**', '**/api.open-meteo.com/**', '**/catalog_history.json*', '**/catalog.prev.json*', '**/api.alerce.online/**', '**/simbad.cds.unistra.fr/**', '**/wikipedia.org/**', '**/wheretheiss.at/**'])
    await p.route(u, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await p.route('**/catalog.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CAT) }));
  await p.route('**/alasky.cds.unistra.fr/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
}

const b = await chromium.launch();
const checks = [];
const ck = (l, ok) => checks.push([l, ok]);

/* ── path 1: library loads + inits → atlas renders ── */
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, geolocation: { latitude: 25, longitude: 121 }, permissions: ['geolocation'] });
  await ctx.addInitScript(() => localStorage.setItem('ds-obs', JSON.stringify({ lat: 25, lon: 121, src: 'MANUAL' })));
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await baseMocks(p);
  await p.route('**/vendor/aladin/aladin.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: stubOK }));
  await p.goto('file://' + process.cwd() + '/deepsignal/gallery.html');
  await p.waitForTimeout(1500);

  // lazy: script not loaded until opened
  await p.evaluate(() => window._aladinOpen('Tau Ceti', 26.017, -15.94, 'P/DSS2/color'));
  await p.waitForTimeout(600);
  const s = await p.evaluate(() => ({
    ov: !!document.getElementById('aladin-ov'),
    div: !!document.getElementById('aladin-lite'),
    ready: document.getElementById('aladin-lite') && document.getElementById('aladin-lite').getAttribute('data-aladin-ready') === '1',
    statusHidden: document.getElementById('aladin-status') && document.getElementById('aladin-status').style.display === 'none',
    target: window.__aladinOpts ? window.__aladinOpts.target : null,
    survey: window.__aladinOpts ? window.__aladinOpts.survey : null
  }));
  ck('atlas overlay + aladin div open', s.ov && s.div);
  ck('aladin instance initialised on the div', s.ready);
  ck('loading status hidden once ready', s.statusHidden);
  ck('target coords passed to Aladin', s.target === '26.017 -15.94');
  ck('survey passed to Aladin', s.survey === 'P/DSS2/color');

  // ESC closes
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  ck('ESC closes atlas', await p.evaluate(() => !document.getElementById('aladin-ov')));

  ck('path1: no JS errors', errs.length === 0);
  if (errs.length) console.log('P1 ERRS', errs.slice(0, 4));
  await ctx.close();
}

/* ── path 2: WebGL2 missing (init rejects) → graceful fallback message ── */
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, geolocation: { latitude: 25, longitude: 121 }, permissions: ['geolocation'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await baseMocks(p);
  await p.route('**/vendor/aladin/aladin.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: stubThrow }));
  await p.goto('file://' + process.cwd() + '/deepsignal/gallery.html');
  await p.waitForTimeout(1200);
  await p.evaluate(() => window._aladinOpen('Tau Ceti', 26.017, -15.94, 'P/DSS2/color'));
  await p.waitForTimeout(600);
  const fallback = await p.evaluate(() => {
    const st = document.getElementById('aladin-status');
    return st ? { fail: st.classList.contains('al-fail'), text: st.textContent } : null;
  });
  ck('WebGL2-missing → graceful fallback message', !!fallback && fallback.fail && /UNAVAILABLE|WebGL2/i.test(fallback.text));
  ck('fallback keeps overlay open (not a crash)', await p.evaluate(() => !!document.getElementById('aladin-ov')));
  ck('path2: no JS errors (rejection handled)', errs.length === 0);
  if (errs.length) console.log('P2 ERRS', errs.slice(0, 4));
  await p.keyboard.press('Escape');
  await ctx.close();
}

/* ── path 3: library 404 → graceful fallback ── */
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await baseMocks(p);
  await p.route('**/vendor/aladin/aladin.js', r => r.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));
  await p.goto('file://' + process.cwd() + '/deepsignal/gallery.html');
  await p.waitForTimeout(1000);
  await p.evaluate(() => window._aladinOpen('Tau Ceti', 26.017, -15.94, null));
  await p.waitForTimeout(600);
  ck('missing library → fallback, no crash', await p.evaluate(() => { const st = document.getElementById('aladin-status'); return !!st && st.classList.contains('al-fail'); }) && errs.length === 0);
  await ctx.close();
}

let all = true;
for (const [l, ok] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + l); if (!ok) all = false; }
console.log(all ? 'ALL PASS' : 'FAILED');
await b.close();
process.exit(all ? 0 : 1);
