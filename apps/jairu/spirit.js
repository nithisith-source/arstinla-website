/* ใจรู้ — ดวงจิต: สัตว์เลี้ยงที่โตจากคำตอบ และกลายร่างเป็นสัตว์ประจำตัวในวันที่ 30
   ใช้ตัวแปร S, DAYS, esc, go, save, member จากสคริปต์หลัก (เรียกตอนใช้งานเท่านั้น) */
"use strict";

/* ---------- สัตว์ประจำตัว 8 แบบ ---------- */
const ANIMALS = {
  elephant:{species:'คชาจันทร์', name:'ช้าง', title:'ผู้พิทักษ์', hue:212,
    essence:'คุณมีหัวใจของคนที่ดูแลคนรอบตัว ความผูกพัน ความรับผิดชอบ และความมั่นคงคือสิ่งที่คุณยึดไว้ คนรอบข้างรู้สึกปลอดภัยเมื่อมีคุณอยู่',
    strengths:['ความจำดี ไม่ลืมคนที่สำคัญ','อดทนและหนักแน่น','ทำให้คนรอบตัวรู้สึกปลอดภัย'],
    growth:'ช้างที่แข็งแรงต้องกินอิ่มก่อนจะแบกใคร ลองดูแลความต้องการของตัวเองให้ทันกับที่ดูแลคนอื่น'},
  eagle:{species:'วิหคเมฆา', name:'อินทรี', title:'ผู้มองไกล', hue:28,
    essence:'คุณมองเห็นภาพไกลกว่าวันนี้ อิสรภาพและการเติบโตคือเชื้อเพลิงของคุณ คุณชอบบินสูงกว่าที่เคย และไม่กลัวลมแรง',
    strengths:['มีวิสัยทัศน์ชัด','ลงมือเร็วเมื่อเห็นโอกาส','ไม่ยอมหยุดอยู่กับที่'],
    growth:'อินทรีบินได้ไกลเพราะรู้จักร่อนพักบนสายลม ลองให้ความสำเร็จเล็กๆ ระหว่างทางได้มีเวลาถูกชื่นชม'},
  dolphin:{species:'มัจฉานที', name:'โลมา', title:'ผู้เชื่อมใจ', hue:192,
    essence:'คุณมีพลังจากผู้คน มิตรภาพ เสียงหัวเราะ และการได้ช่วยใครสักคนทำให้คุณมีชีวิตชีวา คุณเป็นคนที่ทำให้วงสนทนาอบอุ่นขึ้น',
    strengths:['อ่านอารมณ์คนเก่ง','ทำให้บรรยากาศเบาลง','เป็นสะพานเชื่อมคนเข้าหากัน'],
    growth:'โลมาก็ต้องขึ้นมาหายใจเป็นช่วงๆ ลองรู้ตัวว่าเมื่อไหร่กำลังเป็นทุกอย่างให้ทุกคน แล้วเว้นที่ไว้ให้ตัวเองบ้าง'},
  owl:{species:'อุลูกจันทรา', name:'นกฮูก', title:'ผู้ใคร่ครวญ', hue:262,
    essence:'คุณเข้าใจโลกผ่านการคิดลึกและสังเกตเงียบๆ ความรู้ ความจริง และความยุติธรรมสำคัญกับคุณ คุณมักเห็นสิ่งที่คนอื่นมองข้าม',
    strengths:['คิดรอบคอบ','ซื่อตรงต่อความจริง','สังเกตรายละเอียดเก่ง'],
    growth:'นกฮูกเห็นชัดในความมืด แต่ก็ต้องบินออกจากกิ่งไม้บ้าง ลองลงมือก่อนจะคิดครบทุกมุม แล้วปรับระหว่างทาง'},
  turtle:{species:'กูรมาบัว', name:'เต่า', title:'ผู้มั่นคงช้าๆ', hue:150,
    essence:'คุณเดินด้วยจังหวะของตัวเอง ความสงบ สุขภาพ และศรัทธาคือบ้านที่คุณพกติดตัว คุณไม่รีบ แต่ไปถึงเสมอ',
    strengths:['ใจเย็นในวันที่วุ่นวาย','สม่ำเสมอ','รู้ว่าอะไรสำคัญจริง'],
    growth:'กระดองปกป้องคุณได้ดี ลองยื่นหัวออกมาบอกความต้องการให้คนอื่นรู้ แทนการเก็บไว้ข้างในคนเดียว'},
  fox:{species:'จิ้งจอกเพลิงกนก', name:'จิ้งจอก', title:'ผู้สร้างสรรค์', hue:16,
    essence:'คุณมีความคิดเป็นของตัวเอง ชอบหาทางใหม่ที่ไม่มีใครเดิน ความสร้างสรรค์ ความงาม และอิสระทำให้คุณเป็นคุณ',
    strengths:['ช่างคิดช่างแก้ปัญหา','ปรับตัวเร็ว','เห็นความงามในสิ่งเล็กๆ'],
    growth:'จิ้งจอกฉลาดหาทางเลี่ยง ลองสังเกตว่าบางเรื่องที่เลี่ยงอยู่ อาจเป็นเรื่องที่ควรเผชิญตรงๆ สักครั้ง'},
  lion:{species:'ราชสีห์น้อย', name:'สิงโต', title:'ผู้นำ', hue:42,
    essence:'คุณมีพลังที่จะยืนข้างหน้าและพาคนอื่นไปด้วย ความสำเร็จ ความยุติธรรม และการได้รับการยอมรับขับเคลื่อนคุณ',
    strengths:['กล้าตัดสินใจ','ปกป้องคนที่อ่อนแอกว่า','มีพลังดึงดูดคน'],
    growth:'เสียงคำรามที่ดีที่สุดบางครั้งคือความเงียบ ลองฟังให้จบก่อนตอบ แล้วจะเห็นว่าคนรอบตัวพร้อมเดินไปกับคุณมากขึ้น'},
  deer:{species:'มฤคมาศ', name:'กวาง', title:'ผู้อ่อนโยน', hue:338,
    essence:'คุณรับรู้ความรู้สึกได้ละเอียด ความงาม ความสงบ และความใจดีคือภาษาของคุณ คุณทำให้โลกรอบตัวนุ่มนวลขึ้น',
    strengths:['เห็นอกเห็นใจคนอื่น','ไวต่อความรู้สึก','สร้างพื้นที่ปลอดภัย'],
    growth:'ความอ่อนโยนไม่ใช่ความอ่อนแอ ลองยืนยันความต้องการของตัวเองอย่างนุ่มนวลแต่ชัดเจน แทนการหลบออกจากความขัดแย้ง'}
};
const VALUE_MAP = {
  'ความซื่อสัตย์':{owl:2,elephant:1},'ครอบครัว':{elephant:3},'อิสรภาพ':{eagle:3,fox:1},'ความมั่นคง':{turtle:2,elephant:1},
  'ความคิดสร้างสรรค์':{fox:3},'การเติบโต':{eagle:2,owl:1},'ความยุติธรรม':{owl:2,lion:1},'สุขภาพ':{turtle:2,deer:1},
  'การยอมรับ':{lion:2,dolphin:1},'ความสงบ':{turtle:2,deer:2},'การช่วยเหลือผู้อื่น':{dolphin:2,elephant:1,deer:1},
  'ความสำเร็จ':{lion:2,eagle:2},'ความสนุก':{dolphin:3},'ความรู้':{owl:3},'ศรัทธา':{turtle:2,deer:1},'มิตรภาพ':{dolphin:3},
  'ความงาม':{deer:2,fox:1},'ความรับผิดชอบ':{elephant:2,lion:1}
};
const REACT_MAP = {'สู้กลับ/เถียง':{lion:1},'หนี/หลีกเลี่ยง':{deer:1,fox:1},'นิ่ง/เงียบ':{turtle:1,owl:1},'เอาใจ/ยอมตาม':{dolphin:1,elephant:1},'ทำงานหนักขึ้น':{eagle:1},'ตำหนิตัวเอง':{owl:1}};
const LOVE_MAP = {'คำพูดชื่นชม':{dolphin:1},'เวลาคุณภาพ':{elephant:1},'การช่วยเหลือ':{turtle:1},'ของขวัญ':{fox:1},'การสัมผัส':{deer:1}};
const SHADOW = {
  'สู้กลับ/เถียง':'เวลาถูกกดดัน คุณมักสู้กลับทันที พลังนี้ปกป้องคุณได้ แต่บางครั้งทำให้อีกฝ่ายไม่ได้ยินสิ่งที่คุณต้องการจริงๆ',
  'หนี/หลีกเลี่ยง':'เวลาถูกกดดัน คุณมักถอยออกมาก่อน ช่วยให้ใจได้พัก แต่เรื่องที่ค้างไว้มักกลับมาหนักกว่าเดิม',
  'นิ่ง/เงียบ':'เวลาถูกกดดัน คุณมักนิ่งและเงียบ ช่วยไม่ให้พูดสิ่งที่เสียใจทีหลัง แต่คนรอบตัวอาจเดาใจคุณไม่ถูก',
  'เอาใจ/ยอมตาม':'เวลาถูกกดดัน คุณมักยอมเพื่อให้ทุกอย่างสงบ ช่วยรักษาความสัมพันธ์ แต่ความต้องการของคุณเองอาจหายไปเงียบๆ',
  'ทำงานหนักขึ้น':'เวลาถูกกดดัน คุณมักทำงานหนักขึ้น ได้ผลงานจริง แต่บางครั้งเป็นการหนีความรู้สึกที่ยังไม่ได้มอง',
  'ตำหนิตัวเอง':'เวลาถูกกดดัน คุณมักโทษตัวเองก่อน แปลว่าคุณรับผิดชอบสูง แต่เสียงในหัวอาจแรงกับคุณเกินกว่าที่คุณจะพูดกับเพื่อน'
};
const arr = v => Array.isArray(v) ? v : [];
function petSignals(){
  const a = n => (S.ans[n]||{});
  return { values: arr(a(3).v), reacts: arr(a(9).r), love: arr(a(19).g), traps: arr(a(14).k), emotions: arr(a(6).e) };
}
function petScores(){
  const sig = petSignals(), sc = {}; Object.keys(ANIMALS).forEach(k=>sc[k]=0);
  const add = m => m && Object.entries(m).forEach(([k,w])=>sc[k]+=w);
  sig.values.forEach(v=>add(VALUE_MAP[v])); sig.reacts.forEach(v=>add(REACT_MAP[v])); sig.love.forEach(v=>add(LOVE_MAP[v]));
  const moods = Object.values(S.mood||{}); if(moods.length){ const avg = moods.reduce((s,x)=>s+x,0)/moods.length; if(avg>=3) sc.dolphin+=.5; else if(avg<=1.5) sc.turtle+=.5; }
  return sc;
}
function petRank(){
  const sc = petScores(), order = Object.keys(ANIMALS);
  const ranked = order.slice().sort((x,y)=> sc[y]-sc[x] || order.indexOf(x)-order.indexOf(y));
  return sc[ranked[0]]>0 ? ranked : null;
}

