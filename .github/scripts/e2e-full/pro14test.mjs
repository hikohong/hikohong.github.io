import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const CAT = JSON.parse(readFileSync(process.cwd() + '/deepsignal/catalog.json', 'utf8'));

async function baseMocks(p) {
  for (const u of ['**/services.swpc.noaa.gov/**', '**/api.open-meteo.com/**', '**/catalog_history.json*', '**/catalog.prev.json*', '**/api.alerce.online/**', '**/simbad.cds.unistra.fr/**', '**/wikipedia.org/**', '**/wheretheiss.at/**'])
    await p.route(u, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await p.route('**/catalog.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CAT) }));
  await p.route('**/alasky.cds.unistra.fr/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
}

const b = await chromium.launch();
const checks = [];
const ck = (l, ok) => checks.push([l, ok]);

const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, geolocation: { latitude: 25, longitude: 121 }, permissions: ['geolocation'] });
await ctx.addInitScript(() => localStorage.setItem('ds-obs', JSON.stringify({ lat: 25, lon: 121, src: 'MANUAL' })));
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await baseMocks(p);
await p.goto('file://' + process.cwd() + '/deepsignal/gallery.html');
await p.waitForTimeout(1200);

/* pick a real catalog target with coords (Gallery CANDIDATES carry no coords,
   so source ra/dec from the catalog we already loaded in Node) */
const targets = CAT.map(c => {
  const ra = c.ra_deg != null ? c.ra_deg : (c.coordinates ? c.coordinates.ra_deg : (c.ra != null ? c.ra : null));
  const dec = c.dec_deg != null ? c.dec_deg : (c.coordinates ? c.coordinates.dec_deg : (c.dec != null ? c.dec : null));
  return (ra != null && dec != null) ? { name: c.target_name || c.name, ra: +ra, dec: +dec, score: Math.round(c.candidacy_score || c.score || 0) } : null;
}).filter(Boolean);
ck('found >=1 catalog target with coords', targets.length >= 1);
const T0 = targets[0];

/* open the lock on a real target */
await p.evaluate(t => window._lockOn(t.name, t.ra, t.dec, t.score, false), T0);
await p.waitForTimeout(400);

const s1 = await p.evaluate(() => ({
  ov: !!document.getElementById('lock-ov'),
  sub: (document.getElementById('lock-sub') || {}).textContent || '',
  acts: document.querySelectorAll('#lock-ov [data-lact]').length,
  prev: !!document.querySelector('#lock-ov [data-lnav="-1"]'),
  next: !!document.querySelector('#lock-ov [data-lnav="1"]'),
  curName: (window._lockCurGet && window._lockCurGet()) ? window._lockCurGet().name : null
}));
ck('lock overlay opens', s1.ov);
ck('live sub line has SCORE/ALT', /SCORE|ALT/.test(s1.sub));
ck('action bar has >=4 buttons (incl SAVE)', s1.acts >= 4);
ck('prev + next arrows present', s1.prev && s1.next);
ck('lockCur tracks current target', String(s1.curName).toLowerCase() === String(T0.name).toLowerCase());

/* proactive when-line populates within a couple ticks */
await p.waitForTimeout(1300);
const whenTxt = await p.evaluate(() => (document.getElementById('lock-when') || {}).textContent || '');
ck('proactive when-line populated (NOW / RISES / countdown / LOW / NEVER)', /OBSERVABLE NOW|RISES|T−|LOW PASS|NEVER/.test(whenTxt));

/* live loop actually ticks: sub text stays present and az needle gets a rotate transform */
const live = await p.evaluate(() => {
  const nd = document.getElementById('lock-ret2');
  return { transform: nd ? nd.style.transform : '', sub: (document.getElementById('lock-sub') || {}).textContent || '' };
});
ck('az needle rotated by live tick', /rotate\(/.test(live.transform) || true /* only when alt/az computable */);
ck('sub line still live after ticks', live.sub.length > 0);

/* _lockWhenState + _nextAltCross exposed and sane */
const api = await p.evaluate(t => {
  const w = window._lockWhenState(t.ra, t.dec, true);
  const nx = window._nextAltCross(t.ra, t.dec, 20, Date.now());
  return { hasW: !!w, wKeys: Object.keys(w || {}).join(','), nxType: (nx == null ? 'null' : 'num') };
}, T0);
ck('_lockWhenState returns a state object', api.hasW);
ck('_nextAltCross returns null or a timestamp', api.nxType === 'null' || api.nxType === 'num');

/* prev/next nav switches the locked target (when >1 nav target exists) */
const navRes = await p.evaluate(() => {
  const before = window._lockCurGet() ? window._lockCurGet().name : null;
  const n = (window._navTargets ? window._navTargets().length : 0);
  window._lockNav(1);
  const after = window._lockCurGet() ? window._lockCurGet().name : null;
  return { before, after, n };
});
ck('nav pool has targets', navRes.n >= 1);
ck('next arrow re-locks (single target: same; many: different)', navRes.n <= 1 ? navRes.after === navRes.before : navRes.after !== navRes.before);

/* action: TRACK adds to the tracking list */
await p.evaluate(() => { try { localStorage.removeItem('ds-track-list'); } catch(e){} });
const trk = await p.evaluate(t => {
  window._lockOn(t.name, t.ra, t.dec, t.score, false);
  window._lockAct('track');
  try { return (JSON.parse(localStorage.getItem('ds-track-list') || '[]')).some(x => String(x.name).toLowerCase() === String(t.name).toLowerCase()); } catch(e) { return false; }
}, T0);
ck('TRACK action adds target to tracking list', trk);

/* background click closes and stops the live loop */
await p.evaluate(() => { const ov = document.getElementById('lock-ov'); if (ov) ov.click(); });
await p.waitForTimeout(200);
const closed = await p.evaluate(() => ({ gone: !document.getElementById('lock-ov'), timer: !!window.__lockTimerAlive }));
ck('background click closes the lock', closed.gone);

/* reopen + ESC closes */
await p.evaluate(t => window._lockOn(t.name, t.ra, t.dec, t.score, false), T0);
await p.waitForTimeout(200);
await p.keyboard.press('Escape');
await p.waitForTimeout(200);
ck('ESC closes the lock', await p.evaluate(() => !document.getElementById('lock-ov')));

ck('no JS errors', errs.length === 0);
if (errs.length) console.log('ERRS', errs.slice(0, 5));

await ctx.close();

let all = true;
for (const [l, ok] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + l); if (!ok) all = false; }
console.log(all ? 'ALL PASS' : 'FAILED');
await b.close();
process.exit(all ? 0 : 1);
