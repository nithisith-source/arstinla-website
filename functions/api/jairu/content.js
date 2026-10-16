// GET /api/jairu/content → lessons 8–30 of ใจรู้, only for members whose current tier is Pro.
import { readSession, json, getMember, effectiveTier, tierRank, authConfigured } from "../../_lib/member.js";
import { PRO_DAYS } from "../../_lib/jairu-pro.js";

export async function onRequestGet({ request, env }) {
  if (!authConfigured(env)) return json({ error: "not_configured" }, 503);
  const s = await readSession(request, env);
  if (!s) return json({ error: "login_required" }, 401);
  const m = await getMember(env.MEMBERS_DB, s.sub);
  if (!m || tierRank(effectiveTier(m)) < tierRank("pro")) return json({ error: "pro_required" }, 403);
  return json({ from: 8, days: PRO_DAYS });
}
