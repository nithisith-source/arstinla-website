// GET /api/auth/me  → current member (or {member:null})
import { readSession, json, getMember, effectiveTier, authConfigured, gateEnabled, missingSettings } from "../../_lib/member.js";

export async function onRequestGet({ request, env }) {
  const status = { configured: authConfigured(env), gate: gateEnabled(env) };
  if (!status.configured) return json({ member: null, ...status, missing: missingSettings(env), seen: Object.keys(env).filter(k => /LINE_LOGIN|SESSION|MEMBERS/i.test(k)) });
  const s = await readSession(request, env);
  if (!s) return json({ member: null, ...status });
  const m = await getMember(env.MEMBERS_DB, s.sub);
  if (!m) return json({ member: null, ...status });
  return json({
    member: { name: m.name, picture: m.picture, tier: effectiveTier(m), tierUntil: m.tier_until, friend: !!m.friend, since: m.created_at },
    ...status
  });
}
