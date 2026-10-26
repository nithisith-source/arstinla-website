// GET  /api/village  → booked plots (public) + my application (if logged in)
// POST /api/village  → apply or change my application (LINE login required)
import { json, readSession, getMember, authConfigured } from "../_lib/member.js";
import { ensureVillageSchema, validateApplication, LAND_TIERS, RESERVED_PLOTS } from "../_lib/village.js";

const publicApp = a =>
  a && { displayName: a.display_name, tier: a.tier, plot: a.plot, status: a.status, worldLink: a.status === "approved" ? a.world_link || null : null, updatedAt: a.updated_at };

async function bookedPlots(db) {
  const rows = await db
    .prepare(`SELECT plot, status, display_name FROM village_apps WHERE plot IS NOT NULL AND status IN ('pending','approved')`)
    .all();
  const plots = (rows.results || []).map(r => ({ plot: r.plot, status: r.status, name: r.status === "approved" ? r.display_name : null }));
  for (const [plot, name] of Object.entries(RESERVED_PLOTS)) plots.push({ plot, status: "reserved", name });
  return plots;
}

export async function onRequestGet({ request, env }) {
  if (!authConfigured(env)) return json({ ok: false, error: "ระบบสมาชิกยังไม่พร้อม" }, 503);
  const db = env.MEMBERS_DB;
  await ensureVillageSchema(db);
  const s = await readSession(request, env);
  const mine = s ? await db.prepare("SELECT * FROM village_apps WHERE member_id = ?").bind(s.sub).first() : null;
  return json({ ok: true, loggedIn: !!s, plots: await bookedPlots(db), mine: publicApp(mine) });
}

export async function onRequestPost({ request, env }) {
  if (!authConfigured(env)) return json({ ok: false, error: "ระบบสมาชิกยังไม่พร้อม" }, 503);
  const s = await readSession(request, env);
  if (!s) return json({ ok: false, error: "เข้าสู่ระบบด้วย LINE ก่อน" }, 401);
  const db = env.MEMBERS_DB;
  if (!(await getMember(db, s.sub))) return json({ ok: false, error: "เข้าสู่ระบบด้วย LINE ก่อน" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "ข้อมูลไม่ถูกต้อง" }, 400); }
  const app = {
    displayName: String(body?.displayName || "").trim(),
    tier: body?.tier,
    plot: LAND_TIERS.includes(body?.tier) ? body?.plot || null : null
  };
  const problem = validateApplication(app);
  if (problem) return json({ ok: false, error: problem }, 400);

  await ensureVillageSchema(db);
  const existing = await db.prepare("SELECT status FROM village_apps WHERE member_id = ?").bind(s.sub).first();
  if (existing?.status === "approved") {
    return json({ ok: false, error: "ใบสมัครนี้อนุมัติแล้ว ถ้าต้องการเปลี่ยนระดับหรือแปลง ทักมาที่ LINE @arstinla" }, 409);
  }

  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO village_apps (member_id, display_name, tier, plot, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'pending', ?5, ?5)
         ON CONFLICT(member_id) DO UPDATE SET
           display_name = excluded.display_name, tier = excluded.tier, plot = excluded.plot,
           status = 'pending', updated_at = excluded.updated_at`
      )
      .bind(s.sub, app.displayName, app.tier, app.plot, now)
      .run();
  } catch (e) {
    if (/UNIQUE/i.test(String(e?.message || e))) return json({ ok: false, error: "แปลงนี้มีคนจองไปแล้ว เลือกแปลงอื่นได้เลย" }, 409);
    throw e;
  }

  const mine = await db.prepare("SELECT * FROM village_apps WHERE member_id = ?").bind(s.sub).first();
  return json({ ok: true, mine: publicApp(mine), plots: await bookedPlots(db) });
}
