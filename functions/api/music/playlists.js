// GET /api/music/playlists → this member's own playlists (LINE login)
// PUT /api/music/playlists {playlists:[{id,name,ids}], updatedAt} → save them, so they follow the member to every device
import { json, readSession, authConfigured } from "../../_lib/member.js";

async function ensure(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS member_playlists (member_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)").run();
}

function clean(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 50).map((p, i) => ({
    id: String(p?.id || `p${i}`).replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || `p${i}`,
    name: String(p?.name || "เพลย์ลิสต์").trim().slice(0, 40),
    ids: (Array.isArray(p?.ids) ? p.ids : []).map(x => String(x).slice(0, 200)).slice(0, 500)
  }));
}

export async function onRequestGet({ request, env }) {
  if (!authConfigured(env)) return json({ ok: false, loggedIn: false }, 200);
  const s = await readSession(request, env);
  if (!s) return json({ ok: true, loggedIn: false });
  await ensure(env.MEMBERS_DB);
  const row = await env.MEMBERS_DB.prepare("SELECT data, updated_at FROM member_playlists WHERE member_id = ?").bind(s.sub).first();
  return json({ ok: true, loggedIn: true, playlists: row ? JSON.parse(row.data) : null, updatedAt: row ? row.updated_at : 0 });
}

export async function onRequestPut({ request, env }) {
  if (!authConfigured(env)) return json({ ok: false, error: "ระบบสมาชิกยังไม่พร้อม" }, 503);
  const s = await readSession(request, env);
  if (!s) return json({ ok: false, error: "กรุณาเข้าสู่ระบบด้วย LINE" }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "ข้อมูลไม่ถูกต้อง" }, 400); }
  const data = JSON.stringify(clean(body?.playlists));
  if (data.length > 200000) return json({ ok: false, error: "เพลย์ลิสต์ใหญ่เกินไป" }, 413);
  const updatedAt = Number(body?.updatedAt) || Date.now();
  await ensure(env.MEMBERS_DB);
  await env.MEMBERS_DB.prepare("INSERT INTO member_playlists (member_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(member_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
    .bind(s.sub, data, updatedAt).run();
  return json({ ok: true, updatedAt });
}
