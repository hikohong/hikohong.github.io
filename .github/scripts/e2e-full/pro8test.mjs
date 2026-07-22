import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const CAT = JSON.parse(readFileSync(process.cwd() + '/deepsignal/catalog.json', 'utf8'));
const T0 = CAT[0].target_name;

async function mocks(p) {
  for (const u of ['**/services.swpc.noaa.gov/**', '**/api.open-meteo.com/**', '**/catalog_history.json*', '**/catalog.prev.json*', '**/api.alerce.online/**', '**/simbad.cds.unistra.fr/**', '**/wikipedia.org/**', '**/wheretheiss.at/**'])
    await p.route(u, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await p.route('**/catalog.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CAT) }));
  await p.route('**/alasky.cds.unistra.fr/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
}

const b = await chromium.launch();
const checks = [];
const ck = (l, ok) => checks.push([l, ok]);

{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, geolocation: { latitude: 25, longitude: 121 }, permissions: ['geolocation', 'notifications'] });
  await ctx.addInitScript(() => {
    localStorage.setItem('ds-track-list', '[]');
    localStorage.setItem('ds-obs', JSON.stringify({ lat: 25, lon: 121, src: 'MANUAL' }));
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await mocks(p);
  await p.goto('file://' + process.cwd() + '/deepsignal/gallery.html');
  await p.waitForTimeout(1600);

  // 1 knowledge Q&A
  const k1 = await p.evaluate(() => window._ask('what is doppler drift', false));
  ck('knowledge: doppler drift', k1.ok && /frequency/i.test(k1.say) && /technosignature|drift/i.test(k1.say));
  const k2 = await p.evaluate(() => window._ask('what does tier 2 mean', false));
  ck('knowledge: tier explanation', k2.ok && /Tier 1/.test(k2.say));
  const k3 = await p.evaluate(() => window._ask('define SNR', false));
  ck('knowledge: SNR', k3.ok && /signal.to.noise|noise/i.test(k3.say));
  const k4 = await p.evaluate(() => window._ask('what is the bortle scale', false));
  ck('knowledge: bortle', k4.ok && /darkness|class/i.test(k4.say));

  // 2 fuzzy entity resolution (typo)
  await p.evaluate(() => window._ask('where is Vega', false));
  const fz = await p.evaluate(() => { const t = window._resolveTarget('track Prox9ma Centaur'); return t ? t.name : null; });
  ck('fuzzy: typo resolves (Prox9ma Centaur → catalog)', fz && /Proxima|Centaur/i.test(fz));
  const fz2 = await p.evaluate(() => { const t = window._resolveTarget('Tau Ceti'); return t ? t.name : null; });
  ck('fuzzy does not break exact matches', fz2 === 'Tau Ceti');

  // 3 action chains: track best 3
  const chain = await p.evaluate(() => window._ask('track the best 3 tonight', false));
  const trk = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('ds-track-list') || '[]').length; } catch (e) { return 0; } });
  ck('action chain: track best 3 → 3 tracked', chain.ok && /Added 3/.test(chain.say) && trk === 3);
  const clr = await p.evaluate(() => window._ask('clear my tracking list', false));
  const trk0 = await p.evaluate(() => JSON.parse(localStorage.getItem('ds-track-list') || '[]').length);
  ck('action chain: clear list → empty', clr.ok && /Cleared/.test(clr.say) && trk0 === 0);

  // 4 conditional alerts: set + persist
  const al = await p.evaluate(() => window._ask('notify me when Vega reaches 40 degrees', false));
  const alset = await p.evaluate(() => { try { const a = JSON.parse(localStorage.getItem('ds-alerts') || '[]'); return a.length && a[0].kind === 'alt' && a[0].thr === 40 && /Vega/i.test(a[0].name); } catch (e) { return false; } });
  ck('alert: alt threshold set + persisted', al.ok && /Alert set/.test(al.say) && alset);
  const al2 = await p.evaluate(() => window._ask('tell me when Jupiter rises', false));
  ck('alert: rise condition', al2.ok && /Alert set/.test(al2.say) && /rise/i.test(al2.say));
  const al3 = await p.evaluate(() => window._ask('alert me when it is dark', false));
  ck('alert: darkness condition', al3.ok && /Alert set/.test(al3.say) && /dark/i.test(al3.say));

  // 5 ALERTS view lists + clears
  await p.evaluate(() => window._alertsView());
  await p.waitForTimeout(200);
  const av = await p.evaluate(() => ({ ov: !!document.getElementById('alerts-ov'), rows: document.querySelectorAll('#alerts-ov [data-ai]').length }));
  ck('ALERTS view lists active watchers', av.ov && av.rows === 3);
  await p.evaluate(() => { const b = document.querySelector('#alerts-ov [data-ai]'); if (b) b.click(); });
  await p.waitForTimeout(150);
  const av2 = await p.evaluate(() => document.querySelectorAll('#alerts-ov [data-ai]').length);
  ck('ALERTS view CLEAR removes one', av2 === 2);
  await p.keyboard.press('Escape');

  // 6 alert fires + self-removes when condition met (thr=-90 always true)
  await p.evaluate(() => localStorage.setItem('ds-alerts', JSON.stringify([{ id: 'x', kind: 'alt', thr: -90, name: 'Zenith', ra: 0, dec: 25 }])));
  await p.evaluate(() => window._alertCheck());
  await p.waitForTimeout(100);
  const remaining = await p.evaluate(() => JSON.parse(localStorage.getItem('ds-alerts') || '[]').length);
  ck('alert fires + self-removes when met', remaining === 0);

  ck('gallery: no JS errors', errs.length === 0);
  if (errs.length) console.log('ERRS', errs.slice(0, 5));
  await ctx.close();
}

let all = true;
for (const [l, ok] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + l); if (!ok) all = false; }
console.log(all ? 'ALL PASS' : 'FAILED');
await b.close();
process.exit(all ? 0 : 1);
