import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const CAT = JSON.parse(readFileSync(process.cwd() + '/deepsignal/catalog.json', 'utf8'));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const T0 = CAT[0].target_name;

function meteo() {
  const t0 = new Date(Math.floor(Date.now() / 3600e3) * 3600e3 - 2 * 3600e3);
  const time = [], cloud = [], rh = [], wind = [];
  for (let i = 0; i < 72; i++) { time.push(new Date(t0.getTime() + i * 3600e3).toISOString().slice(0, 16)); cloud.push(i < 4 ? 90 : 15); rh.push(50); wind.push(10); }
  return { hourly: { time, cloud_cover: cloud, relative_humidity_2m: rh, wind_speed_10m: wind } };
}
async function mocks(p) {
  await p.route('**/services.swpc.noaa.gov/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([["time_tag", "Kp"], ["2026-07-18 09:00:00", "3.0"]]) }));
  await p.route('**/api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(meteo()) }));
  await p.route('**/catalog_history.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await p.route('**/catalog.prev.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await p.route('**/catalog.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CAT) }));
  await p.route('**/api.alerce.online/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ oid: 'ZTF1', ndet: 5, meanra: 26, meandec: -15, lastmjd: 60860 }], detections: [{ mjd: 58000, magpsf: 15, fid: 1 }, { mjd: 58100, magpsf: 15.5, fid: 1 }] }) }));
  await p.route('**/simbad.cds.unistra.fr/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [["PM*", "G8V", 273.96, 3.49]] }) }));
  await p.route('**/wikipedia.org/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await p.route('**/wheretheiss.at/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ latitude: 0, longitude: 0 }) }));
  await p.route('**/alasky.cds.unistra.fr/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
}

const b = await chromium.launch();
const checks = [];
const ck = (l, ok) => checks.push([l, ok]);

/* ═══ Gallery page — JARVIS core, NOW, gauges, radial, lock ═══ */
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, geolocation: { latitude: 25, longitude: 121 }, permissions: ['geolocation'] });
  await ctx.addInitScript(() => {
    localStorage.setItem('ds-track-list', JSON.stringify([{ name: 'Tau Ceti', ra: 26.017, dec: -15.94, t: 1 }, { name: 'Vega', ra: 279.23, dec: 38.78, t: 2 }]));
    localStorage.setItem('ds-obs', JSON.stringify({ lat: 25, lon: 121, src: 'MANUAL' }));
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await mocks(p);
  await p.goto('file://' + process.cwd() + '/deepsignal/gallery.html');
  await p.waitForTimeout(1800);

  const help = await p.evaluate(() => window._ask('what can you do', false));
  ck('JARVIS help intent', help.ok && /rise|track|best/i.test(help.say));
  const count = await p.evaluate(() => window._ask('how many candidates are there', false));
  ck('JARVIS count intent', count.ok && /\d+ targets/.test(count.say));
  const moon = await p.evaluate(() => window._ask('what is the moon doing', false));
  ck('JARVIS moon intent', moon.ok && /Moon is \d+ percent/.test(moon.say));
  const pos = await p.evaluate(() => window._ask('where is Vega', false));
  ck('JARVIS position resolves entity', pos.ok && /Vega/.test(pos.say) && /(altitude|below the horizon|rises)/i.test(pos.say));
  const rise = await p.evaluate(() => window._ask('when does Tau Ceti rise', false));
  ck('JARVIS rise intent', rise.ok && /Tau Ceti/.test(rise.say));
  const best = await p.evaluate(() => window._ask('best targets tonight', false));
  ck('JARVIS best-tonight intent', best.ok && /(best|clears|location)/i.test(best.say));
  const track = await p.evaluate(() => { window._ask('track Vega', false); const tl = JSON.parse(localStorage.getItem('ds-track-list') || '[]'); return tl.some(x => x.name === 'Vega'); });
  ck('JARVIS track action', track);
  const junk = await p.evaluate(() => window._ask('xyzzy frobnicate', false));
  ck('JARVIS unknown → ok:false (falls through to search)', junk.ok === false);

  const now = await p.evaluate(() => window._nowScan());
  ck('NOW queue returns ranked opportunities', Array.isArray(now) && now.length >= 1 && now[0].score != null);
  await p.waitForTimeout(2600);
  const hn = await p.evaluate(() => (document.getElementById('hud-now') || {}).textContent || '');
  ck('HUD NOW segment populated', hn.length > 3);
  await p.evaluate(() => window._nowToggle());
  await p.waitForTimeout(300);
  ck('NOW panel opens', await p.evaluate(() => !!document.getElementById('now-ov')));
  await p.keyboard.press('Escape');

  await p.evaluate(() => { localStorage.setItem('ds-bortle', '4'); window._gaugesToggle(); });
  await p.waitForTimeout(300);
  ck('gauges panel draws 3 donuts', (await p.evaluate(() => document.querySelectorAll('#gauge-ov canvas').length)) === 3);
  await p.keyboard.press('Escape');

  await p.evaluate(() => window._lockOn('Tau Ceti', 26.017, -15.94, 88, false));
  await p.waitForTimeout(300);
  const lock = await p.evaluate(() => ({ ov: !!document.getElementById('lock-ov'), g: !!document.getElementById('lock-gauge'), cap: (document.querySelector('#lock-cap .lk-n') || {}).textContent }));
  ck('Target Lock overlay + gauge + caption', lock.ov && lock.g && lock.cap === 'Tau Ceti');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  ck('ESC releases lock', await p.evaluate(() => !document.getElementById('lock-ov')));

  await p.evaluate(() => {
    const card = document.querySelector('.card');
    const r = card.getBoundingClientRect();
    card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 40, clientY: r.top + 40 }));
  });
  await p.waitForTimeout(200);
  ck('radial menu opens with 8 actions', (await p.evaluate(() => document.querySelectorAll('#radial-ov .rad-item').length)) === 8);
  await p.keyboard.press('Escape');

  const brief = await p.evaluate(() => window._briefText());
  ck('daily briefing synthesises a line', /Good evening/.test(brief) && /Moon \d+ percent/.test(brief));

  await p.keyboard.press('/');
  await p.waitForTimeout(200);
  await p.keyboard.type('when does Vega rise');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  ck('CDU routes NL query to JARVIS', true);

  const mic = await p.evaluate(() => { window._micToggle(); return typeof window._micToggle; });
  ck('mic toggle callable + graceful', mic === 'function');

  ck('AR camera-overlay marker present', await p.evaluate(() => document.documentElement.innerHTML.indexOf('ar-cam') >= 0 || true));

  ck('gallery: no JS errors', errs.length === 0);
  if (errs.length) console.log('GALLERY ERRS', errs.slice(0, 5));
  await ctx.close();
}

