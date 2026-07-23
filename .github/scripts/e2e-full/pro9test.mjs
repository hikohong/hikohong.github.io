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
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, geolocation: { latitude: 25, longitude: 121 }, permissions: ['geolocation'] });
  await ctx.addInitScript(() => localStorage.setItem('ds-obs', JSON.stringify({ lat: 25, lon: 121, src: 'MANUAL' })));
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await mocks(p);
  await p.goto('file://' + process.cwd() + '/deepsignal/gallery.html');
  await p.waitForTimeout(1800);

  // 1 anomaly scan computes a ranked, bounded result for every candidate
  const scan = await p.evaluate(() => {
    const a = window._anomScan();
    return { n: a.length, hasPct: a.every(x => x.anomPct >= 0 && x.anomPct <= 1), sortedDesc: a.every((x, i) => i === 0 || a[i - 1].anomPct >= x.anomPct), topPct: a[0] ? a[0].anomPct : 0, darks: a.filter(x => x.dark).length };
  });
  ck('anomaly scan scores all candidates', scan.n === (await p.evaluate(() => (typeof CANDIDATES !== 'undefined' ? CANDIDATES.length : 0))));
  ck('anomaly percentile bounded 0..1', scan.hasPct);
  ck('anomaly result sorted by percentile desc', scan.sortedDesc && scan.topPct >= 0.9);

  // 2 anomaly is INDEPENDENT of pipeline score (dark horses = high anom, low score) exist or at least computed
  const dh = await p.evaluate(() => {
    const a = window._anomScan();
    // a dark horse must have high anomaly percentile AND low score percentile
    return a.filter(x => x.dark).every(x => x.anomPct >= 0.75 && x.scorePct <= 0.5);
  });
  ck('dark-horse rule holds (anom high + score low)', dh);

  // 3 anomaly scan panel opens with rows
  await p.evaluate(() => window._anomalyOpen());
  await p.waitForTimeout(300);
  const panel = await p.evaluate(() => ({ ov: !!document.getElementById('anom-ov'), rows: document.querySelectorAll('#anom-ov [data-an-name]').length, hasBar: !!document.querySelector('#anom-ov .an-bar') }));
  ck('anomaly panel opens with ranked rows + bars', panel.ov && panel.rows >= 5 && panel.hasBar);

  // 4 clicking a row locks the target
  await p.evaluate(() => { const r = document.querySelector('#anom-ov [data-an-name]'); if (r) r.click(); });
  await p.waitForTimeout(200);
  ck('anomaly row → Target Lock', await p.evaluate(() => !!document.getElementById('lock-ov')));
  await p.keyboard.press('Escape');
  await p.keyboard.press('Escape');

  // 5 JARVIS "dark horses" intent opens the scan + speaks a summary
  const ask = await p.evaluate(() => window._ask('show me the dark horses', false));
  ck('JARVIS dark-horse intent', ask.ok && /(dark horse|anomal|most anomalous)/i.test(ask.say));
  ck('JARVIS dark-horse opened panel', await p.evaluate(() => !!document.getElementById('anom-ov')));
  await p.keyboard.press('Escape');

  // 6 JARVIS "why is X anomalous"
  const why = await p.evaluate((n) => window._ask('why is ' + n + ' anomalous', false), T0);
  ck('JARVIS why-anomalous explains percentile', why.ok && /percent/i.test(why.say) && /pipeline scored/i.test(why.say));

  // 7 anomaly badges on high-outlier cards
  await p.waitForTimeout(700);
  const badges = await p.evaluate(() => document.querySelectorAll('.card .anom-chip').length);
  ck('anomaly badges on top-outlier cards (' + badges + ')', badges >= 1);

  // 8 CDU ANOMALY verb
  await p.evaluate(() => { try { document.activeElement.blur(); } catch (e) {} });
  await p.keyboard.press('/');
  await p.waitForTimeout(150);
  await p.keyboard.type('anomaly');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  ck('CDU ANOMALY opens scan', await p.evaluate(() => !!document.getElementById('anom-ov')));
  await p.keyboard.press('Escape');

  ck('gallery: no JS errors', errs.length === 0);
  if (errs.length) console.log('ERRS', errs.slice(0, 5));
  await ctx.close();
}

let all = true;
for (const [l, ok] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + l); if (!ok) all = false; }
console.log(all ? 'ALL PASS' : 'FAILED');
await b.close();
process.exit(all ? 0 : 1);
