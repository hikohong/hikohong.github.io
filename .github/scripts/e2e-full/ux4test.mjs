import { chromium } from 'playwright';
const exe=undefined;
const b=await chromium.launch();
const checks=[]; const push=(l,ok)=>checks.push([l,ok]);
const ctx=await b.newContext({viewport:{width:390,height:800}, hasTouch:true});
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+process.cwd()+'/deepsignal/gallery.html'); await p.waitForTimeout(700);

// 4. HUD bar swipeable on portrait phone
const hud=await p.evaluate(()=>{
  const h=document.getElementById('hud-status');
  const hidden=[...document.querySelectorAll('.hud-hide-sm')].filter(e=>getComputedStyle(e).display==='none').length;
  h.scrollLeft=300;
  return {sw:h.scrollWidth, cw:h.clientWidth, scrolled:h.scrollLeft>0, hiddenCount:hidden, pageX:window.scrollX,
    ox:getComputedStyle(h).overflowX};
});
push('HUD bar wider than viewport + scrollable', hud.sw>hud.cw && hud.scrolled && hud.ox==='auto');
push('hud-hide-sm segments now visible (swipe reaches all)', hud.hiddenCount===0);
push('page itself does not pan', hud.pageX===0);

// 1+2+3. OFFLINE alert → detailed explainer → ESC/outside dismissal
await ctx.setOffline(true); await p.waitForTimeout(1600);   // tick picks up navigator.onLine=false
const light=await p.$('#cas-OFFLINE');
push('OFFLINE CAS light appears', !!light);
// open bottom-left sys notices, click the OFFLINE row
await p.evaluate(()=>document.getElementById('hud-sys').click()); await p.waitForTimeout(300);
push('sys notices panel open', !!(await p.$('#sys-notices')));
await p.evaluate(()=>{ const b=document.querySelector('#sys-notices .sys-notice[data-casid="OFFLINE"]'); if(b) b.click(); });
await p.waitForTimeout(300);
const ex=await p.$eval('#cas-explain', el=>el.textContent).catch(()=>'');
push('explainer has icon', /📴/.test(ex));
push('explainer has WHY section', /WHY/.test(ex) && /reversionary|offline/i.test(ex));
push('explainer has ACTION section', /ACTION/.test(ex) && /Reconnect/i.test(ex));
// outside tap closes cas-explain — synthetic pointerdown on the nav (guaranteed
// outside the explainer box, no card click-through side effects)
await p.evaluate(()=>document.querySelector('nav').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})));
await p.waitForTimeout(250);
push('outside tap closes explainer', !(await p.$('#cas-explain')));
// sys-notices also closed by that same outside tap (docked panel)
push('outside tap closes sys notices too', !(await p.$('#sys-notices')));
await ctx.setOffline(false); await p.waitForTimeout(400);

// ESC closes tracking list
await p.evaluate(()=>document.getElementById('hud-trk-btn').click()); await p.waitForTimeout(300);
push('tracking list open', !!(await p.$('#trklist-ov')));
await p.keyboard.press('Escape'); await p.waitForTimeout(250);
push('ESC closes tracking list', !(await p.$('#trklist-ov')));
// outside tap closes tracking list
await p.evaluate(()=>document.getElementById('hud-trk-btn').click()); await p.waitForTimeout(300);
await p.evaluate(()=>document.querySelector('nav').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})));
await p.waitForTimeout(250);
push('outside tap closes tracking list', !(await p.$('#trklist-ov')));
// ESC closes a PRO-3 overlay (QRH) and the SD page
await p.evaluate(()=>window._qrhToggle()); await p.waitForTimeout(250);
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
push('ESC closes QRH overlay', !(await p.$('#qrh-ov')));
await p.evaluate(()=>window._sdToggle()); await p.waitForTimeout(250);
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
push('ESC closes SYS page', !(await p.$('#sd-ov')));
// ESC closes scope (via toggle, no reopen)
await p.evaluate(()=>document.getElementById('hud-scope-btn').click()); await p.waitForTimeout(300);
await p.keyboard.press('Escape'); await p.waitForTimeout(250);
push('ESC closes scope', !(await p.$('#scope-ov')));

push('no JS errors', errs.length===0);
if(errs.length) console.log('errs:', errs.slice(0,4));
let all=true; for(const[l,ok]of checks){console.log((ok?'PASS ':'FAIL ')+l); if(!ok)all=false;}
console.log(all?('ALL PASS ('+checks.length+')'):'FAILED');
await b.close();
