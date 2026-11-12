// ARSTINLA Village — virtual village (WorkAdventure) sign-up and land plots.
// Uses the same MEMBERS_DB (D1) as the member system. No request handlers here.

// Village levels, lowest to highest. Only "owner" and "developer" can hold a plot.
export const VILLAGE_TIERS = ["guest", "resident", "owner", "developer"];
export const LAND_TIERS = ["owner", "developer"];

// Plot IDs must match the site plan drawn in /village/index.html.
const range = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}-${String(i + 1).padStart(2, "0")}`);
export const PLOTS = [...range("A", 10), ...range("B", 10), ...range("C", 10), ...range("E", 10),
  "F-01", "F-03", "G-02", "G-04", ...range("D", 6)];
export const LAKE_PLOTS = new Set(range("D", 6));          // central island: developer only
export const RESERVED_PLOTS = { "A-01": "บ้านสถาปนิก" };   // never bookable

// Default link into the village world (WorkAdventure). An approved member gets this
// unless the admin set a personal link. Override with the VILLAGE_WORLD_URL variable.
export const DEFAULT_WORLD_URL = "https://play.workadventu.re/@/arstinla-design/arstinla-world/modern-hackathon";
export const worldUrl = env => String(env?.VILLAGE_WORLD_URL || DEFAULT_WORLD_URL).trim();

// Application status. "rejected" frees the plot again.
export const STATUSES = ["pending", "approved", "rejected"];

let ready = false;
export async function ensureVillageSchema(db) {
  if (ready) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS village_apps (
      member_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      tier TEXT NOT NULL,
      plot TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      world_link TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    // One active booking per plot. Rejected rows don't hold the plot.
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS village_plot_taken
      ON village_apps(plot) WHERE plot IS NOT NULL AND status IN ('pending','approved')`),
    // A house built in Massing Studio and placed on the member's plot.
    db.prepare(`CREATE TABLE IF NOT EXISTS village_houses (
      member_id TEXT PRIMARY KEY,
      plot TEXT NOT NULL,
      data TEXT NOT NULL,
      image TEXT,
      updated_at TEXT NOT NULL
    )`)
  ]);
  ready = true;
}

// Checks a sign-up and returns an error message in Thai, or null if it is fine.
export function validateApplication({ displayName, tier, plot }) {
  const name = String(displayName || "").trim();
  if (!name) return "กรอกชื่อในหมู่บ้านก่อนส่ง";
  if (name.length > 24) return "ชื่อในหมู่บ้านยาวได้ไม่เกิน 24 ตัวอักษร";
  if (!VILLAGE_TIERS.includes(tier)) return "เลือกระดับสมาชิก";
  const needsLand = LAND_TIERS.includes(tier);
  if (!needsLand && plot) return "ระดับนี้จองที่ดินไม่ได้";
  if (needsLand) {
    if (!plot) return "เลือกแปลงที่ดินบนผังก่อนส่ง";
    if (!PLOTS.includes(plot) || RESERVED_PLOTS[plot]) return "แปลงนี้จองไม่ได้";
    if (LAKE_PLOTS.has(plot) && tier !== "developer") return "แปลงบนเกาะกลางสงวนไว้ให้ระดับผู้พัฒนาโครงการ";
  }
  return null;
}

// Plot sizes in metres (same numbers as the site plan in /village/index.html, 1 plan unit = 0.2 m).
const SZ = (w, h) => ({ w: +(w * 0.2).toFixed(1), d: +(h * 0.2).toFixed(1) });
export function plotSize(plot) {
  if (/^D-0[25]$/.test(plot)) return SZ(62, 64);
  if (/^D-/.test(plot)) return SZ(62, 90);
  if (/^[FG]-/.test(plot)) return SZ(52, 52);
  const n = Number(String(plot).slice(2));
  if (/^[AB]-/.test(plot)) return n <= 5 ? SZ(52, 52) : SZ(52, 94);
  if (/^[CE]-/.test(plot)) return n <= 5 ? SZ(52, 94) : SZ(52, 52);
  return SZ(52, 52);
}

// Cleans a house sent from Massing Studio. Returns {house} or {error}.
export function cleanHouse(body) {
  const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n * 100) / 100)) : lo; };
  const rooms = (Array.isArray(body?.rooms) ? body.rooms : []).slice(0, 80).map(r => ({
    x: num(r?.x, -5, 40), y: num(r?.y, -5, 40), w: num(r?.w, 0.3, 40), d: num(r?.d, 0.3, 40),
    level: Math.round(num(r?.level, 0, 9)),
    name: String(r?.name || "").slice(0, 40),
    color: /^#[0-9a-f]{6}$/i.test(String(r?.color || "")) ? r.color : "#c8bcae"
  }));
  if (!rooms.length) return { error: "ยังไม่มีห้องในโมเดล" };
  const floors = (Array.isArray(body?.floors) ? body.floors : []).slice(0, 10).map(f => num(f, 0, 12));
  const image = String(body?.image || "");
  if (image && !/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(image)) return { error: "ภาพบ้านไม่ถูกต้อง" };
  if (image.length > 600000) return { error: "ภาพบ้านใหญ่เกินไป" };
  return { house: { name: String(body?.name || "").trim().slice(0, 60), rooms, floors }, image: image || null };
}
