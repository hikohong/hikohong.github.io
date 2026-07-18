import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const CAT = JSON.parse(readFileSync(process.cwd() + '/deepsignal/catalog.json', 'utf8'));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

function hist3() {
  const runs = [{ date: 'r1', scores: {} }, { date: 'r2', scores: {} }, { date: 'r3', scores: {} }];
  for (const c of CAT) {
    const n = c.target_name, s = +c.candidacy_score || 50;
    if (!n) continue;
    runs[0].scores[n] = s - 5; runs[1].scores[n] = s + 3; runs[2].scores[n] = s;
  }
  return runs;
}
function meteo() {
  const t0 = new Date(Math.floor(Date.now() / 3600e3) * 3600e3 - 2 * 3600e3);
  const time = [], cloud = [], rh = [], wind = [];
  for (let i = 0; i < 72; i++) {
    time.push(new Date(t0.getTime() + i * 3600e3).toISOString().slice(0, 16));
    cloud.push((i * 7) % 100); rh.push(40 + (i * 3) % 55); wind.push((i * 2) % 50);
  }
  return { hourly: { time, cloud_cover: cloud, relative_humidity_2m: rh, wind_speed_10m: wind } };
}
async function mocks(p) {
  await p.route('**/services.swpc.noaa.gov/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([["time_tag", "Kp"], ["2026-07-18 09:00:00", "6.33"]]) }));
  await p.route('**/api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(meteo()) }));
  await p.route('**/catalog_history.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hist3()) }));
  await p.route('**/catalog.prev.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CAT) }));
  await p.route('**/catalog.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CAT) }));
  await p.route('**/api.alerce.online/**', r => {
    const u = r.request().url();
    if (u.includes('/lightcurve')) {
      const dets = [];
      for (let i = 0; i < 30; i++) dets.push({ mjd: 58000 + i * 30, magpsf: 15 + Math.sin(i / 3), fid: 1 + (i % 2), sigmapsf: 0.05 });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ detections: dets }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ oid: 'ZTF18abcdefg', ndet: 42, meanra: 26, meandec: -15.9, lastmjd: 60860 }] }) });
  });
  await p.route('**/simbad.cds.unistra.fr/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [["PM*", "G8V", 273.96, 3.49]] }) }));
  await p.route('**/wikipedia.org/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await p.route('**/wheretheiss.at/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ latitude: 0, longitude: 0 }) }));
  await p.route('**/alasky.cds.unistra.fr/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
}

const b = await chromium.launch();
const checks = [];
function ck(l, ok) { checks.push([l, ok]); }