/* ---------- การเติบโต ---------- */
function petXP(){
  let xp = 0;
  Object.entries(S.ans||{}).forEach(([n,a])=>Object.values(a||{}).forEach(v=>{ if(Array.isArray(v)?v.length:String(v||'').trim()) xp++; }));
  return xp + Object.keys(S.mood||{}).length;
}
function petStage(){
  const d = Object.keys(S.done).length;
  if(d>=30) return 5; if(d>=21) return 4; if(d>=13) return 3; if(d>=6) return 2; if(d>=1) return 1; return 0;
}
const STAGE_NAME = ['ไข่แสงจันทร์','ดวงจิตแรกเกิด','ดวงจิตวัยเยาว์','ดวงจิตเติบใหญ่','ดวงจิตใกล้กลายร่าง','กลายร่างแล้ว'];
function petHue(){ const r = petRank(); return r ? ANIMALS[r[0]].hue : 44; }
function pal(h, flat){ // flat = literal colours for export
  return { body:`hsl(${h} 42% 82%)`, shade:`hsl(${h} 34% 64%)`, line:`hsl(${h} 32% 30%)`, light:`hsl(${h} 50% 93%)`,
    ink: flat?'#1C2333':'var(--ink)', gold:'#C9A24A' };
}

/* ---------- ภาพ ---------- */
const ART_V = 1;
const artUrl = key => `art/${key}.webp?v=${ART_V}`;
const artImg = (key, size) => `<image href="${artUrl(key)}" x="${-size/2}" y="${-size/2}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
function eyes(x, y, r, p){
  const one = cx => `<ellipse cx="${cx}" cy="${y}" rx="${(r*.82).toFixed(1)}" ry="${r}" fill="${p.ink}"/><circle cx="${(cx+r*.32).toFixed(1)}" cy="${(y-r*.38).toFixed(1)}" r="${(r*.34).toFixed(1)}" fill="#fff"/>`;
  return `<g class="eyes">${one(-x)}${one(x)}</g>`;
}
const blush = (x,y,p)=>`<ellipse cx="${-x}" cy="${y}" rx="7" ry="4" fill="#E9A3A3" opacity=".55"/><ellipse cx="${x}" cy="${y}" rx="7" ry="4" fill="#E9A3A3" opacity=".55"/>`;
const mirror = (d, attrs) => `<path d="${d}" ${attrs}/><path d="${d}" ${attrs} transform="scale(-1 1)"/>`;

function animalArt(id, h, flat){
  const p = pal(h, flat), st = `stroke="${p.line}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
  switch(id){
  case 'owl': return `
    ${mirror('M-46 0 Q-74 38 -48 78 Q-36 40 -36 8Z', `fill="${p.shade}" ${st}`)}
    ${mirror('M-36 -26 L-50 -66 L-14 -42Z', `fill="${p.shade}" ${st}`)}
    <ellipse cx="0" cy="18" rx="50" ry="62" fill="${p.body}" ${st}/>
    <ellipse cx="0" cy="40" rx="30" ry="34" fill="${p.light}"/>
    <path d="M-14 30 l7 6 l7 -6 l7 6 l7 -6 M-14 46 l7 6 l7 -6 l7 6 l7 -6" fill="none" stroke="${p.shade}" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="-19" cy="-10" r="20" fill="${p.light}"/><circle cx="19" cy="-10" r="20" fill="${p.light}"/>
    ${eyes(19,-10,9,p)}<path d="M-6 6 L6 6 L0 17Z" fill="${p.gold}"/>
    <path d="M-16 80 v6 M-10 80 v6 M10 80 v6 M16 80 v6" stroke="${p.gold}" stroke-width="3" stroke-linecap="round"/>`;
  case 'elephant': return `
    <ellipse cx="0" cy="64" rx="46" ry="26" fill="${p.shade}" ${st}/>
    <rect x="-36" y="66" width="18" height="22" rx="7" fill="${p.shade}" ${st}/><rect x="18" y="66" width="18" height="22" rx="7" fill="${p.shade}" ${st}/>
    ${mirror('M-30 -30 C-80 -48 -92 20 -44 32 C-36 20 -34 -6 -30 -30Z', `fill="${p.shade}" ${st}`)}
    <circle cx="0" cy="-6" r="44" fill="${p.body}" ${st}/>
    <path d="M-12 18 C-14 46 -10 62 6 66 C18 68 22 58 14 56 C6 54 8 40 12 18Z" fill="${p.body}" ${st}/>
    ${mirror('M-16 24 Q-26 34 -20 42', `fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"`)}
    ${eyes(17,-12,8,p)}${blush(28,4,p)}
    <path d="M-6 36 h8 M-6 46 h9" stroke="${p.shade}" stroke-width="2" stroke-linecap="round"/>`;
  case 'turtle': return `
    ${mirror('M-44 -14 C-72 -24 -78 -4 -56 6Z', `fill="${p.body}" ${st}`)}
    ${mirror('M-46 46 C-74 54 -72 76 -48 66Z', `fill="${p.body}" ${st}`)}
    <path d="M-10 70 L0 86 L10 70Z" fill="${p.body}" ${st}/>
    <circle cx="0" cy="-50" r="24" fill="${p.body}" ${st}/>
    ${eyes(9,-54,6,p)}<path d="M-6 -40 Q0 -36 6 -40" fill="none" stroke="${p.line}" stroke-width="2.4" stroke-linecap="round"/>
    <ellipse cx="0" cy="22" rx="58" ry="52" fill="${p.shade}" ${st}/>
    <path d="M0 -4 L18 6 L18 28 L0 38 L-18 28 L-18 6Z" fill="${p.body}" stroke="${p.line}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M0 -4 L0 -28 M18 6 L44 -8 M18 28 L46 40 M0 38 L0 72 M-18 28 L-46 40 M-18 6 L-44 -8" stroke="${p.line}" stroke-width="2.4" stroke-linecap="round"/>`;
  case 'fox': return `
    <path d="M26 60 C96 58 104 -6 74 -26 C84 12 60 34 28 36Z" fill="${p.shade}" ${st}/>
    <path d="M74 -26 C88 -10 86 6 80 14 C72 4 70 -12 74 -26Z" fill="#fff" stroke="${p.line}" stroke-width="2.4" stroke-linejoin="round"/>
    <ellipse cx="0" cy="56" rx="32" ry="30" fill="${p.shade}" ${st}/>
    ${mirror('M-44 -16 L-40 -66 L-10 -30Z', `fill="${p.body}" ${st}`)}
    ${mirror('M-38 -26 L-36 -54 L-20 -32Z', `fill="${p.shade}"`)}
    <path d="M-52 -20 Q-46 26 0 38 Q46 26 52 -20 Q0 -6 -52 -20Z" fill="${p.body}" ${st}/>
    ${mirror('M-48 -12 Q-34 26 0 38 Q-8 14 -20 6Z', `fill="#fff"`)}
    ${eyes(20,-2,8,p)}<ellipse cx="0" cy="26" rx="6" ry="4.5" fill="${p.ink}"/>`;
  case 'deer': return `
    ${mirror('M-14 -44 C-20 -64 -34 -72 -42 -90 M-24 -62 L-46 -62 M-32 -74 L-22 -92', `fill="none" stroke="${p.gold}" stroke-width="5" stroke-linecap="round"`)}
    <ellipse cx="0" cy="64" rx="40" ry="26" fill="${p.shade}" ${st}/>
    <circle cx="-18" cy="58" r="4" fill="#fff"/><circle cx="12" cy="66" r="4" fill="#fff"/><circle cx="24" cy="54" r="3.4" fill="#fff"/>
    ${mirror('M-28 -30 C-50 -44 -66 -30 -60 -22 C-50 -18 -38 -20 -28 -24Z', `fill="${p.body}" ${st}`)}
    <ellipse cx="0" cy="-8" rx="32" ry="42" fill="${p.body}" ${st}/>
    <ellipse cx="0" cy="20" rx="17" ry="13" fill="${p.light}"/>
    ${eyes(13,-12,8,p)}<ellipse cx="0" cy="16" rx="5.5" ry="4" fill="${p.ink}"/>${blush(22,6,p)}`;
  case 'dolphin': return `
    <path d="M-80 66 Q-40 54 0 66 T80 66" fill="none" stroke="${p.shade}" stroke-width="3" stroke-linecap="round"/>
    <path d="M-60 84 Q-20 74 20 84 T96 84" fill="none" stroke="${p.shade}" stroke-width="3" stroke-linecap="round" opacity=".6"/>
    <path d="M-8 -58 C-2 -76 12 -82 20 -80 C12 -70 10 -60 12 -52Z" fill="${p.shade}" ${st}/>
    <path d="M-74 46 C-66 -20 -10 -64 40 -52 C70 -44 84 -22 86 -6 C76 -8 66 -4 62 2 C54 32 18 50 -24 50 C-44 50 -60 52 -74 46Z" fill="${p.body}" ${st}/>
    <path d="M-60 46 C-30 30 20 26 60 2 C52 30 18 48 -24 50 C-40 50 -52 50 -60 46Z" fill="${p.light}"/>
    <path d="M-74 46 C-90 34 -96 46 -92 56 C-84 52 -80 52 -74 46 C-78 58 -72 68 -62 66Z" fill="${p.shade}" ${st}/>
    <ellipse cx="40" cy="-22" rx="6.5" ry="8" fill="${p.ink}"/><circle cx="42.4" cy="-25" r="2.6" fill="#fff"/>
    <path d="M58 -4 Q66 2 76 -2" fill="none" stroke="${p.line}" stroke-width="2.4" stroke-linecap="round"/>`;
  case 'eagle': return `
    ${mirror('M-14 -2 L-96 -34 L-82 -14 L-96 0 L-76 8 L-88 24 L-62 22 L-66 38 L-20 30Z', `fill="${p.shade}" ${st}`)}
    <path d="M-16 60 L0 90 L16 60Z" fill="${p.shade}" ${st}/>
    <ellipse cx="0" cy="22" rx="30" ry="44" fill="${p.body}" ${st}/>
    <path d="M-10 18 l5 6 l5 -6 l5 6 l5 -6 M-10 34 l5 6 l5 -6 l5 6 l5 -6" fill="none" stroke="${p.shade}" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="0" cy="-30" r="26" fill="#fff" ${st}/>
    ${eyes(11,-34,6.5,p)}<path d="M-8 -20 Q0 -14 8 -20 Q6 -6 0 0 Q-6 -6 -8 -20Z" fill="${p.gold}" stroke="${p.line}" stroke-width="2" stroke-linejoin="round"/>`;
  case 'lion': default: {
    const petals = Array.from({length:14},(_,i)=>`<ellipse cx="0" cy="-54" rx="16" ry="24" transform="rotate(${(i*360/14).toFixed(1)})" fill="${p.shade}" stroke="${p.line}" stroke-width="2.4"/>`).join('');
    return `${petals}<circle r="52" fill="${p.shade}"/>
    <circle cx="-30" cy="-30" r="12" fill="${p.body}" ${st}/><circle cx="30" cy="-30" r="12" fill="${p.body}" ${st}/>
    <circle r="42" fill="${p.body}" ${st}/>
    <ellipse cx="-10" cy="18" rx="14" ry="11" fill="${p.light}"/><ellipse cx="10" cy="18" rx="14" ry="11" fill="${p.light}"/>
    <path d="M-7 8 L7 8 L0 16Z" fill="${p.ink}"/>${eyes(16,-6,8,p)}${blush(28,8,p)}`;
  }}
}
function spiritArt(stage, h, ghost){
  const p = pal(h);
  if(stage===0) return `
    <ellipse cx="0" cy="72" rx="40" ry="7" fill="${p.ink}" opacity=".08"/>
    <path d="M0 -60 C34 -60 50 -10 50 18 C50 50 28 66 0 66 C-28 66 -50 50 -50 18 C-50 -10 -34 -60 0 -60Z" fill="var(--paper)" stroke="${p.gold}" stroke-width="3"/>
    <path d="M10 -18 A20 20 0 1 0 10 18 A14 16 0 1 1 10 -18Z" fill="${p.gold}" opacity=".85"/>
    <circle cx="-22" cy="34" r="3" fill="${p.gold}"/><circle cx="24" cy="40" r="2.2" fill="${p.gold}"/>`;
  const shadow = stage>=4 && ghost ? `<g opacity=".16" transform="scale(1.25)">${animalArt(ghost,h)}</g>` : '';
  const aura = stage>=3 ? `<circle r="${stage>=4?92:84}" fill="none" stroke="${p.gold}" stroke-width="1.2" stroke-dasharray="2 7" opacity=".7"/>` : '';
  const ears = stage>=2 ? mirror('M-30 -34 C-42 -56 -30 -66 -18 -46Z', `fill="${p.body}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"`) : '';
  const tail = stage>=3 ? `<path d="M44 40 C80 44 88 8 70 -6 C76 18 62 30 46 28Z" fill="${p.shade}" stroke="${p.line}" stroke-width="3" stroke-linejoin="round"/>` : '';
  const sparks = stage>=2 ? `<g fill="${p.gold}"><circle cx="-66" cy="-30" r="3"/><circle cx="62" cy="-48" r="2.4"/><circle cx="-54" cy="52" r="2"/>${stage>=4?'<circle cx="70" cy="58" r="2.6"/><circle cx="-8" cy="-86" r="2.2"/>':''}</g>` : '';
  return `${shadow}${aura}${sparks}<ellipse cx="0" cy="72" rx="40" ry="7" fill="${p.ink}" opacity=".08"/>${tail}${ears}
    <path d="M0 -52 C38 -52 56 -12 56 18 C56 52 30 66 0 66 C-30 66 -56 52 -56 18 C-56 -12 -38 -52 0 -52Z" fill="${p.body}" stroke="${p.line}" stroke-width="3"/>
    <path d="M0 -52 C-8 -66 6 -74 0 -88" fill="none" stroke="${p.gold}" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="0" cy="34" rx="30" ry="22" fill="${p.light}" opacity=".9"/>
    ${eyes(18,6,9,p)}${blush(30,22,p)}<path d="M-6 24 Q0 29 6 24" fill="none" stroke="${p.line}" stroke-width="2.4" stroke-linecap="round"/>`;
}
function petSvg(cls){
  const stage = petStage(), rank = petRank(), h = petHue();
  const d = Object.keys(S.done).length, s = stage===5 ? 1 : (0.8 + 0.2*Math.min(d,29)/29);
  const glow = stage>=1 && stage<5 && rank ? `<circle r="78" fill="hsl(${h} 70% 72%)" opacity=".28" filter="url(#petGlow)"/>` : '';
  const key = stage===5 && rank ? rank[0] : 'stage'+Math.min(stage,4);
  const inner = `${glow}${artImg(key, 236)}`;
  return `<defs><filter id="petGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter></defs><g class="${cls||'pet'}" transform="scale(${s.toFixed(3)})"><g class="pet-body">${inner}</g></g>`;
}

