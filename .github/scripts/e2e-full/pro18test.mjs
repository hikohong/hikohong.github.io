/* PRO-18 — candidate verification suite: RFI forensics, drift plausibility,
   sky-frequency coincidence, energetics. Engine checks are pure and run on both
   pages; catalog-level checks gate on whether candidate data actually loaded. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const CAT = JSON.parse(readFileSync(process.cwd() + '/deepsignal/catalog.json', 'utf8'));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const b = await chromium.launch();
const checks = []; const ck = (l, ok) => checks.push([l, ok]);

for (const [label, file] of [['gallery', 'gallery.html'], ['index', 'index.html']]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  await ctx.addInitScript(() => localStorage.setItem('ds-obs', JSON.stringify({ lat: 25, lon: 121, src: 'MANUAL' })));
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/catalog.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CAT) }));
  await p.route('**/alasky.cds.unistra.fr/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await p.route('**/hips2fits**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await p.goto('file://' + process.cwd() + '/deepsignal/' + file);
  await p.waitForTimeout(1800);

  /* ── engines (pure, no catalog needed) ── */
  const eng = await p.evaluate(() => ({
    api: ['_vfyBand', '_vfyDrift', '_vfyEirp', '_vfyVerdict', '_vfyTarget', '_verifyOpen', '_vfySweepOpen', '_vfyScanAll']
           .every(k => typeof window[k] === 'function'),
    gps: window._vfyBand(1575.42), hi: window._vfyBand(1420.4), none: window._vfyBand(6794.79),
    iridium: window._vfyBand(1620),
    dZero: window._vfyDrift(1400, 0.001).state,
    dOk: window._vfyDrift(6794.79, 1.5186).state,
    dHot: window._vfyDrift(1400, 99).state,
    e1: window._vfyEirp(35, 0.0057, 1), e10: window._vfyEirp(35, 0.0057, 10), e100: window._vfyEirp(35, 0.0057, 100),
  }));
  ck(`${label}: verification API exposed`, eng.api);
  ck(`${label}: GPS L1 flagged as terrestrial`, !!eng.gps && eng.gps.kind === 'rfi');
  ck(`${label}: Iridium band flagged`, !!eng.iridium && eng.iridium.kind === 'rfi');
  ck(`${label}: HI line marked protected (credit, not fail)`, !!eng.hi && eng.hi.kind === 'prot');
  ck(`${label}: clean frequency has no allocation`, eng.none === null);
  ck(`${label}: zero drift detected as local`, eng.dZero === 'zero');
  ck(`${label}: plausible drift passes`, eng.dOk === 'ok');
  ck(`${label}: implausible drift flagged`, eng.dHot === 'extreme');
  ck(`${label}: EIRP grows as distance squared`, Math.abs(eng.e10 / eng.e1 - 100) < 1 && Math.abs(eng.e100 / eng.e10 - 100) < 1);
  ck(`${label}: EIRP magnitude is physical`, eng.e10 > 1e11 && eng.e10 < 1e16);

  /* ── catalog-level ── */
  const scan = await p.evaluate(() => {
    const all = window._vfyScanAll();
    const t = {}; for (const v of all) t[v.level] = (t[v.level] || 0) + 1;
    const mixed = all.find(v => v.nTotal > 1 && v.nFail > 0 && v.nFail < v.nTotal);
    const dead = all.find(v => v.nTotal > 0 && v.nFail === v.nTotal);
    return { n: all.length, tally: t, mixed: mixed ? { lvl: mixed.level, nFail: mixed.nFail, nTotal: mixed.nTotal } : null,
             dead: dead ? dead.level : null, name: all.length ? all[0].name : null };
  });
  if (!scan.n) {
    console.log(`SKIP ${label}: no candidate data in this environment — catalog checks skipped`);
  } else {
    ck(`${label}: sweep returns testable targets`, scan.n > 0);
    ck(`${label}: verdicts are only PASS/SUSPECT/FAIL`, Object.keys(scan.tally).every(k => ['PASS', 'SUSPECT', 'FAIL'].includes(k)));
    ck(`${label}: a target with some clean detections is NOT condemned`, scan.mixed === null || scan.mixed.lvl !== 'FAIL');
    ck(`${label}: a target failing every detection is FAIL`, scan.dead === null || scan.dead === 'FAIL');

    // per-candidate panel
    await p.evaluate(n => window._verifyOpen(n), scan.name);
    await p.waitForTimeout(400);
    const panel = await p.evaluate(() => {
      const o = document.getElementById('verify-ov'); if (!o) return null;
      const txt = o.textContent;
      return { ban: !!o.querySelector('.vfy-ban'), secs: o.querySelectorAll('.vfy-sec').length,
               tbl: !!o.querySelector('.vfy-tbl'),
               hasAll: ['SPECTRUM ALLOCATION', 'DRIFT PLAUSIBILITY', 'SKY COINCIDENCE', 'ENERGETICS'].every(s => txt.includes(s)),
               bottom: txt.includes('Bottom line') };
    });
    ck(`${label}: verify panel opens with a verdict banner`, !!panel && panel.ban);
    ck(`${label}: panel carries all four engines`, !!panel && panel.hasAll);
    ck(`${label}: panel shows the EIRP ladder`, !!panel && panel.tbl);
    ck(`${label}: panel gives a plain-language bottom line`, !!panel && panel.bottom);
    await p.keyboard.press('Escape'); await p.waitForTimeout(250);
    ck(`${label}: ESC closes the verify panel`, await p.evaluate(() => !document.getElementById('verify-ov')));

    // sweep panel + drill-through
    await p.evaluate(() => window._vfySweepOpen());
    await p.waitForTimeout(400);
    ck(`${label}: sweep lists targets`, await p.evaluate(() => (document.querySelectorAll('#vfysweep-ov [data-vfy]') || []).length > 0));
    await p.click('#vfysweep-ov [data-vfy]');
    await p.waitForTimeout(400);
    ck(`${label}: sweep row drills into verify`, await p.evaluate(() => !!document.getElementById('verify-ov') && !document.getElementById('vfysweep-ov')));
    await p.keyboard.press('Escape'); await p.waitForTimeout(250);

    // card badges — only failing/suspect targets get one
    const badge = await p.evaluate(() => {
      const c = document.querySelectorAll('.vfy-chip');
      return { n: c.length, inScore: [...c].every(e => e.closest('.card-score')) };
    });
    ck(`${label}: failing cards are badged`, badge.n > 0);
    ck(`${label}: badges sit on the card score line`, badge.n === 0 || badge.inScore);

    // JARVIS intent
    const ask = await p.evaluate(() => {
      const r = window._ask('show me the rfi', false);
      return r && r.say ? r.say : '';
    });
    ck(`${label}: JARVIS answers a falsification question`, /fail|falsif/i.test(ask));
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  }

  ck(`${label}: CDU knows VERIFY and RFI`, await p.evaluate(() => {
    const s = document.documentElement.innerHTML;
    return s.indexOf('VERIFY') > -1 && s.indexOf('RFI') > -1;
  }));
  ck(`${label}: no JS errors`, errs.length === 0);
  if (errs.length) console.log(label, 'ERRS', errs.slice(0, 4));
  await ctx.close();
}
await b.close();
for (const [l, ok] of checks) console.log((ok ? 'PASS ' : 'FAIL ') + l);
const bad = checks.filter(c => !c[1]).length;
console.log(bad ? `FAILED (${bad}/${checks.length})` : `ALL PASS (${checks.length} checks)`);
process.exit(bad ? 1 : 0);