/* ═══ Gallery page ═══ */
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, geolocation: { latitude: 25, longitude: 121 }, permissions: ['geolocation'] });
  await ctx.addInitScript(() => {
    localStorage.setItem('ds-track-list', JSON.stringify([{ name: 'Tau Ceti', ra: 26.017, dec: -15.94, t: 1 }, { name: 'Proxima Centauri', ra: 217.42, dec: -62.68, t: 2 }]));
    localStorage.setItem('ds-nvg', '1');
    localStorage.setItem('ds-obs', JSON.stringify({ lat: 25, lon: 121, src: 'MANUAL' }));
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.accept('4').catch(() => {}));
  await mocks(p);
  await p.goto('file://' + process.cwd() + '/deepsignal/gallery.html');
  await p.waitForTimeout(1800);

  // 1 RED mode + NVG exclusivity (ds-nvg was 1)
  await p.click('#hud-red-btn');
  await p.waitForTimeout(200);
  const red = await p.evaluate(() => ({ red: document.documentElement.classList.contains('red'), nvg: document.documentElement.classList.contains('nvg'), k: localStorage.getItem('ds-red'), kn: localStorage.getItem('ds-nvg') }));
  ck('RED mode on + persisted', red.red && red.k === '1');
  ck('RED clears NVG (exclusive)', !red.nvg && red.kn === '0');
  await p.click('#hud-red-btn');
  ck('RED toggles off', await p.evaluate(() => !document.documentElement.classList.contains('red')));

  // 2 geomag CAS from mocked Kp 6.33
  const kp = await p.evaluate(() => window._kpVal);
  ck('SWPC Kp parsed (6.33)', Math.abs(kp - 6.33) < 0.01);
  ck('GEOMAG STORM CAS light raised', await p.evaluate(() => !!document.getElementById('cas-GEOMAG')));

  // 3 SYS page: KP row + new probes
  await p.evaluate(() => window._sdToggle());
  await p.waitForTimeout(700);
  const sd = await p.$eval('#sd-body', e => e.textContent);
  ck('SYS shows KP INDEX with storm flag', /KP INDEX/.test(sd) && /6\.3/.test(sd) && /STORM/.test(sd));
  ck('SYS probes NOAA SWPC + ALERCE', /NOAA SWPC/.test(sd) && /ALERCE ZTF/.test(sd));
  await p.evaluate(() => window._sdToggle());

  // 4 sparklines from mocked 3-run history
  const sparks = await p.evaluate(() => document.querySelectorAll('.card .spark').length);
  ck('sparklines on gallery cards (' + sparks + ')', sparks > 50);

  // 5 meteor showers: mid-July → S. Delta Aquariids + Perseids active
  const act = await p.evaluate(() => window._activeShowers(new Date(2026, 6, 18)).map(s => s.n));
  ck('active showers mid-July', act.includes('Perseids') && act.includes('S. Delta Aquariids'));
  ck('Geminids peak detected Dec 14', await p.evaluate(() => window._activeShowers(new Date(2026, 11, 14)).some(s => s.n === 'Geminids')));

  // 6 SKY almanac
  await p.evaluate(() => window._skyToggle());
  await p.waitForTimeout(1200);
  const sky = await p.$eval('#sky-body', e => e.textContent).catch(() => '');
  ck('almanac lists meteor showers', /METEOR SHOWERS/.test(sky) && /Perseids/.test(sky));
  ck('almanac computes planetary/moon events', /PLANETARY EVENTS/.test(sky) && (/Moon/.test(sky) || /conjunction/.test(sky) || /elongation/.test(sky) || /opposition/.test(sky)));
  await p.keyboard.press('Escape');

  // 7 astro weather strip (position pre-seeded via ds-obs)
  await p.evaluate(() => window._wxToggle());
  await p.waitForTimeout(900);
  const wx = await p.evaluate(() => ({ cols: document.querySelectorAll('#wx-body .wx-col').length, dark: document.querySelectorAll('#wx-body .wx-col.wx-dk2, #wx-body .wx-col.wx-dk1').length, leg: (document.getElementById('wx-body') || {}).textContent || '' }));
  ck('weather strip 48 columns', wx.cols === 48);
  ck('darkness columns shaded', wx.dark > 4);
  ck('weather legend rows', /CLOUD · HUMIDITY · WIND/.test(wx.leg));
  await p.keyboard.press('Escape');

  // 8 Bortle folded into OBS score
  await p.evaluate(() => { localStorage.removeItem('ds-bortle'); });
  const s1 = await p.evaluate(() => { window._obsCacheClear; return window._obsWindow(26.017, -15.94).score; });
  await p.evaluate(() => window._bortleSet(9));
  const s9 = await p.evaluate(() => window._obsWindow(26.017, -15.94).score);
  ck('Bortle 9 lowers/equals OBS score (' + s1 + '→' + s9 + ')', s9 != null && s1 != null && s9 <= s1);
  ck('Bortle persisted', await p.evaluate(() => localStorage.getItem('ds-bortle')) === '9');

  // 9 export observing list (GoTo CSV download)
  await p.evaluate(() => window._trkExport());
  await p.waitForTimeout(300);
  ck('export dialog opens', await p.evaluate(() => !!document.getElementById('exp-ov')));
  const dl = p.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await p.click('#exp-goto');
  const got = await dl;
  ck('GoTo CSV downloads', !!got && got.suggestedFilename() === 'deepsignal-goto-list.csv');
  await p.keyboard.press('Escape');

  // 10 CDU: Tab autocomplete + history recall
  await p.keyboard.press('/');
  await p.waitForTimeout(300);
  await p.keyboard.type('KI');
  await p.keyboard.press('Tab');
  ck('CDU Tab completes KIOSK', await p.$eval('#cdu-in', e => e.value) === 'KIOSK ');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(700);
  const kk = await p.evaluate(() => ({ ov: !!document.getElementById('kiosk-ov'), nm: (document.getElementById('kk-name') || {}).textContent || '' }));
  ck('kiosk opens with a candidate', kk.ov && kk.nm.length > 1);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  ck('ESC exits kiosk', await p.evaluate(() => !document.getElementById('kiosk-ov')));
  await p.keyboard.press('/');
  await p.waitForTimeout(300);
  await p.keyboard.press('ArrowUp');
  ck('CDU ArrowUp recalls history', await p.$eval('#cdu-in', e => e.value) === 'KIOSK');
  await p.keyboard.press('Escape');

  ck('gallery: no JS errors', errs.length === 0);
  if (errs.length) console.log('GALLERY ERRS', errs.slice(0, 4));
  await ctx.close();
}

