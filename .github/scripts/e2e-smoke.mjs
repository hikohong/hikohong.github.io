/* Headless-chromium smoke test run in CI before every deploy: both pages must
   load with zero page errors and the NAVCON console must boot (radar opens). */
import { chromium } from 'playwright';
const b = await chromium.launch();
let fail = 0;
for (const f of ['deepsignal/index.html', 'deepsignal/gallery.html']) {
  const p = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + process.cwd() + '/' + f);
  await p.waitForTimeout(1500);
  const boot = await p.evaluate(() => !!document.getElementById('hud-radar-btn'));
  let scopeOk = false;
  if (boot) {
    await p.click('#hud-radar-btn');
    await p.waitForTimeout(500);
    scopeOk = await p.evaluate(() => !!document.getElementById('radar-ov'));
  }
  const ok = errs.length === 0 && boot && scopeOk;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${f}: pageerrors=${errs.length} hud=${boot} radar=${scopeOk}`);
  if (errs.length) console.log('  errors:', errs.slice(0, 3).join(' | '));
  if (!ok) fail++;
}
await b.close();
if (fail) { console.log('E2E SMOKE FAILED'); process.exit(1); }
console.log('E2E SMOKE PASSED');
