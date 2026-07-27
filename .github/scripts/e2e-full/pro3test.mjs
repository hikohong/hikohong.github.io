import { chromium } from 'playwright';
const exe=undefined;
const b=await chromium.launch();
const checks=[]; const push=(l,ok)=>checks.push([l,ok]);

// ── GALLERY context ──
const ctx=await b.newContext({viewport:{width:1280,height:900}, geolocation:{latitude:25.03,longitude:121.56}, permissions:['geolocation']});
await ctx.addInitScript(s=>localStorage.setItem('ds-track-list', s),
  JSON.stringify([{name:'Tau Ceti',ra:26.017,dec:-15.94,t:1},{name:'ZZ Polar',ra:180,dec:85,t:2}]));
await ctx.addInitScript(()=>localStorage.setItem('ds-aos-deg','30'));
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
p.on('dialog',d=>d.dismiss().catch(()=>{}));
await p.route('**/api.open-meteo.com/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{"hourly":{"time":[],"cloud_cover":[]}}'}));
await p.route('**/api.alerce.online/**', r=>r.fulfill({status:200,contentType:'application/json',
  body:JSON.stringify({items:[
    {oid:'ZTF26aaaaaaa',meanra:26.1,meandec:-15.9,lastmjd:61233.2,class_name:'SN candidate'},
    {oid:'ZTF26bbbbbbb',meanra:100,meandec:40,lastmjd:61233.0,class_name:'CV/Nova'}]})}));
await p.goto('file://'+process.cwd()+'/deepsignal/gallery.html'); await p.waitForTimeout(900);
// prime geo via scope, then close
await p.evaluate(()=>window._scopeToggle());
await p.waitForFunction(()=>{const g=document.getElementById('scope-geo');return g&&/OBS/.test(g.textContent);},{timeout:5000});
await p.click('#scope-x'); await p.waitForTimeout(200);

// 1. tracking list → alt chart via OBS chip
await p.click('#hud-trk-btn'); await p.waitForTimeout(900);
push('PLAN button in header', !!(await p.$('#trklist-ov button[onclick="_thPlan()"]')));
push('SHARE button in header', !!(await p.$('#trklist-ov button[onclick="_thShare()"]')));
const chip=await p.$('#trk-body .th-obs');
push('OBS chip clickable', !!chip && /altChart/.test(await chip.getAttribute('onclick')||''));
await chip.click(); await p.waitForTimeout(400);
push('alt chart overlay + canvas', !!(await p.$('#ac-ov #ac-cv')));
const acTxt=await p.$eval('#ac-ov .p3-body', el=>el.textContent);
push('chart header has MOON %', /MOON \d+%/.test(acTxt));
push('chart shows AOS +30° (threshold honored)', /AOS \+30°/.test(acTxt));
await p.click('#ac-ov .p3-x'); await p.waitForTimeout(200);

// 2. mission plan
await p.evaluate(()=>window._thPlan()); await p.waitForTimeout(400);
const planTxt=await p.$eval('#plan-ov .p3-body', el=>el.textContent).catch(()=>'');
push('mission plan renders', /SCHEDULABLE TONIGHT/.test(planTxt));
push('plan rows or NO WINDOW section', /OBS \d+|NO WINDOW TONIGHT/.test(planTxt));
await p.evaluate(()=>{const o=document.getElementById('plan-ov'); if(o)o.remove();});