/* ═══ Search page ═══ */
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, geolocation: { latitude: 25, longitude: 121 }, permissions: ['geolocation'] });
  await ctx.addInitScript(() => {
    localStorage.setItem('ds-bortle', '4');
    localStorage.setItem('ds-fov', JSON.stringify({ w: 0.0833, h: null }));
    localStorage.setItem('ds-obs', JSON.stringify({ lat: 25, lon: 121, src: 'MANUAL' }));
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await mocks(p);
  await p.goto('file://' + process.cwd() + '/deepsignal/index.html');
  await p.waitForTimeout(1500);

  await p.waitForFunction(() => { try { return typeof catalog !== 'undefined' && catalog.length > 0; } catch (e) { return false; } }, { timeout: 20000 });
  const target = CAT[0].target_name;
  await p.fill('#q', target);
  await p.evaluate(() => doSearch());
  await p.waitForTimeout(2000);
  ck('search renders result card', await p.evaluate(() => !!document.querySelector('#result-card .result-name')));

  // 11 SIMBAD V-mag + Bortle visibility note
  const enr = await p.evaluate(() => (document.getElementById('simbad-enrich') || {}).textContent || '');
  ck('SIMBAD enrich has V mag + visibility note', /V 3\.5/.test(enr) && /naked-eye at your site/.test(enr));

  // 12 FOV overlay on the result cutout
  const fov = await p.evaluate(() => { const b2 = document.getElementById('fov-box'); return b2 ? parseFloat(b2.style.width) : null; });
  ck('FOV box drawn ~73px (5′ in 15′ frame) got=' + fov, fov != null && fov > 55 && fov < 95);
  ck('FOV tag labels arcmin', /FOV 5/.test(await p.evaluate(() => (document.getElementById('fov-tag') || {}).textContent || '')));

  // 13 sparkline on result card
  ck('sparkline on result card', await p.evaluate(() => !!document.querySelector('#result-card .spark')));

  // 14 ZTF light curve modal
  await p.click('#result-card .btn-lc');
  await p.waitForTimeout(1200);
  const lc = await p.evaluate(() => ({ ov: !!document.getElementById('lc-ov'), cv: !!document.getElementById('lc-cv'), txt: (document.getElementById('lc-body') || {}).textContent || '' }));
  ck('light curve canvas rendered', lc.ov && lc.cv && /ZTF18abcdefg/.test(lc.txt) && /42 DETECTIONS/.test(lc.txt));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  ck('ESC closes LC modal', await p.evaluate(() => !document.getElementById('lc-ov')));

  // 15 CDU FOV with numeric arg
  await p.keyboard.press('/');
  await p.waitForTimeout(300);
  await p.keyboard.type('FOV 40');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  const f2 = await p.evaluate(() => JSON.parse(localStorage.getItem('ds-fov')));
  ck('CDU FOV 40 stores 40 arcmin', f2 && Math.abs(f2.w - 40 / 60) < 1e-6);

  ck('search: no JS errors', errs.length === 0);
  if (errs.length) console.log('SEARCH ERRS', errs.slice(0, 4));
  await ctx.close();
}

let all = true;
for (const [l, ok] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + l); if (!ok) all = false; }
console.log(all ? 'ALL PASS' : 'FAILED');
await b.close();
process.exit(all ? 0 : 1);
