import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const CAT = JSON.parse(readFileSync(process.cwd() + '/deepsignal/catalog.json', 'utf8'));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const T0 = CAT[0].target_name, T1 = (CAT[1] || CAT[0]).target_name;

async function mocks(p) {
  await p.route('**/services.swpc.noaa.gov/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[["t","Kp"],["x","3.0"]]' }));
  await p.route('**/api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await p.route('**/catalog_history.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await p.route('**/catalog.prev.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await p.route('**/catalog.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CAT) }));
  await p.route('**/api.alerce.online/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[]}' }));
  await p.route('**/simbad.cds.unistra.fr/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }));
  await p.route('**/wikipedia.org/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await p.route('**/wheretheiss.at/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"latitude":0,"longitude":0}' }));
  await p.route('**/alasky.cds.unistra.fr/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
}

const b = await chromium.launch();
const checks = [];
const ck = (l, ok) => checks.push([l, ok]);

{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, geolocation: { latitude: 25, longitude: 121 }, permissions: ['geolocation'] });
  await ctx.addInitScript((names) => {
    localStorage.setItem('ds-track-list', JSON.stringify([
      { name: 'Vega', ra: 279.23, dec: 38.78, t: 1 }, { name: 'Sirius', ra: 101.29, dec: -16.72, t: 2 }, { name: 'Tau Ceti', ra: 26.017, dec: -15.94, t: 3 }]));
    localStorage.setItem('ds-obs', JSON.stringify({ lat: 25, lon: 121, src: 'MANUAL' }));
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await mocks(p);
  await p.goto('file://' + process.cwd() + '/deepsignal/gallery.html');
  await p.waitForTimeout(1800);

  // 1 multi-turn context: "where is Vega" then "when does it rise" resolves "it"→Vega
  await p.evaluate(() => window._ask('where is Vega', false));
  const follow = await p.evaluate(() => window._ask('when does it rise', false));
  ck('context: pronoun "it" resolves to prior entity (Vega)', follow.ok && /Vega/.test(follow.say));

  // 2 planning intent → opens PLAN + spoken summary
  const plan = await p.evaluate(() => window._ask('plan my night', false));
  ck('planning intent → ordered summary', plan.ok && /(Tonight|targets|Order|observable)/i.test(plan.say));
  ck('planning opened mission plan overlay', await p.evaluate(() => !!document.getElementById('plan-ov')));
  await p.keyboard.press('Escape');

  // 3 comparison intent with two entities
  const cmp = await p.evaluate(() => window._ask('Vega or Sirius tonight, which is better', false));
  ck('comparison intent (two entities + verdict)', cmp.ok && /Vega/.test(cmp.say) && /Sirius/.test(cmp.say) && /(better|even)/i.test(cmp.say));

  // 4 explain intent reads catalog reasons
  const ex = await p.evaluate((n) => window._ask('why is ' + n + ' scored high', false), T0);
  ck('explain intent (tier + score from catalog)', ex.ok && /scoring \d/.test(ex.say) && /(Flagged for|detected by)/.test(ex.say));

  // 5 similar-candidate search
  await p.evaluate((n) => window._similarOpen(n), T0);
  await p.waitForTimeout(300);
  const sim = await p.evaluate(() => ({ ov: !!document.getElementById('sim-ov'), rows: document.querySelectorAll('#sim-ov [data-simname]').length }));
  ck('similar search opens with ranked rows', sim.ov && sim.rows >= 3);
  // clicking a similar row locks it
  await p.evaluate(() => { const r = document.querySelector('#sim-ov [data-simname]'); if (r) r.click(); });
  await p.waitForTimeout(200);
  ck('similar row → Target Lock', await p.evaluate(() => !!document.getElementById('lock-ov')));

  // 6 shareable lock card export (download)
  const dl = p.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await p.evaluate(() => window._lockCardExport());
  const got = await dl;
  ck('lock card exports a PNG', !!got && /deepsignal-lock-.*\.png/.test(got.suggestedFilename()));
  await p.keyboard.press('Escape');

  // 7 command palette (Ctrl+K) fuzzy + run
  await p.keyboard.press('Control+k');
  await p.waitForTimeout(200);
  ck('palette opens on Ctrl+K', await p.evaluate(() => !!document.getElementById('palette-ov')));
  const plrows = await p.evaluate(() => { document.getElementById('palette-in').value = 'sess'; document.getElementById('palette-in').dispatchEvent(new Event('input')); return document.querySelectorAll('#palette-list .pl-row').length; });
  ck('palette fuzzy filters', plrows >= 1);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  ck('palette Enter runs command (session mode opened)', await p.evaluate(() => !!document.getElementById('session-ov')));

  // 8 Session Mode structure + countdown
  const ss = await p.evaluate(() => ({ prog: (document.getElementById('ss-prog') || {}).textContent || '', cd: (document.getElementById('ss-cd') || {}).textContent || '', nm: (document.getElementById('ss-nm') || {}).textContent || '' }));
  ck('session mode shows target + countdown', /TARGET 1 \/ \d/.test(ss.prog) && ss.nm.length > 1 && /(T−|IN WINDOW|WINDOW|—)/.test(ss.cd));
  await p.evaluate(() => document.getElementById('ss-next').click());
  const ss2 = await p.evaluate(() => (document.getElementById('ss-prog') || {}).textContent || '');
  ck('session NEXT advances', /TARGET 2 \//.test(ss2));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  ck('ESC exits session mode', await p.evaluate(() => !document.getElementById('session-ov')));

  // 9 a11y: hud-msg is a live region
  ck('HUD message is an aria-live region', await p.evaluate(() => { const e = document.getElementById('hud-msg'); return e && e.getAttribute('aria-live') === 'polite'; }));

  ck('gallery: no JS errors', errs.length === 0);
  if (errs.length) console.log('ERRS', errs.slice(0, 5));
  await ctx.close();
}

let all = true;
for (const [l, ok] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + l); if (!ok) all = false; }
console.log(all ? 'ALL PASS' : 'FAILED');
await b.close();
process.exit(all ? 0 : 1);
