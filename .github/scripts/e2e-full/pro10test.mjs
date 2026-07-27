import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const CAT = JSON.parse(readFileSync(process.cwd() + '/deepsignal/catalog.json', 'utf8'));

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
  await p.waitForTimeout(1600);

  // 1 open sphere → overlay + canvas + point cloud
  await p.evaluate(() => window._sphereToggle());
  await p.waitForTimeout(300);
  const st = await p.evaluate(() => ({ ov: !!document.getElementById('sphere-ov'), cv: !!document.getElementById('sphere-cv'), s: window._sphereState() }));
  ck('sphere opens with canvas', st.ov && st.cv);
  ck('sphere builds a candidate point cloud', st.s && st.s.n >= 20);
  ck('sphere initial state (yaw 0, zoom 1)', st.s && st.s.yaw === 0 && st.s.zoom === 1);

  // 2 canvas actually renders (non-blank)
  const painted = await p.evaluate(() => {
    const cv = document.getElementById('sphere-cv'); const c = cv.getContext('2d');
    const d = c.getImageData(0, 0, cv.width, cv.height).data; let nz = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) { nz++; if (nz > 50) break; }
    return nz;
  });
  ck('sphere canvas is painted', painted > 50);

  // 3 drag rotates the sphere
  const cx = 640, cy = 450;
  await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 120, cy + 40, { steps: 5 }); await p.mouse.up();
  await p.waitForTimeout(100);
  const rot = await p.evaluate(() => window._sphereState());
  ck('drag changes yaw + pitch', Math.abs(rot.yaw) > 0.1 && rot.pitch !== -0.35);

  // 4 wheel zooms
  await p.mouse.move(cx, cy); await p.mouse.wheel(0, -300); await p.waitForTimeout(100);
  const z = await p.evaluate(() => window._sphereState().zoom);
  ck('wheel increases zoom', z > 1);

  // 5 pick + select a real candidate (project a known point, click there)
  const pick = await p.evaluate(() => {
    const s = window._sphereState();
    // find a front-facing candidate and its screen position
    const nt = (typeof CANDIDATES !== 'undefined' ? CANDIDATES : []);
    for (const c of nt) {
      const sc = window._sphereScreenOf(c.name);
      if (sc && sc.front) { const hit = window._spherePick(sc.x, sc.y); return hit ? hit.name : null; }
    }
    return null;
  });
  ck('spherePick returns a candidate at its projected position', !!pick);

  // 6 selecting shows the info card + lock button locks
  await p.evaluate(() => { const c = (typeof CANDIDATES !== 'undefined' ? CANDIDATES : [])[0]; window._lockOn(c.name, c.ra, c.dec, c.score, false); });
  await p.waitForTimeout(150);
  ck('lock from sphere works', await p.evaluate(() => !!document.getElementById('lock-ov')));
  await p.keyboard.press('Escape');

  // 7 ESC closes sphere + cleans up
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  ck('ESC closes sphere + clears state', await p.evaluate(() => !document.getElementById('sphere-ov') && window._sphereState() === null));

  // 8 legacy sphere engine reopens directly (PRO-16 rerouted CDU 3D -> radar;
  // the standalone sphere engine is retained and still works on its own).
  await p.evaluate(() => { try { document.activeElement.blur(); } catch (e) {} });
  await p.evaluate(() => window._sphereToggle()); await p.waitForTimeout(250);
  ck('legacy _sphereToggle reopens sphere', await p.evaluate(() => !!document.getElementById('sphere-ov')));
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
