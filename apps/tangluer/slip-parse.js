/* อ่านข้อความจากสลิปโอนเงิน (ผลจาก OCR) แล้วดึง ยอดเงิน วันที่ เวลา ผู้รับ
   ใช้ได้ทั้งในเบราว์เซอร์ (window.SlipParse) และใน Node (module.exports) */
(function (root) {
  "use strict";

  const TH_MONTHS = [
    ["ม.ค", "มกราคม"], ["ก.พ", "กุมภาพันธ์"], ["มี.ค", "มีนาคม"], ["เม.ย", "เมษายน"],
    ["พ.ค", "พฤษภาคม"], ["มิ.ย", "มิถุนายน"], ["ก.ค", "กรกฎาคม"], ["ส.ค", "สิงหาคม"],
    ["ก.ย", "กันยายน"], ["ต.ค", "ตุลาคม"], ["พ.ย", "พฤศจิกายน"], ["ธ.ค", "ธันวาคม"]
  ];
  const EN_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

  // OCR ภาษาไทยมักแทรกช่องว่างระหว่างตัวอักษร — ยุบช่องว่างที่อยู่ระหว่างอักษรไทย
  function tidy(line) {
    let s = line
      .replace(/[​ ]/g, " ")
      .replace(/([฀-๿.])\s+(?=[฀-๿.])/g, "$1");
    // ตัวเลขที่ถูกแยกทีละหลัก เช่น "3 , 4 5 0 . 0 0" → "3,450.00"
    for (let k = 0; k < 6; k++) {
      const before = s;
      s = s
        .replace(/(\d)\s*([,.:])\s*(\d)/g, "$1$2$3")
        .replace(/(?<!\d)\d(?: \d(?!\d))+/g, m => m.replace(/ /g, ""));
      if (s === before) break;
    }
    return s.replace(/\s{2,}/g, " ").trim();
  }

  function toNumber(s) {
    const n = parseFloat(String(s).replace(/,/g, ""));
    return isFinite(n) ? n : null;
  }

  function parseAmount(lines) {
    const money = /(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?!\d)/g;
    const keyed = /(จำนวน|ยอด|amount|บาท|thb|฿)/i;
    const skip = /(ค่าธรรมเนียม|fee|คงเหลือ|balance|เลขที่|ref|รหัส|บัญชี|account)/i;
    let best = null;
    lines.forEach((line, i) => {
      if (skip.test(line)) return;
      let m;
      money.lastIndex = 0;
      while ((m = money.exec(line))) {
        const v = toNumber(m[0]);
        if (v === null || v <= 0) continue;
        const prev = lines[i - 1] || "";
        const score = (keyed.test(line) ? 3 : 0) + (/(จำนวน|amount)/i.test(prev) ? 2 : 0) + Math.min(v, 1e7) / 1e9;
        if (!best || score > best.score) best = { value: v, score };
      }
    });
    if (best) return best.value;
    // ไม่มีทศนิยม — ลองหาตัวเลขที่ตามด้วย "บาท"
    for (const line of lines) {
      const m = line.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*(บาท|thb|฿)/i);
      if (m) return toNumber(m[1]);
    }
    return null;
  }

  function fullYear(y) {
    y = parseInt(y, 10);
    if (y < 100) y += y >= 40 ? 2500 : 2000 + 543; // 2 หลัก: ปกติเป็น พ.ศ. (69 = 2569)
    if (y > 2400) y -= 543;
    return y;
  }

  function iso(y, m, d) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1 || d < 1) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function parseDate(text) {
    const flat = text.replace(/\s+/g, " ");
    for (let i = 0; i < 12; i++) {
      const [abbr, full] = TH_MONTHS[i];
      const re = new RegExp(`(\\d{1,2})\\s*(?:${full}|${abbr.replace(/\./g, "\\.")}\\.?)\\s*(\\d{2,4})`);
      const m = flat.match(re);
      if (m) { const r = iso(fullYear(m[2]), i + 1, parseInt(m[1], 10)); if (r) return r; }
    }
    const en = flat.match(/(\d{1,2})\s*([A-Za-z]{3})[a-z]*\.?\s*(\d{2,4})/);
    if (en) {
      const mi = EN_MONTHS.indexOf(en[2].toLowerCase());
      if (mi >= 0) { const r = iso(fullYear(en[3]), mi + 1, parseInt(en[1], 10)); if (r) return r; }
    }
    const num = flat.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (num) { const r = iso(fullYear(num[3]), parseInt(num[2], 10), parseInt(num[1], 10)); if (r) return r; }
    return null;
  }

  function parseTime(text) {
    const m = text.match(/(?:^|[^\d])([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)(?:\s*[:.]\s*[0-5]\d)?\s*(?:น\.?)?(?!\d)/);
    return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
  }

  const NAME_RE = /(นางสาว|นาง|นาย|น\.ส\.?|ด\.ช\.?|ด\.ญ\.?|บจก\.?|บริษัท|หจก\.?|ห้างหุ้นส่วน|ร้าน|MRS?\.?|MS\.?|MISS)\s*[^\d\n]{2,}/i;

  function cleanName(s) {
    return s
      .replace(/(x{2,}|X{2,}|\*{2,})[\w\-*x]*/g, "")
      .replace(/[\d\-]{4,}.*$/, "")
      .replace(/[|:;>»→]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .replace(/^(นางสาว|นาง|นาย|น\.ส\.|บจก\.|หจก\.|บริษัท|ร้าน)\s*/, "$1 ");
  }

  // คืน { sender, receiver } — สลิปส่วนใหญ่เรียง ผู้โอนก่อน ผู้รับทีหลัง
  function parseParties(lines) {
    const hits = [];
    lines.forEach((line, i) => {
      const m = line.match(NAME_RE);
      if (m) hits.push({ name: cleanName(m[0]), i });
    });
    for (let i = 0; i < lines.length; i++) {
      if (/^(ไปยัง|ไป|ถึง|ผู้รับ|to)\b/i.test(lines[i]) || /(ไปยัง|ผู้รับเงิน)/.test(lines[i])) {
        const r = hits.find(x => x.i >= i);
        if (r) { const s = hits.find(x => x !== r && x.i < r.i); return { sender: s ? s.name : "", receiver: r.name }; }
      }
    }
    if (hits.length >= 2) return { sender: hits[0].name, receiver: hits[1].name };
    if (hits.length === 1) return { sender: "", receiver: hits[0].name };
    return { sender: "", receiver: "" };
  }
  const parsePayee = lines => parseParties(lines).receiver;

  function parseSlip(raw) {
    const lines = String(raw || "").split(/\r?\n/).map(tidy).filter(Boolean);
    const text = lines.join("\n");
    const p = parseParties(lines);
    return {
      amount: parseAmount(lines),
      date: parseDate(text),
      time: parseTime(text),
      sender: p.sender,
      receiver: p.receiver,
      payee: p.receiver
    };
  }

  // ใช้เทียบชื่อผู้รับเพื่อจำโครงการ/หมวด
  function payeeKey(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/^(นางสาว|นาง|นาย|น\.ส\.?|ด\.ช\.?|ด\.ญ\.?|mrs?\.?|ms\.?|miss)\s*/, "")
      .replace(/[\s.]/g, "");
  }

  const api = { parseSlip, parseParties, payeeKey, parseDate, parseAmount, parseTime, tidy };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SlipParse = api;
})(typeof self !== "undefined" ? self : this);
