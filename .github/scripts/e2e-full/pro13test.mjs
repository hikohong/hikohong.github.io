import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const CAT = JSON.parse(readFileSync(process.cwd() + '/deepsignal/catalog.json', 'utf8'));
const N0 = CAT[0].target_name, N1 = (CAT[1] || CAT[0]).target_name, N2 = (CAT[2] || CAT[0]).target_name;

// a teammate's shared consensus payload
const peerPayload = { o: 'obs-alice', d: { [N0]: 'flag', [N1]: 'rev', [N2]: 'flag' } };
const teamHash = '#team=' + Buffer.from(JSON.stringify(peerPayload), 'binary').toString('base64');

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
  // open WITH a teammate's team-consensus link in the hash → should merge on load
  await p.goto('file://' + process.cwd() + '/deepsignal/gallery.html' + teamHash);
  await p.waitForTimeout(1600);

  // 1 inbound link merged into peers
  const peers = await p.evaluate(() => JSON.parse(localStorage.getItem('ds-peers') || '[]'));
  ck('team link merged a peer', peers.length === 1 && peers[0].id === 'obs-alice' && Object.keys(peers[0].d).length === 3);

  // 2 consensus aggregation
  const cons = await p.evaluate((n) => window._teamConsensus(n), N0);
  ck('consensus counts a peer flag', cons.flag === 1 && cons.total === 1);

  // 3 hash cleared after merge (no leftover #team=)
  ck('hash cleared after merge', !(await p.evaluate(() => location.hash)).includes('team='));

  // 4 consensus badges on cards
  await p.waitForTimeout(400);
  const badges = await p.evaluate(() => document.querySelectorAll('.card .team-chip').length);
  ck('team consensus badges rendered (' + badges + ')', badges >= 1);

  // 5 a second teammate merges + aggregates
  await p.evaluate((n) => {
    const p2 = { o: 'obs-bob', d: { [n]: 'flag' } };
    location.hash = '#team=' + btoa(unescape(encodeURIComponent(JSON.stringify(p2))));
    window._teamMerge();
  }, N0);
  const cons2 = await p.evaluate((n) => window._teamConsensus(n), N0);
  ck('second peer aggregates (2 flags)', cons2.flag === 2 && cons2.total === 2);

  // 6 TEAM panel ranks flagged candidates first
  await p.evaluate(() => window._teamOpen());
  await p.waitForTimeout(250);
  const panel = await p.evaluate((n) => {
    const ov = document.getElementById('team-ov');
    const first = ov && ov.querySelector('[data-tmname]');
    return { ov: !!ov, share: !!document.getElementById('team-share-btn'), firstName: first ? first.getAttribute('data-tmname') : null };
  }, N0);
  ck('TEAM panel opens with share button', panel.ov && panel.share);
  ck('TEAM panel ranks the most-flagged first', panel.firstName === N0);

  // 7 share builds a #team= link from own dispositions
  const share = await p.evaluate(() => {
    localStorage.setItem('ds-dispo', JSON.stringify({ 'Tau Ceti': 'flag' }));
    let captured = null; const _p = window.prompt; window.prompt = (m, v) => { captured = v; return null; };
    window._teamShare();
    window.prompt = _p;
    return captured;
  });
  ck('team share emits a #team= url', !!share && /#team=/.test(share));

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