/* ---------- หน้า: แผงดวงจิตบนหน้าหลัก ---------- */
function petPanel(){
  const stage = petStage(), name = (S.pet&&S.pet.name)||'', rank = petRank();
  const hint = stage===0 ? 'ทำบทแรกให้จบ ไข่จะฟักเป็นดวงจิตของคุณ'
    : stage===5 ? 'ดวงจิตกลายร่างเป็นตัวตนของคุณแล้ว'
    : stage===4 ? 'เงาของร่างใหม่เริ่มปรากฏด้านหลังแล้ว อีกไม่กี่บทจะรู้ว่าเป็นตัวอะไร'
    : rank ? 'แสงรอบตัวดวงจิตเปลี่ยนสีตามคำตอบของคุณ ทุกคำตอบคืออาหารที่ทำให้โตขึ้น' : 'ทุกคำตอบคืออาหาร ยิ่งตอบจากใจ ดวงจิตยิ่งโต';
  return `<div class="pet-panel"><p class="pet-stage">${STAGE_NAME[stage]}${name?` · ${esc(name)}`:''}</p><p class="sub">${hint}</p>
    ${!name && stage>=1 ? `<form class="pet-name" onsubmit="namePet(event)"><input id="petName" maxlength="20" placeholder="ตั้งชื่อดวงจิตของคุณ" aria-label="ชื่อดวงจิต"><button class="btn ghost" type="submit">ตั้งชื่อ</button></form>`:''}
    ${stage===5 ? `<div class="row" style="justify-content:center;margin-top:14px"><button class="btn moon" onclick="go('reveal')">ดูตัวตนของฉัน</button></div>`:''}</div>`;
}
function namePet(e){ e.preventDefault(); const v = document.getElementById('petName').value.trim(); if(!v) return; (S.pet ||= {}).name = v; save(); render(); }
function petPing(){
  const m = document.querySelector('.pet-mini'); if(!m) return;
  m.classList.remove('fed'); void m.getBoundingClientRect(); m.classList.add('fed');
}

