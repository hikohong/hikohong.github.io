import { chromium } from 'playwright';
const exe=undefined;
const PNG1='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1200,height:900}, geolocation:{latitude:25.03,longitude:121.56},
  permissions:['geolocation','notifications'], acceptDownloads:true});
await ctx.addInitScript(s=>localStorage.setItem('ds-track-list', s),
  JSON.stringify([{name:'Tau Ceti',ra:26.017,dec:-15.94,t:1},{name:'ZZ Polar',ra:180,dec:85,t:2}]));
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERR: '+e.message));
p.on('console',m=>{if(m.type()==='error'&&!/ERR_TUNNEL|Failed to load resource|URL scheme .file.|navigator\.vibrate|chromestatus/.test(m.text()))errs.push('CON: '+m.text());});
// ── mocks ──
await p.route('**/api.open-meteo.com/**', r=>{
  const t0=new Date(); t0.setUTCMinutes(0,0,0);
  const times=[],vals=[]; for(let i=0;i<48;i++){times.push(new Date(t0.getTime()+i*3600e3).toISOString().slice(0,16));vals.push(40);}
  r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({hourly:{time:times,cloud_cover:vals}})});
});
await p.route('**/api.wheretheiss.at/**', r=>r.fulfill({status:200,contentType:'application/json',
  body:JSON.stringify({latitude:25.03,longitude:121.56,altitude:420})}));   // directly overhead
await p.route('**/en.wikipedia.org/**', r=>r.fulfill({status:200,contentType:'application/json',
  body:JSON.stringify({query:{pages:{"1":{thumbnail:{source:'data:image/png;base64,'+PNG1}}}}})}));