// 3. share → hash merge in a fresh page
let sharedUrl='';
await p.evaluate(()=>{ window.prompt=(m,u)=>{ window.__share=u; return null; }; });
await p.evaluate(()=>window._thShare());
sharedUrl=await p.evaluate(()=>window.__share||'');
push('share URL carries #trk=', /#trk=.+/.test(sharedUrl));
const p2=await ctx.newPage();
await p2.goto('file://'+process.cwd()+'/deepsignal/gallery.html#trk='+sharedUrl.split('#trk=')[1].slice(0,4000)); // same list; test merge of a NEW name
// craft a custom hash with an extra target instead:
const extra=Buffer.from(JSON.stringify([['New Star X',10,10]])).toString('base64');
const p3=await ctx.newPage();
await p3.goto('file://'+process.cwd()+'/deepsignal/gallery.html#trk='+extra); await p3.waitForTimeout(800);
const merged=await p3.evaluate(()=>JSON.parse(localStorage.getItem('ds-track-list')||'[]').some(e=>e.name==='New Star X'));
push('hash handoff merges new target', merged);
await p2.close(); await p3.close();

// 4. QRH persist
await p.evaluate(()=>window._qrhToggle()); await p.waitForTimeout(300);
await p.click('#qrh-ov input[data-qi="0"]'); await p.waitForTimeout(200);
push('QRH persisted', /"0":1/.test(await p.evaluate(()=>localStorage.getItem('ds-qrh'))||''));
await p.evaluate(()=>{const o=document.getElementById('qrh-ov'); if(o)o.remove();});

// 5. TRX transient watch (mocked)
await p.evaluate(()=>window._trxToggle()); await p.waitForTimeout(600);
const trx=await p.$eval('#trx-ov .p3-body', el=>el.textContent).catch(()=>'');
push('TRX lists mocked alerts', /ZTF26aaaaaaa/.test(trx) && /SN candidate/.test(trx));
push('TRX proximity highlight (0.16° from Tau Ceti)', /NEAR TRACKED TARGET/.test(trx));
await p.evaluate(()=>{const o=document.getElementById('trx-ov'); if(o)o.remove();});

// 6. TUNE re-rank
push('TUNE toolbar button on gallery', !!(await p.$('button[onclick="_tuneToggle()"]')));
const firstBefore=await p.$eval('#grid .card', el=>el.id);
await p.evaluate(()=>window._tuneToggle()); await p.waitForTimeout(300);
await p.$eval('#tune-ov input[data-k="nonradio"]', el=>{ el.value=25; el.dispatchEvent(new Event('input',{bubbles:true})); });
await p.click('#tune-apply'); await p.waitForTimeout(400);
const firstAfter=await p.$eval('#grid .card', el=>el.id);
const chipTxt=await p.$eval('#grid .card .tune-chip', el=>el.textContent).catch(()=>'');
push('TUNE re-ranks cards (T chip present)', /T \d+/.test(chipTxt));
push('TUNE persisted', /nonradio":25/.test(await p.evaluate(()=>localStorage.getItem('ds-tune'))||''));
await p.click('#tune-reset'); await p.waitForTimeout(300);
const firstReset=await p.$eval('#grid .card', el=>el.id);
push('TUNE reset restores pipeline order', firstReset===firstBefore);
// 7. content-visibility perf
push('gallery cards content-visibility:auto', (await p.$eval('#grid .card', el=>getComputedStyle(el).contentVisibility))==='auto');
// 8. MFD
await p.evaluate(()=>window._mfdToggle()); await p.waitForTimeout(500);
push('MFD opens scope+list together', await p.evaluate(()=>!!document.getElementById('scope-ov')&&!!document.getElementById('trklist-ov')));
push('no JS errors (gallery)', errs.length===0);
if(errs.length) console.log('gallery errs:', errs.slice(0,4));

// ── WEB (search) context: SIMBAD enrich ──
const pw=await (await b.newContext()).newPage(); const errsW=[]; pw.on('pageerror',e=>errsW.push(e.message));
await pw.route('**/simbad.cds.unistra.fr/**', r=>r.fulfill({status:200,contentType:'application/json',
  body:JSON.stringify({data:[["Star","M3.5V",80.0]]})}));
await pw.goto('file://'+process.cwd()+'/deepsignal/index.html'); await pw.waitForTimeout(500);
await pw.evaluate(()=>{
  const c=document.getElementById('result-card');
  c.innerHTML='<div class="result-inner"><div class="result-body"><div class="result-name">Test Star</div><div class="result-coords">RA 26° Dec -15°</div></div></div>';
  return _simbadEnrich('Test Star', 26.0, -15.0);
});
await pw.waitForTimeout(400);
const enrich=await pw.$eval('#simbad-enrich', el=>el.textContent).catch(()=>'');
push('SIMBAD enrich line (type · SP · 12.5 pc)', /Star/.test(enrich)&&/M3\.5V/.test(enrich)&&/12\.5 pc/.test(enrich));
push('no JS errors (web)', errsW.length===0);
if(errsW.length) console.log('web errs:', errsW.slice(0,4));

let all=true; for(const[l,ok]of checks){console.log((ok?'PASS ':'FAIL ')+l); if(!ok)all=false;}
console.log(all?('ALL PASS ('+checks.length+' checks)'):'FAILED');
await b.close();
