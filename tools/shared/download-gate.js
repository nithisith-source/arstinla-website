(function(){
  "use strict";

  const LINE_ID="@arstinla";
  const LINE_ID_ENCODED="%40arstinla";
  const STORAGE_KEY="arstinla-download-actions";
  let activeRequest=null;
  let previousFocus=null;

  const styles=`
    .arstinla-download-gate[hidden]{display:none!important}
    .arstinla-download-gate{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:20px;background:rgba(10,11,9,.78);backdrop-filter:blur(8px);font-family:"IBM Plex Sans Thai","Noto Sans Thai",system-ui,sans-serif;color:#171816}
    .arstinla-download-card{position:relative;width:min(560px,100%);max-height:min(760px,calc(100svh - 40px));overflow:auto;background:#f2efe8;border:1px solid #c9c4b9;padding:clamp(25px,5vw,46px);box-shadow:0 28px 90px rgba(0,0,0,.38)}
    .arstinla-download-close{position:absolute;right:14px;top:12px;width:38px;height:38px;border:0;background:transparent;color:#77786f;font:300 26px/1 sans-serif;cursor:pointer}
    .arstinla-download-close:hover{color:#171816}
    .arstinla-download-kicker{margin:0;color:#c47a55;font:600 10px/1.2 "Space Grotesk","Instrument Sans",sans-serif;letter-spacing:.2em;text-transform:uppercase}
    .arstinla-download-card h2{margin:16px 0 10px;font:400 clamp(30px,6vw,48px)/1.05 "Space Grotesk","IBM Plex Sans Thai",sans-serif;letter-spacing:-.035em}
    .arstinla-download-copy{margin:0;color:#696a63;font-size:13px;line-height:1.75}
    .arstinla-download-actions{display:grid;gap:9px;margin-top:24px}
    .arstinla-download-action,.arstinla-download-final{display:flex;align-items:center;justify-content:center;min-height:50px;padding:12px 18px;border:1px solid #171816;text-decoration:none;text-align:center;font:600 11px/1.4 "Space Grotesk","IBM Plex Sans Thai","Noto Sans Thai",sans-serif;letter-spacing:.09em;text-transform:uppercase;cursor:pointer}
    .arstinla-download-action[hidden]{display:none!important}
    .arstinla-download-message{background:#171816;color:#fff}
    .arstinla-download-share{background:transparent;color:#171816}
    .arstinla-download-action:hover,.arstinla-download-action:focus-visible{background:#c47a55;border-color:#c47a55;color:#fff;outline:0}
    .arstinla-download-status{margin:11px 0 0;color:#5f6059;font-size:11px;line-height:1.65}
    .arstinla-download-status[hidden]{display:none}
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
        <p class="arstinla-download-status" data-line-status hidden></p>
        <div class="arstinla-download-ready" data-download-ready hidden>
          <p>พร้อมแล้วค่ะ กลับมาที่หน้านี้และกดปุ่มด้านล่างเพื่อรับไฟล์</p>
          <button class="arstinla-download-final" data-download-final type="button">ดาวน์โหลดไฟล์</button>
        </div>
        <small class="arstinla-download-note">มือถือจะเปิดแอป LINE ส่วนคอมพิวเตอร์จะเปิดโปรไฟล์หรือ QR พร้อมคัดลอกข้อความให้ ระบบจะไม่กดส่งข้อความแทนคุณ</small>
      </section>`;
    document.body.appendChild(gate);

    const close=()=>finish(false);
    gate.querySelector(".arstinla-download-close").addEventListener("click",close);
    gate.addEventListener("click",event=>{if(event.target===gate)close()});
    gate.querySelectorAll("[data-line-message],[data-line-share]").forEach(link=>link.addEventListener("click",async event=>{
      const action=event.currentTarget.dataset.action||(event.currentTarget.hasAttribute("data-line-message")?"line_message":"line_share");
      const status=gate.querySelector("[data-line-status]");
      if(action==="line_message" && event.currentTarget.dataset.desktop==="true"){
        const copied=await copyText(event.currentTarget.dataset.messageText||"");
        status.textContent=copied
          ? "คัดลอกข้อความแล้วค่ะ สแกน QR เพื่อเปิด LINE @arstinla แล้ววางข้อความได้เลย"
          : "สแกน QR เพื่อเปิด LINE @arstinla แล้วส่งข้อความจากหน้าต่างนี้ได้เลย";
        status.hidden=false;
      }
      recordAction(action);
      if(event.currentTarget.dataset.unlocks==="false"){
        status.textContent=event.currentTarget.dataset.afterText||"ขอบคุณที่ช่วยบอกต่อค่ะ กรุณาเลือกวิธีหลักเพื่อปลดล็อกไฟล์ดาวน์โหลด";
        status.hidden=false;
        return;
      }
      gate.querySelector("[data-download-ready]").hidden=false;
      gate.querySelector("[data-download-final]").focus({preventScroll:true});
    }));
    gate.querySelector("[data-download-final]").addEventListener("click",()=>finish(true));
    document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!gate.hidden)finish(false)});
    return gate;
  }

  async function copyText(text){
    if(!text)return false;
    try{
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true;}
    }catch{}
    try{
      const field=document.createElement("textarea");
      field.value=text;
      field.setAttribute("readonly","");
      field.style.position="fixed";
      field.style.opacity="0";
      document.body.appendChild(field);
      field.select();
      const copied=document.execCommand("copy");
      field.remove();
      return copied;
    }catch{return false;}
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
    const primaryMode=options.primaryMode==="add_friend"?"add_friend":"message";
    const isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const messageLink=gate.querySelector("[data-line-message]");
    const shareLink=gate.querySelector("[data-line-share]");
    gate.querySelector("#arstinlaDownloadTitle").textContent=String(options.title||"Share before download.");
    gate.querySelector("#arstinlaDownloadCopy").textContent=String(options.copy||"เลือก 1 วิธีเพื่อสนับสนุนเครื่องมือฟรีของ ARSTINLA แล้วกลับมารับไฟล์ได้ทันที");
    gate.querySelector(".arstinla-download-note").textContent=String(options.note||"มือถือจะเปิดแอป LINE ส่วนคอมพิวเตอร์จะเปิดโปรไฟล์หรือ QR พร้อมคัดลอกข้อความให้ ระบบจะไม่กดส่งข้อความแทนคุณ");
    messageLink.hidden=Boolean(options.hideMessage);
    messageLink.textContent=String(options.messageLabel||"ส่งผลลัพธ์ให้ ARSTINLA ทาง LINE");
    shareLink.textContent=String(options.shareLabel||"แชร์ให้เพื่อนใน LINE");
    messageLink.href=primaryMode==="add_friend"
      ? `https://line.me/R/ti/p/${LINE_ID_ENCODED}`
      : isMobile
        ? `https://line.me/R/oaMessage/${LINE_ID_ENCODED}/?${encodeURIComponent(messageText)}`
        : `https://line.me/R/ti/p/${LINE_ID_ENCODED}`;
    messageLink.dataset.action=primaryMode==="add_friend"?"line_add_friend":"line_message";
    messageLink.dataset.unlocks=String(options.primaryUnlocks!==false);
    messageLink.dataset.desktop=String(!isMobile);
    messageLink.dataset.messageText=messageText;
    shareLink.href=`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(pageUrl())}&text=${encodeURIComponent(shareText)}`;
    shareLink.dataset.action="line_share";
    shareLink.dataset.unlocks=String(options.shareUnlocks!==false);
    shareLink.dataset.afterText=String(options.sharePendingText||"ขอบคุณที่ช่วยแชร์ค่ะ กรุณาเลือกวิธีหลักเพื่อปลดล็อกไฟล์ดาวน์โหลด");
    gate.querySelector("[data-line-status]").hidden=true;
    gate.querySelector("[data-download-ready]").hidden=true;
    gate.querySelector("[data-download-final]").textContent=String(options.buttonLabel||"ดาวน์โหลดไฟล์");
    previousFocus=document.activeElement;
    const previousOverflow=document.documentElement.style.overflow;
    gate.hidden=false;
    document.documentElement.style.overflow="hidden";
    (messageLink.hidden?shareLink:messageLink).focus({preventScroll:true});
    return new Promise(resolve=>{activeRequest={resolve,gate,previousOverflow}});
  }

  window.ARSTINLA_DOWNLOAD_GATE={request,lineId:LINE_ID};
})();