await p.route('**/alasky.cds.unistra.fr/**', r=>r.fulfill({status:200,contentType:'image/png',body:Buffer.from(PNG1,'base64')}));
await p.route('**/simbad.cds.unistra.fr/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{"data":[]}'}));
await p.route('**/catalog.prev.json*', r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
await p.route('**/catalog_history.json*', r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
await p.route('**/services.swpc.noaa.gov/**', r=>r.fulfill({status:200,contentType:'application/json',body:'[["time_tag","Kp"],["2026-01-01 00:00:00","2.0"]]'}));

await p.goto('file://'+process.cwd()+'/deepsignal/gallery.html'); await p.waitForTimeout(1200);
const checks=[];

// 1. tracking list: OBS chip + TONIGHT sort + cloud + bell
await p.evaluate(()=>window._scopeToggle()); // prime geo (legacy scope engine)
await p.waitForFunction(()=>{const g=document.getElementById('scope-geo');return g&&/OBS/.test(g.textContent);},{timeout:5000});
// 2. scope time-scrub while open
checks.push(['scope tbar exists', !!(await p.$('#scope-tbar'))]);
await p.$eval('#scope-t', el=>{ el.value=6; el.dispatchEvent(new Event('input')); });
await p.waitForTimeout(400);
const simVis=await p.$eval('#scope-sim', el=>getComputedStyle(el).display!=='none');
const tlbl=await p.$eval('#scope-tlabel', el=>el.textContent);
const foot=await p.$eval('#scope-foot', el=>el.textContent);
checks.push(['SIM chip visible at T+6', simVis]);
checks.push(['label shows T+6H', /T\+6H/.test(tlbl)]);
checks.push(['foot prefixed SIM T+6H', /^SIM T\+6H/.test(foot)]);
await p.click('#scope-now'); await p.waitForTimeout(300);
checks.push(['NOW resets label', (await p.$eval('#scope-tlabel',el=>el.textContent))==='NOW']);
// 3. ISS advisory (mock = overhead)
await p.evaluate(()=>window._issTick()); await p.waitForTimeout(500);
const iss=await p.evaluate(()=>window._issState());
checks.push(['ISS elevation ~ overhead (>80°)', !!(iss.pos && iss.pos.el>80)]);
await p.click('#scope-x'); await p.waitForTimeout(200);
// 4. tracking list
await p.click('#hud-trk-btn'); await p.waitForTimeout(1200);
const rowHtml=await p.$eval('#trk-body', el=>el.innerHTML);
checks.push(['OBS chip rendered', /th-obs/.test(rowHtml)]);
// deterministic: rendering must agree with the scoring function itself
const w1=await p.evaluate(()=>window._obsWindow(26.017,-15.94));
const w2=await p.evaluate(()=>window._obsWindow(180,85));
checks.push(['obsWindow returns numeric score', typeof w1.score==='number' && typeof w2.score==='number']);
const anyFrom = !!(w1.from||w2.from);
checks.push(['BEST rendering matches scoring', anyFrom ? /BEST \d\d:\d\d/.test(rowHtml) : !/BEST \d\d:\d\d/.test(rowHtml)]);
checks.push(['CLOUD rendering matches scoring', anyFrom ? /CLOUD 40%/.test(rowHtml) : true]);
checks.push(['TONIGHT sort option', !!(await p.$('#trk-sort option[value="tonight"]'))]);
await p.selectOption('#trk-sort','tonight'); await p.waitForTimeout(300);
checks.push(['tonight persisted', (await p.evaluate(()=>localStorage.getItem('ds-track-sort')))==='tonight']);
// 5. AOS bell (notifications pre-granted)
await p.click('#trk-bell'); await p.waitForTimeout(300);
checks.push(['AOS armed (ds-aos=1)', (await p.evaluate(()=>localStorage.getItem('ds-aos')))==='1']);
checks.push(['bell shows armed', (await p.$eval('#trk-bell',el=>el.textContent))==='🔔']);
await p.click("#trk-x"); await p.waitForTimeout(200);
// 6. NVG
await p.click('#hud-nvg-btn'); await p.waitForTimeout(200);
checks.push(['NVG class applied', await p.evaluate(()=>document.documentElement.classList.contains('nvg'))]);
checks.push(['NVG persisted', (await p.evaluate(()=>localStorage.getItem('ds-nvg')))==='1']);
await p.click('#hud-nvg-btn'); await p.waitForTimeout(100);
// 7. systems page via FEEDS click
await p.evaluate(()=>{ document.getElementById('hud-feeds').parentElement.click(); });
await p.waitForTimeout(1500);
const sd=await p.$eval('#sd-body', el=>el.textContent);
checks.push(['SD: candidates listed', /CANDIDATES/i.test(sd) && /\d/.test(sd)]);
checks.push(['SD: per-source section', /SOURCES/i.test(sd)]);
const pass=await p.$$eval('#sd-body .sd-ok', els=>els.length);
checks.push(['SD: >=3 bus probes PASS (mocked)', pass>=3]);
await p.click('#sd-x'); await p.waitForTimeout(200);
// 8. disposition on gallery card
const d0=await p.$('.btn-dispo[data-dname]');
checks.push(['gallery dispo button exists', !!d0]);
await d0.click(); await p.waitForTimeout(200);
checks.push(['dispo → REVIEWED', /REVIEWED/.test(await d0.textContent())]);
const dmap=await p.evaluate(()=>localStorage.getItem('ds-dispo'));
checks.push(['dispo persisted', /rev/.test(dmap||'')]);
// 9. FDR export
await p.evaluate(()=>document.getElementById('hud-msg').click()); await p.waitForTimeout(300);
const dl=p.waitForEvent('download',{timeout:5000}).catch(()=>null);
await p.click('#journal-exp');
const gotDl=await dl;
checks.push(['FDR export downloads JSON', !!gotDl && /deepsignal-fdr-.*\.json/.test(gotDl.suggestedFilename())]);
// 10. voice toggle storage
await p.evaluate(()=>window._voiceToggle());
checks.push(['voice toggled on', (await p.evaluate(()=>localStorage.getItem('ds-voice')))==='1']);
// 11. reload: NVG off persisted-off, dispo restored on server-rendered card
await p.reload(); await p.waitForTimeout(1200);
const d1=await p.$eval('.btn-dispo[data-dname]', el=>el.textContent);
checks.push(['dispo restored after reload', /REVIEWED/.test(d1)]);
checks.push(['manifest link present', !!(await p.$('link[rel="manifest"]'))]);

let all=true; for(const[l,ok]of checks){console.log((ok?'PASS ':'FAIL ')+l); if(!ok)all=false;}
if(errs.length){console.log('ERRS:',JSON.stringify(errs.slice(0,6))); all=false;}
console.log(all?'ALL PASS ('+checks.length+' checks)':'FAILED');
await b.close();
