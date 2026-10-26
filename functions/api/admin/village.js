// Admin: list village applications, approve/reject, store the world link.  Header: x-admin-key
import { json } from "../../_lib/member.js";
import { ensureVillageSchema, STATUSES } from "../../_lib/village.js";

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
  return json({ ok: true, app });
}
