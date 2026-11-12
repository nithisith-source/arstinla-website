// GET  /api/village/house?plot=A-03 → the house on a plot (picture + rooms) — approved plots, or your own
// POST /api/village/house {name, rooms, floors, image} → place your Massing Studio house on your plot
import { json, readSession, getMember, authConfigured } from "../../_lib/member.js";
import { ensureVillageSchema, cleanHouse, plotSize } from "../../_lib/village.js";

export async function onRequestGet({ request, env }) {
  if (!authConfigured(env)) return json({ ok: false, error: "ระบบสมาชิกยังไม่พร้อม" }, 503);
  const db = env.MEMBERS_DB;
  await ensureVillageSchema(db);
  const plot = new URL(request.url).searchParams.get("plot") || "";
  const s = await readSession(request, env);
  const row = await db.prepare(
    `SELECT h.*, a.display_name, a.status, a.member_id AS owner FROM village_houses h
     JOIN village_apps a ON a.member_id = h.member_id AND a.plot = h.plot WHERE h.plot = ?`).bind(plot).first();
  if (!row || (row.status !== "approved" && !(s && s.sub === row.owner))) return json({ ok: false, error: "แปลงนี้ยังไม่มีบ้าน" }, 404);
  return json({ ok: true, plot, owner: row.display_name, mine: !!(s && s.sub === row.owner), house: JSON.parse(row.data), image: row.image, size: plotSize(plot), updatedAt: row.updated_at });
}

export async function onRequestPost({ request, env }) {
  if (!authConfigured(env)) return json({ ok: false, error: "ระบบสมาชิกยังไม่พร้อม" }, 503);
  const s = await readSession(request, env);
  if (!s) return json({ ok: false, error: "เข้าสู่ระบบด้วย LINE ก่อน" }, 401);
  const db = env.MEMBERS_DB;
  if (!(await getMember(db, s.sub))) return json({ ok: false, error: "เข้าสู่ระบบด้วย LINE ก่อน" }, 401);
  await ensureVillageSchema(db);
  const app = await db.prepare("SELECT plot, status FROM village_apps WHERE member_id = ?").bind(s.sub).first();
  if (!app || !app.plot || app.status === "rejected") return json({ ok: false, error: "ยังไม่มีแปลงที่ดินใน Village จองแปลงก่อนที่ arstinla.com/village", needPlot: true }, 409);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "ข้อมูลไม่ถูกต้อง" }, 400); }
  const c = cleanHouse(body);
  if (c.error) return json({ ok: false, error: c.error }, 400);
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO village_houses (member_id, plot, data, image, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(member_id) DO UPDATE SET plot = excluded.plot, data = excluded.data, image = excluded.image, updated_at = excluded.updated_at`)
    .bind(s.sub, app.plot, JSON.stringify(c.house), c.image, now).run();
  return json({ ok: true, plot: app.plot, status: app.status, size: plotSize(app.plot) });
}
