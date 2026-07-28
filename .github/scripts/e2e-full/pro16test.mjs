import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const CAT = JSON.parse(readFileSync(process.cwd() + '/deepsignal/catalog.json','utf8'));
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
const b = await chromium.launch();
const checks=[]; const ck=(l,ok)=>checks.push([l,ok]);
for (const [label,src] of [['gallery','file://'+process.cwd()+'/deepsignal/gallery.html'],['index','file://'+process.cwd()+'/deepsignal/index.html']]) {
  const ctx = await b.newContext({viewport:{width:1280,height:950}});
  await ctx.addInitScript(()=>localStorage.setItem('ds-obs',JSON.stringify({lat:25,lon:121,src:'MANUAL'})));
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/catalog.json*', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(CAT)}));
  await p.route('**/alasky.cds.unistra.fr/**', r=>r.fulfill({status:200,contentType:'image/png',body:PNG}));
  await p.goto(src); await p.waitForTimeout(1400);

  // HUD: one radar button, no standalone 3D button
  ck(`${label}: HUD has RADAR button`, await p.evaluate(()=>!!document.getElementById('hud-radar-btn')));
  ck(`${label}: standalone 3D HUD button removed`, await p.evaluate(()=>!document.getElementById('hud-sphere-btn')));

  // radar opens via button, default LOCAL, draws contacts
  await p.click('#hud-radar-btn'); await p.waitForTimeout(400);
  ck(`${label}: RADAR button opens console`, await p.evaluate(()=>!!document.getElementById('radar-ov')));
  let st = await p.evaluate(()=>window._radarState());
  ck(`${label}: default LOCAL mode`, st && st.mode==='LOCAL');
  ck(`${label}: radar has contacts`, st && st.contacts>0);
  ck(`${label}: LOCAL draws blips on screen`, st && st.screen>0);

  // mode switching LOCAL -> SKY -> 3D
  await p.click('#radar-ov [data-rmode="SKY"]'); await p.waitForTimeout(200);
  ck(`${label}: switch to SKY`, (await p.evaluate(()=>window._radarState().mode))==='SKY');
  await p.click('#radar-ov [data-rmode="3D"]'); await p.waitForTimeout(300);
  st = await p.evaluate(()=>window._radarState());
  ck(`${label}: switch to 3D`, st.mode==='3D');
  ck(`${label}: 3D draws globe points`, st.screen>0);
  ck(`${label}: 3D hides time-scrub`, await p.evaluate(()=>getComputedStyle(document.getElementById('radar-scrub')).display==='none'));

  // selecting a contact sets window._scopeSel (LOCK/LC/SPECTRUM compat)
  await p.click('#radar-ov [data-rmode="SKY"]'); await p.waitForTimeout(200);
  const sel = await p.evaluate(()=>{
    const s=window._radarState(); // pick first on-screen contact via internal screen list
    // simulate a pick by calling _radarSelect through a synthesized nearest pick at a known blip
    // use the exposed pick by clicking canvas center-ish is unreliable; instead focus a known target
    window._radarSetMode('SKY');
    return true;
  });
  // focus a real catalog target and confirm _scopeSel set
  const focusName = CAT[0].target_name;
  const scopeSel = await p.evaluate(n=>{ // radar exposes focus via _radarOpen(mode, name)
    window._radarOpen('SKY', n);
    return window._scopeSel ? window._scopeSel.name : null;
  }, focusName);
  ck(`${label}: selecting a contact sets _scopeSel`, String(scopeSel).toLowerCase()===String(focusName).toLowerCase());

  // ESC closes radar (stops RAF)
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ck(`${label}: ESC closes radar`, await p.evaluate(()=>!document.getElementById('radar-ov') && window._radarState()===null));

  // keyboard shortcuts: r opens radar, p prefs, ? keys, a ask
  await p.keyboard.press('r'); await p.waitForTimeout(300);
  ck(`${label}: 'r' opens radar`, await p.evaluate(()=>!!document.getElementById('radar-ov')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  await p.keyboard.press('p'); await p.waitForTimeout(200);
  ck(`${label}: 'p' opens Preferences`, await p.evaluate(()=>!!document.getElementById('prefs-ov')));
  // toggle a preference (NVG) and confirm it persisted
  const nvgToggled = await p.evaluate(()=>{
    const before = localStorage.getItem('ds-nvg')==='1';
    const btn = document.querySelector('#prefs-ov [data-pref="nvg"]'); if(!btn) return null;
    btn.click();
    return { before, after: localStorage.getItem('ds-nvg')==='1' };
  });
  ck(`${label}: Preferences NVG toggle flips state`, nvgToggled && nvgToggled.before!==nvgToggled.after);
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  await p.keyboard.press('?'); await p.waitForTimeout(200);
  ck(`${label}: '?' opens shortcuts`, await p.evaluate(()=>!!document.getElementById('keys-ov')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  await p.keyboard.press('a'); await p.waitForTimeout(200);
  ck(`${label}: 'a' opens Ask box`, await p.evaluate(()=>!!document.getElementById('askbox-ov')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);

  // legacy scope engine still works (MFD/CDU/tests depend on it)
  ck(`${label}: legacy _scopeToggle still opens scope`, await p.evaluate(()=>{ window._scopeToggle(); const ok=!!document.getElementById('scope-ov'); window._scopeToggle(); return ok; }));
  // legacy sphere engine still works (pro10 depends on it)
  ck(`${label}: legacy _sphereToggle still works`, await p.evaluate(()=>{ window._sphereToggle(); const ok=!!document.getElementById('sphere-ov'); window._sphereToggle(); return ok; }));

  // PRO-16b: top-nav Map link folded into Radar
  ck(`${label}: top-nav has Radar, Map folded in`, await p.evaluate(()=>{ const b=[...document.querySelectorAll('.nav-link')].map(x=>x.textContent.trim()); return b.includes('Radar') && !b.includes('Map'); }));
  // PRO-16b: card Map opens the radar SKY star chart, focused (not the legacy blue map)
  const cm = await p.evaluate(n=>{ mapOpenFromCard(0,0,n,100,false); const s=window._radarState(); return !!s && s.mode==='SKY' && String(s.sel).toLowerCase()===String(n).toLowerCase(); }, focusName);
  ck(`${label}: card Map opens radar SKY, focused`, cm);
  await p.keyboard.press('Escape'); await p.waitForTimeout(120);
  // PRO-16b: 3D globe rotates with a two-finger trackpad scroll (Y-axis moves)
  const tp = await p.evaluate(()=>{ window._radarOpen('3D'); const cv=document.getElementById('radar-cv'); const g=cv.getContext('2d'); const a=g.getImageData(0,0,cv.width,cv.height).data; let sa=0; for(let i=0;i<a.length;i+=997) sa=(sa+a[i])|0; cv.dispatchEvent(new WheelEvent('wheel',{deltaY:120,ctrlKey:false,bubbles:true,cancelable:true})); return new Promise(res=>setTimeout(()=>{ const bb=g.getImageData(0,0,cv.width,cv.height).data; let sb=0; for(let i=0;i<bb.length;i+=997) sb=(sb+bb[i])|0; res(sa!==sb); },120)); });
  ck(`${label}: 3D rotates with two-finger scroll`, tp);
  await p.keyboard.press('Escape'); await p.waitForTimeout(120);

  // PRO-16c: SKY hosts the real Map (all features, green); fixed larger console; LOCAL pans
  await p.click('#hud-radar-btn'); await p.waitForTimeout(250);
  const szA = await p.evaluate(()=>{ const r=document.getElementById('radar-con').getBoundingClientRect(); return [Math.round(r.width),Math.round(r.height)]; });
  await p.click('#radar-ov [data-rmode="SKY"]'); await p.waitForTimeout(250);
  const skyHost = await p.evaluate(()=>{ const mb=document.getElementById('map-body'),st=document.getElementById('radar-stage'); const r=document.getElementById('radar-con').getBoundingClientRect(); return { hosted: !!(mb&&st&&st.contains(mb)), green: st.classList.contains('rdr-mapmode'), dots: mb.querySelectorAll('[data-name]').length>0, hist: getComputedStyle(document.getElementById('radar-hist')).display!=='none', w:Math.round(r.width),h:Math.round(r.height) }; });
  ck(`${label}: SKY hosts the real #map-body (all Map features)`, skyHost.hosted && skyHost.dots);
  ck(`${label}: SKY greened + histogram button`, skyHost.green && skyHost.hist);
  ck(`${label}: console size constant SKY vs LOCAL`, skyHost.w===szA[0] && skyHost.h===szA[1]);
  await p.click('#radar-ov [data-rmode="LOCAL"]'); await p.waitForTimeout(200);
  ck(`${label}: leaving SKY restores map-body home`, await p.evaluate(()=>{ const mm=document.getElementById('map-modal'),mb=document.getElementById('map-body'); return mm&&mm.contains(mb); }));
  const localPan = await p.evaluate(()=>{ const cv=document.getElementById('radar-cv'),g=cv.getContext('2d'); const a=g.getImageData(0,0,cv.width,cv.height).data; let sa=0; for(let i=0;i<a.length;i+=997) sa=(sa+a[i])|0; cv.dispatchEvent(new WheelEvent('wheel',{deltaY:120,ctrlKey:false,bubbles:true,cancelable:true})); return new Promise(res=>setTimeout(()=>{ const bb=g.getImageData(0,0,cv.width,cv.height).data; let sb=0; for(let i=0;i<bb.length;i+=997) sb=(sb+bb[i])|0; res(sa!==sb); },140)); });
  ck(`${label}: LOCAL pans with two-finger scroll`, localPan);
  await p.keyboard.press('Escape'); await p.waitForTimeout(120);
  ck(`${label}: after close, map-body back home`, await p.evaluate(()=>{ const mm=document.getElementById('map-modal'),mb=document.getElementById('map-body'); return mm&&mm.contains(mb); }));

  ck(`${label}: no JS errors`, errs.length===0);
  if(errs.length) console.log(label,'ERRS',errs.slice(0,4));
  await ctx.close();
}
await b.close();
let all=true; for(const [l,ok] of checks){ console.log((ok?'PASS ':'FAIL ')+l); if(!ok)all=false; }
console.log(all?'ALL PASS':'FAILED'); process.exit(all?0:1);
