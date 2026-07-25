/* HUD regression guards:
   - 3D (◉ 3D) HUD button must actually open the sphere overlay. Regression: the
     HUD-wiring IIFE bound window._sphereToggle before it was defined, attaching
     `undefined` — the button did nothing. Fixed by a click-time closure.
   - The 🎙 ASK button must reopen the typed Ask box every time, even in a browser
     that has SpeechRecognition but denies the mic (the common real-world path).
     Regression: a stuck _rec / a synchronous .start() throw left the button dead. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const CAT = JSON.parse(readFileSync(process.cwd() + '/deepsignal/catalog.json', 'utf8'));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const b = await chromium.launch();
const checks = [];
const ck = (l, ok) => checks.push([l, ok]);

for (const [label, rel] of [['gallery', '/deepsignal/gallery.html'], ['index', '/deepsignal/index.html']]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => {
    // a browser that HAS SpeechRecognition but DENIES the mic — the bug-1 path
    class FakeSR { start(){ const s=this; setTimeout(()=>{ if(s.onstart)s.onstart(); setTimeout(()=>{ if(s.onerror)s.onerror({error:'not-allowed'}); if(s.onend)s.onend(); },5); },1); } stop(){ if(this.onend)this.onend(); } }
    window.webkitSpeechRecognition = FakeSR;
    localStorage.setItem('ds-obs', JSON.stringify({ lat: 25, lon: 121, src: 'MANUAL' }));
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route('**/catalog.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CAT) }));
  await p.route('**/alasky.cds.unistra.fr/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await p.goto('file://' + process.cwd() + rel);
  await p.waitForTimeout(1500);

  // Bug 2: 3D button opens the sphere overlay
  await p.click('#hud-sphere-btn');
  await p.waitForTimeout(250);
  ck(`${label}: 3D button opens sphere overlay`, await p.evaluate(() => !!document.getElementById('sphere-ov')));
  await p.evaluate(() => { if (document.getElementById('sphere-ov')) window._sphereToggle(); });

  // Bug 1: Ask box reopens on every mic tap despite mic denial
  let reopened = true;
  for (let i = 0; i < 3; i++) {
    await p.click('#hud-mic-btn');
    await p.waitForTimeout(70);
    if (!(await p.evaluate(() => !!document.getElementById('askbox-ov')))) reopened = false;
    await p.evaluate(() => { const o = document.getElementById('askbox-ov'); if (o) o.remove(); });
  }
  ck(`${label}: Ask box reopens on repeated mic taps (mic denied)`, reopened);
  ck(`${label}: no JS errors`, errs.length === 0);
  if (errs.length) console.log(`${label} ERRS`, errs.slice(0, 3));
  await ctx.close();
}

await b.close();
let all = true;
for (const [l, ok] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + l); if (!ok) all = false; }
console.log(all ? 'ALL PASS' : 'FAILED');
process.exit(all ? 0 : 1);
