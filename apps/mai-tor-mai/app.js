
(function(){
'use strict';
const $ = (s, el=document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n, d=2) => Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const baht = n => (n>0?'+':n<0?'−':'') + Math.abs(Math.round(n)).toLocaleString('en-US') + ' ฿';
const pts = n => (n>0?'+':n<0?'−':'') + Math.abs(n).toFixed(1);
const r1 = n => Math.round(n*10)/10;
const thDate = iso => { const [y,m,d] = iso.split('-').map(Number); const mn=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']; return d+' '+mn[m-1]+' '+y; };
const toMin = t => { const [h,m,s] = t.split(':').map(Number); return h*60+m+(s||0)/60; };
const dur = (a,b) => { const m = Math.round(toMin(b)-toMin(a)); return Math.floor(m/60)+':'+String(m%60).padStart(2,'0'); };

const DEF_SET = {mult:200, comm:0, stop:3, target:6, tol:0.5, setups:'Breakout,เด้งแนวรับ,ตามเทรนด์,อื่นๆ', moods:'มั่นใจ,ปกติ,กลัวกำไรหาย,รีบ'};
const S = { days:{}, settings:{...DEF_SET}, tab:'home', daySel:null, filter:'all', modal:null, imp:{rows:[], status:'', busy:false}, proMsg:'', proPrice:'' };

// ---------- storage (on device) ----------
const CFG = window.APP_CONFIG || {};
const LS = 'tj-v1', LS_META = 'tj-meta';
function lsLoad(){ try{ const j = JSON.parse(localStorage.getItem(LS)||'null'); if(j){ S.days=j.days||{}; S.settings={...DEF_SET,...(j.settings||{})}; } }catch(e){} }
function lsSave(){ try{ localStorage.setItem(LS, JSON.stringify({days:S.days, settings:S.settings})); }catch(e){ toast('พื้นที่เก็บข้อมูลเต็ม กรุณาสำรองและลบข้อมูลเก่า'); } }
function meta(){ try{ return JSON.parse(localStorage.getItem(LS_META)||'{}'); }catch(e){ return {}; } }
function setMeta(p){ const m = {...meta(), ...p}; try{ localStorage.setItem(LS_META, JSON.stringify(m)); }catch(e){} return m; }
function deviceId(){ let m = meta(); if(!m.device){ m = setMeta({device: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+Math.random().toString(16).slice(2))}); } return m.device; }
async function saveDay(date){ lsSave(); }
async function delDay(date){ delete S.days[date]; lsSave(); }
async function saveSettings(){ lsSave(); }
function isPro(){ const m = meta(); return !!(m.ent && m.ent.exp && m.ent.exp*1000 > Date.now()); }

// ---------- Google Play billing (works only inside the Play-installed TWA) ----------
const PLAY = 'https://play.google.com/billing';
async function playService(){ try{ if('getDigitalGoodsService' in window) return await window.getDigitalGoodsService(PLAY); }catch(e){} return null; }
async function api(path, body){
  const r = await fetch(CFG.API_BASE + path, {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body)});
  let j = null; try{ j = await r.json(); }catch(e){}
  if(!r.ok) throw Object.assign(new Error((j && j.error) || ('HTTP '+r.status)), {code: j && j.code, status: r.status});
  return j;
}
async function verifyPurchase(purchaseToken){
  const j = await api('/api/verify', {purchaseToken, sku: CFG.PRO_SKU, deviceId: deviceId()});
  setMeta({ent: j.entitlement}); return j;
}
async function buyPro(){
  const svc = await playService();
  if(!svc){ S.proMsg = 'สมัคร Pro ได้ในแอปที่ติดตั้งจาก Google Play'; render(); return; }
  try{
    const req = new PaymentRequest([{supportedMethods: PLAY, data:{sku: CFG.PRO_SKU}}], {total:{label:'Total', amount:{currency:'THB', value:'0'}}});
    const res = await req.show();
    const token = res.details && res.details.purchaseToken;
    try{ await verifyPurchase(token); await res.complete('success'); S.proMsg = 'เปิดใช้ Pro แล้ว ขอบคุณครับ'; }
    catch(e){ await res.complete('fail'); S.proMsg = 'ยืนยันการซื้อไม่สำเร็จ ลองกด "กู้คืนการซื้อ" อีกครั้ง'; }
  }catch(e){ S.proMsg = e && e.name==='AbortError' ? '' : 'ยกเลิกหรือชำระเงินไม่สำเร็จ'; }
  render();
}
async function restorePro(){
  const svc = await playService();
  if(!svc){ S.proMsg = 'กู้คืนได้ในแอปที่ติดตั้งจาก Google Play'; render(); return; }
  try{
    const list = await svc.listPurchases(); const p = list.find(x => x.itemId === CFG.PRO_SKU);
    if(!p){ S.proMsg = 'ไม่พบการสมัคร Pro ในบัญชี Google นี้'; render(); return; }
    await verifyPurchase(p.purchaseToken); S.proMsg = 'กู้คืน Pro แล้ว';
  }catch(e){ S.proMsg = 'กู้คืนไม่สำเร็จ ลองใหม่อีกครั้ง'; }
  render();
}
async function loadPrice(){
  const svc = await playService(); if(!svc) return;
  try{ const [d] = await svc.getDetails([CFG.PRO_SKU]); if(d && d.price){ S.proPrice = new Intl.NumberFormat('th-TH',{style:'currency',currency:d.price.currency}).format(d.price.value); render(); } }catch(e){}
  // silently refresh entitlement from Play on launch
  try{ const list = await svc.listPurchases(); const p = list.find(x => x.itemId === CFG.PRO_SKU); if(p && !isPro()) { await verifyPurchase(p.purchaseToken); render(); } }catch(e){}
}

// ---------- engine ----------
function matchDay(date){
  const day = S.days[date]; if(!day) return {trades:[], open:[], flips:[]};
  const fills = [...(day.fills||[])].sort((a,b)=> toMin(a.time)-toMin(b.time) || String(a.orderId).localeCompare(String(b.orderId)));
  const lots = {}; const trades = []; const flips = [];
  fills.forEach(f => {
    const sym = f.symbol || 'S50'; const sgn = f.side==='Long'?1:-1; let q = Number(f.qty)||0; const px = Number(f.price);
    lots[sym] = lots[sym]||[]; const L = lots[sym]; let closed = 0;
    while(q>0 && L.length && L[0].sgn!==sgn){
      const lot = L[0]; const m = Math.min(q, lot.q);
      trades.push({date, sym, dir: lot.sgn===1?'Long':'Short', qty:m, et:lot.time, ep:lot.px, eid:lot.id, xt:f.time, xp:px, xid:f.orderId});
      q -= m; lot.q -= m; closed += m; if(lot.q===0) L.shift();
    }
    if(q>0){ if(closed>0) flips.push({time:f.time, side:f.side, qty:Number(f.qty), closed, opened:q, sym}); L.push({sgn, q, px, time:f.time, id:f.orderId}); }
  });
  const st = S.settings; const j = day.journal||{};
  trades.forEach((t,i) => {
    t.key = t.eid+'>'+t.xid+'#'+i;
    t.p = r1(t.dir==='Long' ? t.xp-t.ep : t.ep-t.xp);
    t.gross = t.p*t.qty*st.mult; t.fee = t.qty*2*st.comm; t.net = t.gross - t.fee;
    t.res = t.net>0?'win':t.net<0?'loss':'be';
    t.exit = t.p >= st.target-st.tol ? 'Target' : t.p <= -st.stop+st.tol ? 'Stop' : 'ปิดเอง';
    t.flip = flips.some(f => f.time===t.xt) || flips.some(f => f.time===t.et);
    t.j = j[t.key] || {};
  });
  const open = []; Object.values(lots).forEach(L => L.forEach(l => open.push(l)));
  return {trades, open, flips};
}
function stats(trades){
  const n = trades.length, w = trades.filter(t=>t.res==='win'), l = trades.filter(t=>t.res==='loss');
  const sum = (a,f) => a.reduce((s,x)=>s+f(x),0);
  return { n, w:w.length, l:l.length, wr: n? w.length/n : 0, net: sum(trades,t=>t.net), gross: sum(trades,t=>t.gross), fee: sum(trades,t=>t.fee),
    pts: r1(sum(trades,t=>t.p*t.qty)), qty: sum(trades,t=>t.qty), avgW: w.length? sum(w,t=>t.net)/w.length:0, avgL: l.length? sum(l,t=>t.net)/l.length:0,
    exp: n? sum(trades,t=>t.net)/n:0, tgt: trades.filter(t=>t.exit==='Target').length, stp: trades.filter(t=>t.exit==='Stop').length, man: trades.filter(t=>t.exit==='ปิดเอง').length,
    planYes: trades.filter(t=>t.j.plan==='ใช่').length, planNo: trades.filter(t=>t.j.plan==='ไม่').length };
}
const dates = () => Object.keys(S.days).filter(d => (S.days[d].fills||[]).length).sort();

// ---------- UI ----------
let toastT;
function toast(m){ let el = $('#toast'); if(!el){ el=document.createElement('div'); el.id='toast'; el.style.cssText='position:fixed;left:50%;bottom:96px;transform:translateX(-50%);background:var(--tx);color:var(--bg);padding:10px 16px;border-radius:12px;font-size:14px;z-index:20;max-width:90%'; document.body.appendChild(el);} el.textContent=m; el.classList.remove('hidden'); clearTimeout(toastT); toastT=setTimeout(()=>el.classList.add('hidden'),2600); }

const ICON = {
  home:'<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>', list:'<path d="M5 6h14M5 12h14M5 18h9"/>',
  imp:'<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', set:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'
};
function renderNav(){
  const tabs = [['home','หน้าหลัก'],['list','รายการเทรด'],['imp','นำเข้า'],['set','ตั้งค่า']];
  $('#nav').innerHTML = tabs.map(([k,l]) => `<button data-tab="${k}" class="${S.tab===k?'on':''}" aria-label="${l}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>${l}</button>`).join('');
}
function equitySvg(trades){
  const ex = [...trades].sort((a,b)=>toMin(a.xt)-toMin(b.xt));
  if(!ex.length) return '';
  const W=326,H=120, t0=9*60+30, t1=17*60; let cum=0; const pts0=[]; const vals=[0];
  ex.forEach(t=>{cum+=t.net; vals.push(cum);});
  const mx = Math.max(...vals,1), mn = Math.min(...vals,0), span = mx-mn||1;
  const X = m => Math.max(0,Math.min(W,(m-t0)/(t1-t0)*W)), Y = v => H-6-((v-mn)/span)*(H-14);
  let p = `${X(toMin(ex[0].et))},${Y(0)}`; cum=0; const dots=[];
  ex.forEach(t=>{ const x=X(toMin(t.xt)); p+=` ${x},${Y(cum)}`; cum+=t.net; p+=` ${x},${Y(cum)}`; dots.push(`<circle cx="${x}" cy="${Y(cum)}" r="3.5" fill="${t.net>=0?'var(--win)':'var(--loss)'}"/>`); });
  p += ` ${W},${Y(cum)}`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;margin-top:6px" role="img" aria-label="กำไรสะสมระหว่างวัน"><line x1="0" y1="${Y(0)}" x2="${W}" y2="${Y(0)}" stroke="var(--ln)"/><polyline fill="none" stroke="var(--win)" stroke-width="2.5" stroke-linejoin="round" points="${p}"/>${dots.join('')}</svg>
  <div class="row mono" style="font-size:11px;color:var(--mu)"><span>09:30</span><span>12:30</span><span>14:30</span><span>17:00</span></div>`;
}
function dailySvg(ds){
  if(ds.length<2) return '';
  const W=326,H=110; let cum=0; const v=[0]; ds.forEach(d=>{cum+=stats(matchDay(d).trades).net; v.push(cum);});
  const mx=Math.max(...v,1), mn=Math.min(...v,0), sp=mx-mn||1;
  const p = v.map((x,i)=>`${i/(v.length-1)*W},${H-6-((x-mn)/sp)*(H-14)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;margin-top:8px" role="img" aria-label="กำไรสะสมรายวัน"><polyline fill="none" stroke="var(--win)" stroke-width="2.5" points="${p}"/></svg>`;
}
function exitBar(s){
  const n = s.n||1;
  return `<div class="bar"><div style="width:${s.tgt/n*100}%;background:var(--win)"></div><div style="width:${s.stp/n*100}%;background:var(--loss)"></div><div style="width:${s.man/n*100}%;background:#6B7480"></div></div>
  <div class="legend"><span><i style="background:var(--win)"></i>Target ${s.tgt}</span><span><i style="background:var(--loss)"></i>Stop ${s.stp}</span><span><i style="background:#6B7480"></i>ปิดเอง ${s.man}</span></div>`;
}
function tradeCard(t, showDate){
  return `<button class="trade" data-trade="${esc(t.date)}|${esc(t.key)}">
    <div class="row"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="pill ${t.dir==='Long'?'pL':'pS'}">${t.dir==='Long'?'LONG':'SHORT'} ${t.qty}</span><span class="mono sub">${showDate?thDate(t.date)+' · ':''}${t.et.slice(0,5)} → ${t.xt.slice(0,5)}</span></div><span class="mono ${t.net>=0?'win':'loss'}" style="font-size:17px;font-weight:600">${baht(t.net)}</span></div>
    <div class="row" style="margin-top:6px"><span class="mono">${fmt(t.ep)} → ${fmt(t.xp)}</span><span class="mono sub">${pts(t.p)} แต้ม</span></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;align-items:center"><span class="tag">${t.exit}</span><span class="tag">ถือ ${dur(t.et,t.xt)}</span>${t.flip?'<span class="tag tagw">Stop เกินสถานะ</span>':''}${t.j.setup?`<span class="tag">${esc(t.j.setup)}</span>`:''}${t.j.plan?`<span class="tag">ตามแผน: ${esc(t.j.plan)}</span>`:''}${!t.j.setup&&!t.j.plan?'<span class="sub" style="font-size:11px;margin-left:auto">ยังไม่บันทึก</span>':''}</div>
  </button>`;
}

function viewHome(){
  const ds = dates();
  if(!ds.length) return `<h1>บันทึกเทรด TFEX</h1><div class="card empty">ยังไม่มีข้อมูล<br><br><button data-tab="imp" class="primary" style="max-width:260px">นำเข้ารายการแรก</button></div>`;
  const d = S.daySel && S.days[S.daySel] ? S.daySel : ds[ds.length-1];
  const M = matchDay(d), s = stats(M.trades);
  const all = ds.flatMap(x=>matchDay(x).trades), A = stats(all);
  const be = S.settings.stop/(S.settings.stop+S.settings.target);
  return `
  <div class="row"><div><div class="sub">${thDate(d)}</div><h1>สรุปวัน</h1></div>
  <label style="margin:0;min-width:150px"><span class="hidden">เลือกวัน</span><select id="daySel" aria-label="เลือกวัน">${ds.slice().reverse().map(x=>`<option value="${x}" ${x===d?'selected':''}>${thDate(x)}</option>`).join('')}</select></label></div>
  <div class="card">
    <div class="row"><span class="sub">กำไรสุทธิ</span><span class="sub">${S.settings.comm? 'หักค่าคอมแล้ว':'ยังไม่หักค่าคอม'}</span></div>
    <div class="big ${s.net>=0?'win':'loss'}">${baht(s.net)}</div>
    <div class="grid3" style="margin-top:8px"><div><div class="k">แต้มรวม</div><div class="v">${pts(s.pts)}</div></div><div><div class="k">ไม้ / สัญญา</div><div class="v">${s.n} / ${s.qty}</div></div><div><div class="k">ชนะ–แพ้</div><div class="v">${s.w}–${s.l}</div></div></div>
    ${equitySvg(M.trades)}
  </div>
  ${M.flips.map(f=>`<div class="warn"><b>Stop/คำสั่งเกินสถานะ</b><br>${f.time.slice(0,5)} ${f.side} ${f.qty} สัญญา ปิดได้ ${f.closed} แล้วเปิดสถานะใหม่ ${f.opened} สัญญา — ตั้งใจหรือไม่?</div>`).join('')}
  ${M.open.length?`<div class="warn"><b>สถานะค้าง</b><br>${M.open.map(o=>`${o.sgn===1?'Long':'Short'} ${o.q} @ ${fmt(o.px)}`).join(', ')} ยังไม่ถูกปิดในวันนี้ (หรือข้อมูลไม่ครบ)</div>`:''}
  <div class="grid2">
    <div class="card"><div class="k">Win rate</div><div class="v" style="font-size:24px">${Math.round(s.wr*100)}%</div>
      <div style="position:relative;margin-top:6px"><div class="bar"><div style="width:${s.wr*100}%;background:var(--win)"></div></div><div style="position:absolute;left:${be*100}%;top:-4px;width:2px;height:18px;background:var(--tx)"></div></div>
      <div class="k" style="margin-top:6px">ขีด = ${Math.round(be*100)}% จุดคุ้มทุนของ ${S.settings.stop}/${S.settings.target}</div></div>
    <div class="card"><div class="k">Expectancy / ไม้</div><div class="v" style="font-size:24px">${baht(s.exp)}</div><div class="k" style="margin-top:6px">ชนะเฉลี่ย ${baht(s.avgW)} · แพ้เฉลี่ย ${baht(s.avgL)}</div></div>
  </div>
  <div class="card"><div class="row" style="margin-bottom:10px"><h2>ออกตามกฎ Stop ${S.settings.stop} / Target ${S.settings.target}</h2><span class="sub">${s.n} ไม้</span></div>${exitBar(s)}</div>
  <div class="card"><div class="row"><h2>ภาพรวมทั้งหมด</h2><span class="sub">${ds.length} วัน</span></div>
    <div class="grid3" style="margin-top:10px"><div><div class="k">กำไรสุทธิ</div><div class="v ${A.net>=0?'win':'loss'}">${baht(A.net)}</div></div><div><div class="k">Win rate</div><div class="v">${Math.round(A.wr*100)}%</div></div><div><div class="k">ไม้</div><div class="v">${A.n}</div></div></div>
    <div class="grid3" style="margin-top:10px"><div><div class="k">Expectancy</div><div class="v">${baht(A.exp)}</div></div><div><div class="k">ถึง Target</div><div class="v">${A.tgt}</div></div><div><div class="k">ทำตามแผน</div><div class="v">${A.planYes}/${A.planYes+A.planNo||0}</div></div></div>
    ${dailySvg(ds)}
  </div>
  <div class="row" style="margin-top:18px"><h2>ไม้ของวันนี้</h2><button data-tab="list" style="border:none;background:none;color:var(--long)">ดูทั้งหมด</button></div>
  ${M.trades.slice().reverse().map(t=>tradeCard(t,false)).join('')}`;
}
function viewList(){
  const ds = dates().slice().reverse();
  const f = S.filter;
  let html = `<h1>รายการเทรด</h1><div class="chips" style="margin-top:12px">${[['all','ทั้งหมด'],['win','ชนะ'],['loss','แพ้'],['todo','ยังไม่บันทึก']].map(([k,l])=>`<button class="chip ${f===k?'on':''}" data-filter="${k}">${l}</button>`).join('')}</div>`;
  if(!ds.length) return html + `<div class="card empty">ยังไม่มีข้อมูล</div>`;
  ds.forEach(d => {
    const M = matchDay(d); const s = stats(M.trades);
    const tr = M.trades.filter(t => f==='all' || t.res===f || (f==='todo' && !t.j.setup && !t.j.plan)).reverse();
    if(!tr.length) return;
    html += `<div class="row" style="margin-top:20px"><h2>${thDate(d)}</h2><span class="mono sub">${pts(s.pts)} · <span class="${s.net>=0?'win':'loss'}">${baht(s.net)}</span></span></div>` + tr.map(t=>tradeCard(t,false)).join('');
  });
  return html;
}
function viewImport(){
  const I = S.imp;
  const imageImport = CFG.API_BASE ? `<div class="card" id="shotCard">
    <h2>จากภาพหน้าจอแอปโบรก</h2>
    <div class="msg" style="margin-top:4px">แคปหน้า "คำสั่งซื้อขาย" ได้หลายภาพ ภาพยาวจะถูกตัดเป็นช่วงให้อ่านได้ชัด${isPro()?'':` · ฟรี ${CFG.FREE_READS_PER_MONTH||5} ครั้ง/เดือน`}</div>
    <label for="shot" class="btn" style="display:flex;align-items:center;justify-content:center;margin-top:12px;background:var(--sf2);color:var(--tx);font-size:14px">เลือกภาพ</label>
    <input id="shot" type="file" accept="image/*" multiple class="hidden">
    <div class="msg" id="shotMsg">${esc(I.status)}</div>
  </div>` : `<div class="card warn"><b>Online Preview</b><div class="msg">ฟีเจอร์อ่านภาพและระบบสมาชิกยังไม่เปิดใช้งาน กรุณากด + เพิ่มแถว เพื่อบันทึกรายการด้วยตนเอง</div></div>`;
  const rows = I.rows.map((r,i)=>`<tr>
    <td><input aria-label="วันที่" type="date" value="${esc(r.date)}" data-i="${i}" data-k="date"></td>
    <td><input aria-label="เวลา" class="mono" value="${esc(r.time)}" data-i="${i}" data-k="time" style="width:84px"></td>
    <td><select aria-label="ฝั่ง" data-i="${i}" data-k="side"><option ${r.side==='Long'?'selected':''}>Long</option><option ${r.side==='Short'?'selected':''}>Short</option></select></td>
    <td><input aria-label="จำนวน" type="number" min="1" value="${esc(r.qty)}" data-i="${i}" data-k="qty" style="width:52px"></td>
    <td><input aria-label="ราคา" class="mono" inputmode="decimal" value="${esc(r.price)}" data-i="${i}" data-k="price" style="width:90px"></td>
    <td><button aria-label="ลบแถว" data-delrow="${i}" style="min-height:36px;padding:0 10px">✕</button></td></tr>`).join('');
  return `<h1>นำเข้ารายการซื้อขาย</h1><div class="sub">ใช้คำสั่งที่ Matched เท่านั้น ระบบจับคู่ไม้เข้า-ออกให้เอง</div>
  ${imageImport}
  <div class="card">
    <div class="row"><h2>ตรวจและแก้ก่อนบันทึก</h2><button id="addRow">+ เพิ่มแถว</button></div>
    ${I.rows.length?`<div class="tbl"><table><thead><tr><th>วันที่</th><th>เวลา</th><th>ฝั่ง</th><th>จำนวน</th><th>ราคา</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <button class="primary" id="commit" style="margin-top:14px">บันทึก ${I.rows.length} คำสั่ง</button>`:'<div class="msg">ยังไม่มีรายการ อัปโหลดภาพหรือกด + เพิ่มแถว</div>'}
  </div>`;
}
function viewSet(){
  const st = S.settings; const ds = dates(); const m = meta(); const pro = isPro();
  const f = (k,l,step) => `<div><label for="s_${k}">${l}</label><input id="s_${k}" data-set="${k}" type="number" step="${step}" value="${st[k]}" class="mono"></div>`;
  const left = m.remaining != null && m.remainingAt && new Date(m.remainingAt).getMonth()===new Date().getMonth() ? m.remaining : (CFG.FREE_READS_PER_MONTH||5);
  const packageCard = CFG.API_BASE ? `<div class="card"><div class="row"><h2>แพ็กเกจ</h2>${pro?'<span class="pro">PRO</span>':'<span class="tag">ฟรี</span>'}</div>
    ${pro? `<div class="msg">Pro ใช้ได้ถึง ${new Date(m.ent.exp*1000).toLocaleDateString('th-TH')} (ต่ออายุอัตโนมัติผ่าน Google Play)</div>`
         : `<div class="msg">อ่านภาพหน้าจอฟรีเหลือ ${left} ครั้งเดือนนี้ · ฟีเจอร์อื่นใช้ฟรีทั้งหมด</div>
            <div class="msg"><b>Pro</b>${S.proPrice?' '+esc(S.proPrice)+'/เดือน':''}: อ่านภาพหน้าจอได้ไม่จำกัด (ใช้งานปกติ) และสนับสนุนการพัฒนาแอป</div>
            <button class="primary" id="buyPro" style="margin-top:12px">อัปเกรดเป็น Pro</button>`}
    <button class="link" id="restorePro">กู้คืนการซื้อ</button>
    ${S.proMsg?`<div class="msg">${esc(S.proMsg)}</div>`:''}
  </div>` : `<div class="card"><div class="row"><h2>Online Preview</h2><span class="tag">LOCAL</span></div><div class="msg">บันทึก กรอกข้อมูล สรุปผล สำรองข้อมูล และส่งออก CSV ได้ ฟีเจอร์อ่านภาพและระบบสมาชิกยังไม่เปิดใช้งาน</div></div>`;
  return `<h1>ตั้งค่า</h1>
  ${packageCard}
  <div class="card"><div class="grid2">${f('mult','ตัวคูณ (บาท/จุด)',1)}${f('comm','ค่าคอม (บาท/สัญญา/ขา)',0.01)}${f('stop','Stop (จุด)',0.1)}${f('target','Target (จุด)',0.1)}${f('tol','ค่าเผื่อจัดประเภท (จุด)',0.1)}</div></div>
  <div class="card"><label for="s_setups">ตัวเลือก Setup (คั่นด้วย ,)</label><input id="s_setups" data-set="setups" value="${esc(st.setups)}">
  <label for="s_moods" style="margin-top:10px">ตัวเลือกอารมณ์ (คั่นด้วย ,)</label><input id="s_moods" data-set="moods" value="${esc(st.moods)}"></div>
  <div class="card"><h2>ข้อมูลของคุณ</h2><div class="msg">เก็บไว้ในเครื่องนี้เท่านั้น ${ds.length} วัน · ${m.lastBackup?'สำรองล่าสุด '+new Date(m.lastBackup).toLocaleDateString('th-TH'):'ยังไม่เคยสำรอง'}</div>
  <div class="grid2" style="margin-top:12px"><button id="backup">สำรองข้อมูล</button><label for="restoreFile" class="btn" style="display:flex;align-items:center;justify-content:center;margin:0;color:var(--tx);font-size:14px">กู้คืน</label></div>
  <input id="restoreFile" type="file" accept="application/json,.json" class="hidden">
  <button id="export" style="width:100%;margin-top:12px">ส่งออก CSV (เปิดใน Excel)</button>
  ${ds.length?`<label for="delSel" style="margin-top:14px">ลบข้อมูลวัน</label><div class="row"><select id="delSel">${ds.map(d=>`<option value="${d}">${thDate(d)}</option>`).join('')}</select><button id="delDay" style="color:var(--loss)">ลบ</button></div>`:''}
  </div>
  <div class="foot">${esc(CFG.APP_NAME||'')} ใช้บันทึกและวิเคราะห์การเทรดของคุณเอง ไม่ใช่คำแนะนำการลงทุน<br>
  <a href="privacy.html">นโยบายความเป็นส่วนตัว</a> · <a href="terms.html">ข้อกำหนดการใช้งาน</a>${CFG.SUPPORT_EMAIL?` · <a href="mailto:${esc(CFG.SUPPORT_EMAIL)}">ติดต่อ</a>`:''}</div>`;
}
function viewWelcome(){
  return `<div style="padding-top:8vh"><img src="icons/icon-192.png" alt="" width="72" height="72" style="border-radius:18px">
  <h1 style="font-size:28px;margin-top:16px">${esc(CFG.APP_NAME||'ไม้ต่อไม้')}</h1><div class="sub" style="font-size:15px">บันทึกเทรด ทบทวนทีละไม้ ฝึกวินัยตามแผน</div>
  <div class="card"><div style="display:flex;flex-direction:column;gap:10px;font-size:14px">
    <div>${CFG.API_BASE?'แคปหน้าคำสั่งซื้อขายจากแอปโบรก แล้วให้แอปอ่านให้':'กรอกรายการซื้อขายด้วยตนเอง และเก็บบันทึกไว้ในอุปกรณ์'}</div>
    <div>จับคู่ไม้เข้า–ออก คิดแต้มและกำไรสุทธิอัตโนมัติ</div>
    <div>วัดว่าออกตาม Stop/Target จริงไหม และเตือนคำสั่งที่เกินสถานะ</div>
    <div>ข้อมูลเก็บในเครื่องคุณเท่านั้น</div></div></div>
  <div class="msg" style="line-height:1.7">แอปนี้เป็นเครื่องมือบันทึกและวิเคราะห์การเทรดของคุณเอง ไม่ให้สัญญาณซื้อขายหรือคำแนะนำการลงทุน การลงทุนในสัญญาซื้อขายล่วงหน้ามีความเสี่ยงสูง
  การกด "เริ่มใช้งาน" ถือว่ายอมรับ <a href="terms.html">ข้อกำหนดการใช้งาน</a> และ <a href="privacy.html">นโยบายความเป็นส่วนตัว</a></div>
  <button class="primary" id="start" style="margin-top:16px">เริ่มใช้งาน</button></div>`;
}
function viewModal(){
  const [d,key] = S.modal; const t = matchDay(d).trades.find(x=>x.key===key); if(!t) return '';
  const st = S.settings; const j = t.j;
  const sl = t.dir==='Long'? t.ep-st.stop : t.ep+st.stop, tp = t.dir==='Long'? t.ep+st.target : t.ep-st.target;
  const pos = Math.max(0,Math.min(100,(t.p+st.stop)/(st.stop+st.target)*100)), ent = st.stop/(st.stop+st.target)*100;
  const chips = (k, list) => `<div class="chips">${list.split(',').map(x=>x.trim()).filter(Boolean).map(x=>`<button class="chip ${j[k]===x?'on':''}" data-j="${k}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
  return `<div class="modal" id="modalBg"><div class="sheet" role="dialog" aria-label="รายละเอียดไม้">
   <div class="row"><h2>${thDate(d)} · ${t.et.slice(0,5)}</h2><button id="closeM" aria-label="ปิด">ปิด</button></div>
   <div class="card"><div class="row"><span class="pill ${t.dir==='Long'?'pL':'pS'}">${t.dir.toUpperCase()} ${t.qty} สัญญา</span><span class="mono sub">${esc(t.sym)}</span></div>
     <div class="row" style="align-items:flex-end;margin-top:8px"><span class="big ${t.net>=0?'win':'loss'}" style="font-size:32px">${baht(t.net)}</span><span class="mono" style="color:var(--mu2)">${pts(t.p)} แต้ม</span></div>
     <div class="grid3" style="margin-top:8px"><div><div class="k">เข้า ${t.et.slice(0,5)}</div><div class="v">${fmt(t.ep)}</div></div><div><div class="k">ออก ${t.xt.slice(0,5)}</div><div class="v">${fmt(t.xp)}</div></div><div><div class="k">ถือ</div><div class="v">${dur(t.et,t.xt)}</div></div></div></div>
   <div class="card"><h2>เทียบกับแผน ${st.stop}/${st.target}</h2>
     <div class="planbar"><div style="position:absolute;left:0;right:0;top:22px;height:10px;border-radius:5px;background:var(--ln)"></div>
     <div style="position:absolute;left:${ent}%;top:16px;width:2px;height:22px;background:var(--tx)"></div>
     <div style="position:absolute;left:${pos}%;top:12px;width:14px;height:14px;margin-left:-7px;border-radius:7px;background:${t.net>=0?'var(--win)':'var(--loss)'};border:3px solid var(--sf)"></div>
     <div class="mono" style="position:absolute;left:0;top:38px;font-size:11px;color:var(--short)">SL ${fmt(sl)}</div><div class="mono" style="position:absolute;right:0;top:38px;font-size:11px;color:var(--win)">TP ${fmt(tp)}</div></div>
     <div class="msg">ออกแบบ: ${t.exit}${t.flip?' · คำสั่งนี้เกินสถานะ':''}</div></div>
   <div style="margin-top:16px"><h2 style="margin-bottom:8px">Setup</h2>${chips('setup',st.setups)}</div>
   <div style="margin-top:14px"><h2 style="margin-bottom:8px">อารมณ์ตอนเทรด</h2>${chips('mood',st.moods)}</div>
   <div style="margin-top:14px"><h2 style="margin-bottom:8px">ทำตามแผนไหม</h2>${chips('plan','ใช่,ไม่')}</div>
   <div style="margin-top:14px"><label for="note">โน้ต</label><textarea id="note" rows="3" placeholder="ทำไมเข้า/ออกตรงนี้?">${esc(j.note||'')}</textarea></div>
   <button class="primary" id="saveJ" style="margin-top:16px">บันทึก</button>
  </div></div>`;
}
function render(){
  if(!meta().accepted){ $('#nav').innerHTML=''; $('#app').innerHTML = viewWelcome(); return; }
  renderNav();
  const v = {home:viewHome, list:viewList, imp:viewImport, set:viewSet}[S.tab]();
  $('#app').innerHTML = v + (S.modal? viewModal() : '');
}

// ---------- import screenshots via our API ----------
const MAX_IMAGES = 8;
async function toJpegB64(canvas){
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
  const buf = new Uint8Array(await blob.arrayBuffer()); let bin = '';
  for(let i=0;i<buf.length;i+=0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i+0x8000));
  return btoa(bin);
}
async function sliceImage(file){
  const img = await createImageBitmap(file);
  const w = img.width, h = img.height, out = [];
  const segH = h/w > 2.6 ? Math.round(w*2.2) : h, step = Math.round(segH*0.85);
  for(let y=0; y<h && out.length<MAX_IMAGES; y+=step){
    const hh = Math.min(segH, h-y), sc = Math.min(1, 1568/Math.max(w, hh));
    const c = document.createElement('canvas'); c.width = Math.round(w*sc); c.height = Math.round(hh*sc);
    c.getContext('2d').drawImage(img, 0, y, w, hh, 0, 0, c.width, c.height);
    out.push({media_type:'image/jpeg', data: await toJpegB64(c)});
    if(y+hh>=h) break;
  }
  return out;
}
async function readShots(files){
  const I = S.imp; const msg = t => { I.status=t; const el=$('#shotMsg'); if(el) el.textContent=t; };
  if(!navigator.onLine){ msg('ต้องต่ออินเทอร์เน็ตเพื่ออ่านภาพ หรือกด + เพิ่มแถวกรอกเอง'); return; }
  let images = [];
  try{ for(const f of files){ images = images.concat(await sliceImage(f)); } }catch(e){ msg('เปิดภาพไม่ได้ ลองภาพอื่น'); return; }
  images = images.slice(0, MAX_IMAGES);
  I.busy = true; msg('กำลังอ่านภาพ… (ประมาณ 10–40 วินาที)');
  try{
    const m = meta();
    const res = await api('/api/read', {deviceId: deviceId(), entitlement: m.ent ? m.ent.token : null, images});
    const seen = new Set(I.rows.map(r=>String(r.orderId)));
    const got = (Array.isArray(res.fills)? res.fills : []).filter(f => f && !seen.has(String(f.orderId)) && seen.add(String(f.orderId)));
    got.forEach(f => I.rows.push({date:String(f.date||''), time:String(f.time||''), symbol:String(f.symbol||'S50'), side: f.side==='Short'?'Short':'Long', qty:Number(f.qty)||1, price:Number(f.price)||0, orderId:String(f.orderId||('m'+Date.now()+Math.random()))}));
    if(res.remaining != null) setMeta({remaining: res.remaining, remainingAt: Date.now()});
    I.status = `อ่านได้ ${got.length} คำสั่งที่จับคู่แล้ว${res.skipped!=null?` · ข้าม ${res.skipped} คำสั่งที่ไม่ได้จับคู่`:''} — ตรวจตัวเลขก่อนบันทึก`;
  }catch(e){
    const m = {quota:'ใช้สิทธิ์อ่านภาพฟรีเดือนนี้ครบแล้ว อัปเกรดเป็น Pro หรือกรอกเอง', too_large:'ภาพใหญ่เกินไป ลองแบ่งเป็นหลายภาพ', unreadable:'อ่านภาพนี้ไม่ได้ ลองแคปให้ชัดขึ้น'};
    I.status = m[e.code] || 'อ่านภาพไม่สำเร็จ ลองใหม่อีกครั้ง';
    if(e.code==='quota') setMeta({remaining:0, remainingAt: Date.now()});
  }
  I.busy = false; render();
}
async function commit(){
  const I = S.imp; const bad = I.rows.find(r => !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !/^\d{1,2}:\d{2}(:\d{2})?$/.test(r.time) || !(r.qty>0) || !(r.price>0));
  if(bad){ toast('มีแถวที่วันที่/เวลา/จำนวน/ราคาไม่ครบ'); return; }
  const touched = new Set(); let added = 0;
  I.rows.forEach(r => {
    const time = r.time.length===5? r.time+':00' : r.time.padStart(8,'0');
    const day = S.days[r.date] = S.days[r.date] || {date:r.date, fills:[], journal:{}};
    if(day.fills.some(f=>String(f.orderId)===String(r.orderId))) return;
    day.fills.push({time, symbol:r.symbol||'S50', side:r.side, qty:Number(r.qty), price:Number(r.price), orderId:String(r.orderId)}); touched.add(r.date); added++;
  });
  for(const d of touched) await saveDay(d);
  I.rows = []; I.status = '';
  toast(added? `บันทึก ${added} คำสั่งแล้ว` : 'คำสั่งทั้งหมดมีอยู่แล้ว');
  if(touched.size) S.daySel = [...touched].sort().pop();
  S.tab = 'home'; render();
}
function saveFile(name, data, type){
  const url = URL.createObjectURL(new Blob([data], {type}));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
}
function exportCsv(){
  const head = ['date','symbol','direction','qty','entry_time','entry_price','exit_time','exit_price','points','gross_thb','fee_thb','net_thb','result','exit_type','setup','mood','followed_plan','note'];
  const lines = [head.join(',')];
  dates().forEach(d => matchDay(d).trades.forEach(t => lines.push([d,t.sym,t.dir,t.qty,t.et,t.ep,t.xt,t.xp,t.p,t.gross,t.fee,t.net,t.res,t.exit,t.j.setup||'',t.j.mood||'',t.j.plan||'',(t.j.note||'').replace(/[\r\n]+/g,' ')].map(x=>{const s=String(x);return /[",]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(','))));
  saveFile('maitormai-trades.csv', '\ufeff'+lines.join('\n'), 'text/csv;charset=utf-8');
}
function backup(){ saveFile('maitormai-backup-'+new Date().toISOString().slice(0,10)+'.json', JSON.stringify({app:'maitormai', v:1, days:S.days, settings:S.settings}), 'application/json'); setMeta({lastBackup: Date.now()}); }
async function restore(file){
  try{
    const j = JSON.parse(await file.text());
    if(!j || j.app!=='maitormai' || typeof j.days!=='object') throw 0;
    if(!confirm('กู้คืนจะรวมข้อมูลจากไฟล์เข้ากับข้อมูลปัจจุบัน ดำเนินการต่อ?')) return;
    for(const [d,v] of Object.entries(j.days)){
      const cur = S.days[d] = S.days[d] || {date:d, fills:[], journal:{}};
      (v.fills||[]).forEach(f => { if(!cur.fills.some(x=>String(x.orderId)===String(f.orderId))) cur.fills.push(f); });
      cur.journal = {...(v.journal||{}), ...(cur.journal||{})};
    }
    if(j.settings) S.settings = {...DEF_SET, ...j.settings, ...S.settings};
    lsSave(); toast('กู้คืนข้อมูลแล้ว'); render();
  }catch(e){ toast('ไฟล์นี้ไม่ใช่ไฟล์สำรองของแอป'); }
}

// ---------- events ----------
document.addEventListener('click', e => {
  const b = e.target.closest('button,[data-tab]'); if(!b) { if(e.target.id==='modalBg'){ S.modal=null; render(); } return; }
  if(b.dataset.tab){ S.tab=b.dataset.tab; S.modal=null; render(); window.scrollTo(0,0); return; }
  if(b.dataset.filter){ S.filter=b.dataset.filter; render(); return; }
  if(b.dataset.trade){ const i=b.dataset.trade.indexOf('|'); S.modal=[b.dataset.trade.slice(0,i), b.dataset.trade.slice(i+1)]; S.draft={}; render(); return; }
  if(b.id==='closeM'){ S.modal=null; render(); return; }
  if(b.dataset.j){ const k=b.dataset.j, v=b.dataset.v; b.parentElement.querySelectorAll('button').forEach(x=>x.classList.toggle('on', x===b && !x.classList.contains('on'))); S.draft=S.draft||{}; S.draft[k]= b.classList.contains('on')? v : ''; return; }
  if(b.id==='saveJ'){ const [d,key]=S.modal; const day=S.days[d]; day.journal=day.journal||{}; const cur=day.journal[key]||{};
    const nx={...cur,...(S.draft||{}), note: $('#note').value}; Object.keys(nx).forEach(k=>{ if(nx[k]==='') delete nx[k]; }); day.journal[key]=nx; saveDay(d); S.modal=null; toast('บันทึกแล้ว'); render(); return; }
  if(b.id==='addRow'){ const ds=dates(); const last = S.imp.rows[S.imp.rows.length-1]; S.imp.rows.push({date: last?last.date: new Date().toISOString().slice(0,10), time:'', symbol: last?last.symbol:'S50', side:'Long', qty:1, price:'', orderId:'m'+Date.now()}); render(); return; }
  if(b.dataset.delrow){ S.imp.rows.splice(Number(b.dataset.delrow),1); render(); return; }
  if(b.id==='commit'){ commit(); return; }
  if(b.id==='export'){ exportCsv(); return; }
  if(b.id==='backup'){ backup(); return; }
  if(b.id==='buyPro'){ buyPro(); return; }
  if(b.id==='restorePro'){ restorePro(); return; }
  if(b.id==='start'){ setMeta({accepted: Date.now()}); deviceId(); render(); return; }
  if(b.id==='delDay'){ const d=$('#delSel').value; if(confirm('ลบข้อมูลวันที่ '+thDate(d)+' ทั้งหมด?')){ delDay(d).then(()=>{ toast('ลบแล้ว'); render(); }); } return; }
});
document.addEventListener('change', e => {
  const t = e.target;
  if(t.id==='daySel'){ S.daySel=t.value; render(); return; }
  if(t.id==='restoreFile' && t.files && t.files[0]){ restore(t.files[0]); t.value=''; return; }
  if(t.id==='shot' && t.files && t.files.length){ readShots([...t.files]); t.value=''; return; }
  if(t.dataset.k){ const r=S.imp.rows[Number(t.dataset.i)]; r[t.dataset.k] = (t.dataset.k==='qty'||t.dataset.k==='price')? Number(t.value) : t.value; return; }
  if(t.dataset.set){ const k=t.dataset.set; S.settings[k] = (k==='setups'||k==='moods')? t.value : Number(t.value); saveSettings(); return; }
});

lsLoad(); render(); loadPrice();
})();
