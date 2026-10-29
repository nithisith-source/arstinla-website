// Admin: list village applications, approve/reject, store the world link.  Header: x-admin-key
import { json } from "../../_lib/member.js";
import { ensureVillageSchema, STATUSES, worldUrl } from "../../_lib/village.js";

const TIER_TH = { guest: "ผู้มาเยือน", resident: "ผู้อยู่อาศัย", owner: "เจ้าของบ้าน", developer: "ผู้พัฒนาโครงการ" };

// Push a LINE message from OA @arstinla to the applicant (works only if they are a friend of the OA).
async function notify(env, app, origin) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) return { sent: false, error: "LINE token is not configured" };
  const page = `${origin}/village/`;
  let text;
  if (app.status === "approved") {
    text = `🎉 ใบสมัคร ARSTINLA Village ของคุณได้รับการอนุมัติแล้ว\n\nชื่อในหมู่บ้าน: ${app.display_name}\nระดับ: ${TIER_TH[app.tier] || app.tier}` +
      (app.plot ? `\nแปลงที่ดิน: ${app.plot}` : "") +
      `\n\nเข้าหมู่บ้าน: ${app.world_link || worldUrl(env)}\nดูใบสมัคร: ${page}\n\nยินดีต้อนรับสู่หมู่บ้านครับ 🏡`;
  } else if (app.status === "rejected") {
    text = `ใบสมัคร ARSTINLA Village (${app.display_name}) ยังไม่ผ่านการอนุมัติครับ\nแก้ไขแล้วส่งใหม่ได้ที่ ${page}\nหรือพิมพ์ถามในแชตนี้ได้เลยครับ`;
  } else return { sent: false, error: "No message for this status" };
  try {
    const r = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
      body: JSON.stringify({ to: app.member_id, messages: [{ type: "text", text }] })
    });
    if (r.ok) return { sent: true };
    const err = await r.json().catch(() => ({}));
    return { sent: false, error: r.status === 400 || r.status === 403 ? "ผู้สมัครยังไม่ได้เป็นเพื่อน LINE OA หรือบล็อก OA อยู่" : (err.message || `LINE API ${r.status}`) };
  } catch { return { sent: false, error: "Could not reach LINE" }; }
}

function denied(request, env) {
  const key = request.headers.get("x-admin-key") || "";
  return !env.ADMIN_KEY || key !== env.ADMIN_KEY;
}

export async function onRequestGet({ request, env }) {
  if (denied(request, env)) return json({ ok: false, error: "Unauthorized" }, 401);
  if (!env.MEMBERS_DB) return json({ ok: false, error: "MEMBERS_DB is not bound" }, 500);
  const db = env.MEMBERS_DB;
  await ensureVillageSchema(db);
  const rows = await db
    .prepare(`SELECT v.*, m.name AS line_name, m.picture, m.tier AS site_tier, m.friend
              FROM village_apps v LEFT JOIN members m ON m.id = v.member_id
              ORDER BY CASE v.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, v.updated_at DESC`)
    .all();
  return json({ ok: true, apps: rows.results || [] });
}

export async function onRequestPost({ request, env }) {
  if (denied(request, env)) return json({ ok: false, error: "Unauthorized" }, 401);
  if (!env.MEMBERS_DB) return json({ ok: false, error: "MEMBERS_DB is not bound" }, 500);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Bad JSON" }, 400); }
  const { id, status, worldLink, note } = body || {};
  if (!id) return json({ ok: false, error: "Missing id" }, 400);
  if (status && !STATUSES.includes(status)) return json({ ok: false, error: "Unknown status" }, 400);
  if (worldLink && !/^https:\/\//.test(worldLink)) return json({ ok: false, error: "World link must start with https://" }, 400);
  const db = env.MEMBERS_DB;
  await ensureVillageSchema(db);
  const before = await db.prepare("SELECT status FROM village_apps WHERE member_id = ?").bind(id).first();
  try {
    const res = await db
      .prepare(`UPDATE village_apps SET status = COALESCE(?1, status), world_link = COALESCE(?2, world_link),
                note = COALESCE(?3, note), updated_at = ?4 WHERE member_id = ?5`)
      .bind(status || null, worldLink ?? null, note ?? null, new Date().toISOString(), id)
      .run();
    if (!res.meta || !res.meta.changes) return json({ ok: false, error: "Application not found" }, 404);
  } catch (e) {
    // Re-opening a rejected booking whose plot someone else took since.
    if (/UNIQUE/i.test(String(e?.message || e))) return json({ ok: false, error: "That plot is already booked by someone else" }, 409);
    throw e;
  }
  const app = await db.prepare("SELECT * FROM village_apps WHERE member_id = ?").bind(id).first();
  // Tell the applicant on LINE when the status actually changes to approved / rejected (or when asked to resend).
  let notified = null;
  const changed = before && app && before.status !== app.status;
  if (app && (app.status === "approved" || app.status === "rejected") && (changed || body.resend)) {
    notified = await notify(env, app, new URL(request.url).origin);
  }
  return json({ ok: true, app, notified });
}
