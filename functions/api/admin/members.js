// Admin: list members, usage stats, change level.  Header: x-admin-key
import { json, ensureSchema, TIERS } from "../../_lib/member.js";

function denied(request, env) {
  const key = request.headers.get("x-admin-key") || "";
  return !env.ADMIN_KEY || key !== env.ADMIN_KEY;
}

export async function onRequestGet({ request, env }) {
  if (denied(request, env)) return json({ ok: false, error: "Unauthorized" }, 401);
  if (!env.MEMBERS_DB) return json({ ok: false, error: "MEMBERS_DB is not bound" }, 500);
  const db = env.MEMBERS_DB;
  await ensureSchema(db);
  const [members, tools] = await Promise.all([
    db.prepare(`SELECT m.*, (SELECT COUNT(*) FROM visits v WHERE v.member_id = m.id) AS visits,
                (SELECT MAX(at) FROM visits v WHERE v.member_id = m.id) AS last_visit
                FROM members m ORDER BY m.created_at DESC`).all(),
    db.prepare(`SELECT path, COUNT(*) AS visits, COUNT(DISTINCT member_id) AS members
                FROM visits GROUP BY path ORDER BY visits DESC`).all()
  ]);
  return json({ ok: true, tiers: TIERS, members: members.results || [], tools: tools.results || [] });
}

export async function onRequestPost({ request, env }) {
  if (denied(request, env)) return json({ ok: false, error: "Unauthorized" }, 401);
  if (!env.MEMBERS_DB) return json({ ok: false, error: "MEMBERS_DB is not bound" }, 500);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Bad JSON" }, 400); }
  const { id, tier, tierUntil, note } = body || {};
  if (!id) return json({ ok: false, error: "Missing id" }, 400);
  if (tier && !TIERS.includes(tier)) return json({ ok: false, error: "Unknown tier" }, 400);
  if (tierUntil && isNaN(Date.parse(tierUntil))) return json({ ok: false, error: "Bad date" }, 400);
  const db = env.MEMBERS_DB;
  await ensureSchema(db);
  const res = await db
    .prepare(`UPDATE members SET tier = COALESCE(?1, tier), tier_until = ?2, note = COALESCE(?3, note) WHERE id = ?4`)
    .bind(tier || null, tierUntil || null, note ?? null, id)
    .run();
  if (!res.meta || !res.meta.changes) return json({ ok: false, error: "Member not found" }, 404);
  const member = await db.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
  return json({ ok: true, member });
}
