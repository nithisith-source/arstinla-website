(function(){
  "use strict";

  const LINE_ID="@arstinla";
  const LINE_ID_ENCODED="%40arstinla";
  const STORAGE_KEY="arstinla-download-actions";
  let activeRequest=null;
  let previousFocus=null;

  const styles=`
    .arstinla-download-gate[hidden]{display:none!important}
    .arstinla-download-gate{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:20px;background:rgba(10,11,9,.78);backdrop-filter:blur(8px);font-family:"Noto Sans Thai","Instrument Sans",system-ui,sans-serif;color:#171816}
    .arstinla-download-card{position:relative;width:min(560px,100%);max-height:min(760px,calc(100svh - 40px));overflow:auto;background:#f2efe8;border:1px solid #c9c4b9;padding:clamp(25px,5vw,46px);box-shadow:0 28px 90px rgba(0,0,0,.38)}
    .arstinla-download-close{position:absolute;right:14px;top:12px;width:38px;height:38px;border:0;background:transparent;color:#77786f;font:300 26px/1 sans-serif;cursor:pointer}
    .arstinla-download-close:hover{color:#171816}
    .arstinla-download-kicker{margin:0;color:#c47a55;font:600 10px/1.2 "Instrument Sans",sans-serif;letter-spacing:.2em;text-transform:uppercase}
    .arstinla-download-card h2{margin:16px 0 10px;font:400 clamp(34px,7vw,56px)/.98 "Instrument Serif",Georgia,serif;letter-spacing:-.035em}
    .arstinla-download-copy{margin:0;color:#696a63;font-size:13px;line-height:1.75}
    .arstinla-download-actions{display:grid;gap:9px;margin-top:24px}
    .arstinla-download-action,.arstinla-download-final{display:flex;align-items:center;justify-content:center;min-height:50px;padding:12px 18px;border:1px solid #171816;text-decoration:none;text-align:center;font:600 11px/1.4 "Instrument Sans","Noto Sans Thai",sans-serif;letter-spacing:.09em;text-transform:uppercase;cursor:pointer}
    .arstinla-download-message{background:#171816;color:#fff}
    .arstinla-download-share{background:transparent;color:#171816}
    .arstinla-download-action:hover,.arstinla-download-action:focus-visible{background:#c47a55;border-color:#c47a55;color:#fff;outline:0}
    .arstinla-download-ready{margin-top:21px;padding-top:20px;border-top:1px solid #c9c4b9}
    .arstinla-download-ready[hidden]{display:none}
    .arstinla-download-ready p{margin:0 0 12px;color:#5f6059;font-size:12px;line-height:1.6}
    .arstinla-download-final{width:100%;background:#c47a55;border-color:#c47a55;color:#fff}
    .arstinla-download-final:hover,.arstinla-download-final:focus-visible{background:#a85f3d;border-color:#a85f3d;outline:0}
    .arstinla-download-note{display:block;margin-top:16px;color:#85867f;font-size:10px;line-height:1.65}
    @media(max-width:560px){.arstinla-download-card{padding:28px 22px}.arstinla-download-card h2{font-size:40px}}
    @media(prefers-reduced-motion:reduce){.arstinla-download-gate{backdrop-filter:none}}
  `;

  function pageUrl(){
    const url=new URL(location.href);
    url.hash="";
    return url.href;
  }

  function recordAction(action){
    try{
      const current=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");
      current[action]=(Number(current[action])||0)+1;
      current.lastAction=action;
      current.lastAt=new Date().toISOString();
      localStorage.setItem(STORAGE_KEY,JSON.stringify(current));
    }catch{}
    window.dispatchEvent(new CustomEvent("arstinla:download-action",{detail:{action,path:location.pathname}}));
  }

  function ensureGate(){
    let gate=document.querySelector(".arstinla-download-gate");
    if(gate)return gate;
    const style=document.createElement("style");
    style.textContent=styles;
    document.head.appendChild(style);
    gate=document.createElement("div");
    gate.className="arstinla-download-gate";
    gate.hidden=true;
    gate.innerHTML=`
      <section class="arstinla-download-card" role="dialog" aria-modal="true" aria-labelledby="arstinlaDownloadTitle" aria-describedby="arstinlaDownloadCopy">
        <button class="arstinla-download-close" type="button" aria-label="ปิด">×</button>
        <p class="arstinla-download-kicker">ARSTINLA / DOWNLOAD</p>
        <h2 id="arstinlaDownloadTitle">Share before download.</h2>
        <p class="arstinla-download-copy" id="arstinlaDownloadCopy">เลือก 1 วิธีเพื่อสนับสนุนเครื่องมือฟรีของ ARSTINLA แล้วกลับมารับไฟล์ได้ทันที</p>
        <div class="arstinla-download-actions">
          <a class="arstinla-download-action arstinla-download-message" data-line-message target="_blank" rel="noopener">ส่งผลลัพธ์ให้ ARSTINLA ทาง LINE</a>
          <a class="arstinla-download-action arstinla-download-share" data-line-share target="_blank" rel="noopener">แชร์ให้เพื่อนใน LINE</a>
        </div>
        <div class="arstinla-download-ready" data-download-ready hidden>
          <p>พร้อมแล้วค่ะ กลับมาที่หน้านี้และกดปุ่มด้านล่างเพื่อรับไฟล์</p>
          <button class="arstinla-download-final" data-download-final type="button">ดาวน์โหลดไฟล์</button>
        </div>
        <small class="arstinla-download-note">LINE จะเปิดในหน้าต่างใหม่ ระบบจะไม่ส่งข้อความแทนคุณ และจะไม่อัปโหลดไฟล์ส่วนตัวของคุณ</small>
      </section>`;
    document.body.appendChild(gate);

    const close=()=>finish(false);
    gate.querySelector(".arstinla-download-close").addEventListener("click",close);
    gate.addEventListener("click",event=>{if(event.target===gate)close()});
    gate.querySelectorAll("[data-line-message],[data-line-share]").forEach(link=>link.addEventListener("click",event=>{
      const action=event.currentTarget.hasAttribute("data-line-message")?"line_message":"line_share";
      recordAction(action);
      gate.querySelector("[data-download-ready]").hidden=false;
      gate.querySelector("[data-download-final]").focus({preventScroll:true});
    }));
    gate.querySelector("[data-download-final]").addEventListener("click",()=>finish(true));
    document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!gate.hidden)finish(false)});
    return gate;
  }

  function finish(allowed){
    if(!activeRequest)return;
    const request=activeRequest;
    activeRequest=null;
    request.gate.hidden=true;
    document.documentElement.style.overflow=request.previousOverflow;
    if(previousFocus&&document.contains(previousFocus))previousFocus.focus({preventScroll:true});
    previousFocus=null;
    if(allowed)recordAction("download_unlocked");
    request.resolve(allowed);
  }

  function request(options={}){
    const gate=ensureGate();
    if(activeRequest)return Promise.resolve(false);
    const tool=String(options.tool||document.title||"ARSTINLA Tool");
    const file=String(options.file||"ไฟล์จาก ARSTINLA");
    const shareText=String(options.shareText||`ลองใช้ ${tool} จาก ARSTINLA Design & Consult\n${pageUrl()}`);
    const messageText=String(options.messageText||`สวัสดีครับ สนใจไฟล์ ${file} จาก ${tool}\n${pageUrl()}`);
    gate.querySelector("[data-line-message]").href=`https://line.me/R/oaMessage/${LINE_ID_ENCODED}/?${encodeURIComponent(messageText)}`;
    gate.querySelector("[data-line-share]").href=`https://line.me/R/share?text=${encodeURIComponent(shareText)}`;
    gate.querySelector("[data-download-ready]").hidden=true;
    gate.querySelector("[data-download-final]").textContent=String(options.buttonLabel||"ดาวน์โหลดไฟล์");
    previousFocus=document.activeElement;
    const previousOverflow=document.documentElement.style.overflow;
    gate.hidden=false;
    document.documentElement.style.overflow="hidden";
    gate.querySelector("[data-line-message]").focus({preventScroll:true});
    return new Promise(resolve=>{activeRequest={resolve,gate,previousOverflow}});
  }

  window.ARSTINLA_DOWNLOAD_GATE={request,lineId:LINE_ID};
})();