/* ---------- หน้า: เปิดเผยตัวตน (วันที่ 30) ---------- */
function revealView(){
  const rank = petRank();
  if(Object.keys(S.done).length<30 || !rank) return `<button class="link" onclick="go('home')">← กลับหน้าหลัก</button><p class="sub" style="margin-top:20px">ทำครบ 30 วันก่อน ดวงจิตจึงจะกลายร่าง</p>`;
  const A = ANIMALS[rank[0]], B = ANIMALS[rank[1]], sig = petSignals(), name = (S.pet&&S.pet.name)||'ดวงจิตของคุณ';
  const own = n => String((S.ans[n]||{}).a||'').trim();
  const traces = [
    sig.values.length && `คุณค่าที่คุณเลือก: ${sig.values.join(', ')}`,
    sig.reacts.length && `เวลาถูกกดดัน คุณมัก: ${sig.reacts.join(', ')}`,
    sig.love.length && `คุณรู้สึกถูกใส่ใจเมื่อได้รับ: ${sig.love.join(', ')}`,
    sig.traps.length && `กับดักความคิดที่คุณรู้ทันแล้ว: ${sig.traps.join(', ')}`
  ].filter(Boolean);
  const words = [own(1)&&['ชีวิตในวันแรกของคุณ', own(1)], own(24)&&['เป้าหมายที่คุณเลือก', own(24)], own(26)&&['นิสัยจิ๋วของคุณ', own(26)]].filter(Boolean);
  const shadow = sig.reacts.map(r=>SHADOW[r]).filter(Boolean)[0];
  return `<button class="link" onclick="go('home')">← กลับหน้าหลัก</button>
  <section class="reveal" style="--pet-h:${A.hue}">
    <img class="reveal-art" src="${artUrl(rank[0])}" width="768" height="768" alt="${esc(A.species)} ${esc(A.name)}${esc(A.title)}">
    <p class="kicker">${esc(name)} กลายร่างเป็น</p>
    <h2 class="reveal-name">${esc(A.species)} <span>ดวงจิตแห่ง${esc(A.name)} ${esc(A.title)}</span></h2>
    <p class="lesson">${esc(A.essence)}</p>
    <div class="block"><h3 class="r-h">ร่องรอยจากคำตอบของคุณ</h3><ul class="r-list">${traces.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>
    ${words.length?`<div class="block"><h3 class="r-h">คำของคุณเอง</h3>${words.map(([l,w])=>`<p class="sub">${esc(l)}</p><blockquote>${esc(w)}</blockquote>`).join('')}</div>`:''}
    <div class="block"><h3 class="r-h">จุดแข็งของ${esc(A.species)}ในตัวคุณ</h3><ul class="r-list">${A.strengths.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>
    ${shadow?`<div class="block"><h3 class="r-h">เงาที่ควรรู้ทัน</h3><p>${esc(shadow)}</p></div>`:''}
    <div class="block"><h3 class="r-h">ก้าวต่อไป</h3><p>${esc(A.growth)}</p></div>
    <div class="block"><h3 class="r-h">อีกด้านของคุณ</h3><p>คำตอบของคุณมีส่วนของ${esc(B.species)} ดวงจิตแห่ง${esc(B.name)} ${esc(B.title)} อยู่ด้วย ${esc(B.essence.split(' ')[0])}</p></div>
    <div class="row" style="margin-top:30px"><button class="btn" onclick="sharePet()">บันทึกภาพตัวตนของฉัน</button><button class="btn ghost" onclick="go('summary')">ภาพรวมตัวฉัน</button></div>
  </section>`;
}
async function sharePet(){
  const rank = petRank(); if(!rank) return; const A = ANIMALS[rank[0]], name = (S.pet&&S.pet.name)||'ดวงจิตของฉัน';
  const img = new Image(); img.src = artUrl(rank[0]);
  await img.decode();
  const c = document.createElement('canvas'); c.width=1080; c.height=1350; const x = c.getContext('2d');
  x.fillStyle='#E9ECF0'; x.fillRect(0,0,1080,1350);
  x.fillStyle=`hsl(${A.hue} 45% 90%)`; x.beginPath(); x.arc(540,520,360,0,Math.PI*2); x.fill();
  for(let i=0;i<30;i++){ const a=i/30*Math.PI*2-Math.PI/2; x.fillStyle='#C9A24A'; x.beginPath(); x.arc(540+410*Math.cos(a),520+410*Math.sin(a),9,0,Math.PI*2); x.fill(); }
  x.drawImage(img,160,140,760,760);
  x.textAlign='center'; x.fillStyle='#5B6B8C'; x.font='400 38px "IBM Plex Sans Thai Looped","IBM Plex Sans Thai",sans-serif';
  x.fillText(`${name} กลายร่างเป็น`,540,1010);
  x.fillStyle='#1C2333'; x.font='500 96px "Noto Serif Thai",serif'; x.fillText(A.species,540,1130);
  x.fillStyle='#5B6B8C'; x.font='400 40px "IBM Plex Sans Thai Looped","IBM Plex Sans Thai",sans-serif'; x.fillText(`ดวงจิตแห่ง${A.name} ${A.title}`,540,1195);
  x.fillStyle='#7A8499'; x.font='400 30px "IBM Plex Sans Thai Looped","IBM Plex Sans Thai",sans-serif';
  x.fillText('ใจรู้ · เข้าใจตัวเองใน 30 วัน · arstinla.com/apps/jairu',540,1270);
  const a = document.createElement('a'); a.download = `jairu-${rank[0]}.png`; a.href = c.toDataURL('image/png'); a.click();
}
