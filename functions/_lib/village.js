// ARSTINLA Village — virtual village (WorkAdventure) sign-up and land plots.
// Uses the same MEMBERS_DB (D1) as the member system. No request handlers here.

// Village levels, lowest to highest. Only "owner" and "developer" can hold a plot.
export const VILLAGE_TIERS = ["guest", "resident", "owner", "developer"];
export const LAND_TIERS = ["owner", "developer"];

// Plot IDs must match the site plan drawn in /village/index.html.
const range = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}-${String(i + 1).padStart(2, "0")}`);
export const PLOTS = [...range("A", 10), ...range("B", 10), ...range("C", 10), ...range("E", 10),
  ...range("F", 4), ...range("G", 4), ...range("D", 8)];
export const LAKE_PLOTS = new Set(range("D", 8));          // central island: developer only
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
      ON village_apps(plot) WHERE plot IS NOT NULL AND status IN ('pending','approved')`)
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
