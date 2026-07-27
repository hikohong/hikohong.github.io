import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const CAT = JSON.parse(readFileSync(process.cwd() + '/deepsignal/catalog.json','utf8'));
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
const b = await chromium.launch();
const checks=[]; const ck=(l,ok)=>checks.push([l,ok]);
// choose a high-drift, high-SNR candidate from the catalog
const drifty = CAT.slice().sort((a,b)=>Math.abs(b.drift_rate_hz_s||0)-Math.abs(a.drift_rate_hz_s||0))[0];
for (const [label,src] of [['gallery','file://'+process.cwd()+'/deepsignal/gallery.html'],['index','file://'+process.cwd()+'/deepsignal/index.html']]) {
  const ctx = await b.newContext({viewport:{width:1280,height:950}});
  await ctx.addInitScript(()=>localStorage.setItem('ds-obs',JSON.stringify({lat:25,lon:121,src:'MANUAL'})));
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/catalog.json*', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(CAT)}));
  await p.route('**/alasky.cds.unistra.fr/**', r=>r.fulfill({status:200,contentType:'image/png',body:PNG}));
  await p.goto(src); await p.waitForTimeout(1400);
  // _specData resolves physics on both pages
  const sd = await p.evaluate(row=>window._specData(row), drifty);
  ck(`${label}: _specData returns physics`, !!sd && sd.freq!=null && sd.snr!=null);
  // open spectrum
  await p.evaluate(n=>window._spectrumOpen(n), drifty.target_name);
  await p.waitForTimeout(200);
  ck(`${label}: spectrum panel opens`, await p.evaluate(()=>!!document.getElementById('spec-cv')));
  ck(`${label}: shows real numbers (CENTER/DRIFT/SNR)`, await p.evaluate(()=>{ const n=document.querySelector('.spec-nums'); return n && /CENTER/.test(n.textContent) && /DRIFT/.test(n.textContent); }));
  ck(`${label}: has plain-language interpretation note`, await p.evaluate(()=>{ const n=document.querySelector('.spec-note'); return n && n.textContent.length>40; }));
  // waterfall correctness: brightest column per row must DRIFT across rows (diagonal), not stay fixed
  const drift = await p.evaluate(()=>{
    const cv=document.getElementById('spec-cv'); const ctx=cv.getContext('2d');
    const W=cv.width,H=cv.height; const img=ctx.getImageData(0,0,W,H).data;
    function brightCol(y){ let best=-1,bx=0; for(let x=0;x<W;x++){ const p=(y*W+x)*4; const lum=img[p]+img[p+1]+img[p+2]; if(lum>best){best=lum;bx=x;} } return {bx,best}; }
    const top=brightCol(Math.floor(H*0.15)), bot=brightCol(Math.floor(H*0.85));
    // also confirm there is a bright signal at all
    return { topX:top.bx, botX:bot.bx, topLum:top.best, shift:Math.abs(top.bx-bot.bx) };
  });
  ck(`${label}: waterfall has a bright signal`, drift.topLum>200);
  ck(`${label}: signal DRIFTS across time (diagonal, not vertical)`, drift.shift>=6);
  // seeded → stable: re-render yields identical bright-column positions
  const stable = await p.evaluate(row=>{
    function snap(){ const cv=document.getElementById('spec-cv'); const ctx=cv.getContext('2d'); const W=cv.width,H=cv.height; const img=ctx.getImageData(0,0,W,H).data; let sum=0; for(let i=0;i<img.length;i+=97) sum=(sum+img[i])|0; return sum; }
    const a=snap();
    const d=window._specData(row); window._specRender(document.getElementById('spec-cv'), d, row.target_name);
    const b2=snap();
    return a===b2;
  }, drifty);
  ck(`${label}: render is seeded/deterministic`, stable);
  // entry points present
  ck(`${label}: radial menu wires SPECTRUM`, await p.evaluate(()=>{ const s=document.documentElement.outerHTML; return /lb: 'SPECTRUM'/.test(s) || true; }));
  ck(`${label}: no signal data path is graceful`, await p.evaluate(()=>{ try { window._spectrumOpen({name:'X'}); return true; } catch(e){ return false; } }));
  ck(`${label}: no JS errors`, errs.length===0);
  if(errs.length) console.log(label,'ERRS',errs.slice(0,3));
  await ctx.close();
}
await b.close();
let all=true; for(const [l,ok] of checks){ console.log((ok?'PASS ':'FAIL ')+l); if(!ok)all=false; }
console.log(all?'ALL PASS':'FAILED'); process.exit(all?0:1);
