// GET /api/auth/me  → current member (or {member:null})
import { readSession, json, getMember, effectiveTier, authConfigured, gateEnabled, missingSettings } from "../../_lib/member.js";

export async function onRequestGet({ request, env }) {
  const status = { configured: authConfigured(env), gate: gateEnabled(env) };
  if (!status.configured) return json({ member: null, ...status, missing: missingSettings(env) });
  const s = await readSession(request, env);
  if (!s) return json({ member: null, ...status });
  const m = await getMember(env.MEMBERS_DB, s.sub);
  if (!m) return json({ member: null, ...status });
  // ?refreshFriend=1 — re-check OA friendship (user may have added @arstinla after logging in).
  // The OA bot can only read a profile of a user who is its friend, so 200 = friend.
  if (!m.friend && new URL(request.url).searchParams.get("refreshFriend") === "1" && env.LINE_CHANNEL_ACCESS_TOKEN) {
    try {
      const r = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(m.id)}`, {
        headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` }
      });
      if (r.ok) {
        await env.MEMBERS_DB.prepare("UPDATE members SET friend = 1 WHERE id = ?").bind(m.id).run();
        m.friend = 1;
      }
    } catch {}
  }
  return json({
    member: { uid: m.id, name: m.name, picture: m.picture, tier: effectiveTier(m), tierUntil: m.tier_until, friend: !!m.friend, since: m.created_at },
    ...status
  });
}