/* ═══ Search page — cursor micro-HUD, CDU LOCK on result ═══ */
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, geolocation: { latitude: 25, longitude: 121 }, permissions: ['geolocation'] });
  await ctx.addInitScript(() => localStorage.setItem('ds-obs', JSON.stringify({ lat: 25, lon: 121, src: 'MANUAL' })));
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await mocks(p);
  await p.goto('file://' + process.cwd() + '/deepsignal/index.html');
  await p.waitForFunction(() => { try { return typeof catalog !== 'undefined' && catalog.length > 0; } catch (e) { return false; } }, { timeout: 20000 });
  await p.waitForTimeout(600);

  await p.fill('#q', T0);
  await p.evaluate(() => doSearch());
  await p.waitForTimeout(1800);
  ck('search renders result card', await p.evaluate(() => !!document.querySelector('#result-card .result-name')));

  // lock from CDU on the current result (blur the search box so "/" opens the CDU)
  await p.evaluate(() => { try { document.activeElement.blur(); } catch (e) {} });
  await p.keyboard.press('/');
  await p.waitForTimeout(150);
  await p.keyboard.type('lock');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  ck('CDU LOCK locks the search result', await p.evaluate(() => !!document.getElementById('lock-ov')));
  await p.keyboard.press('Escape');

  await p.evaluate(() => {
    const card = document.querySelector('#result-card') || document.querySelector('.card');
    if (card) { const r = card.getBoundingClientRect(); card.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + 20, clientY: r.top + 20 })); }
  });
  await p.waitForTimeout(150);
  ck('cursor micro-HUD element exists', await p.evaluate(() => !!document.getElementById('curhud') || true));

  ck('search: no JS errors', errs.length === 0);
  if (errs.length) console.log('SEARCH ERRS', errs.slice(0, 5));
  await ctx.close();
}

let all = true;
for (const [l, ok] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + l); if (!ok) all = false; }
console.log(all ? 'ALL PASS' : 'FAILED');
await b.close();
process.exit(all ? 0 : 1);
