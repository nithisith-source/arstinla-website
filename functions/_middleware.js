// Member gate for /tools/, /apps/, /stories/ and /media/ pages.
// Inactive until MEMBER_GATE = "on" and the LINE Login + D1 settings exist,
// so deploying this file changes nothing on its own.
import {
  gateEnabled, authConfigured, requiredTier, tierRank, readSession,
  getMember, effectiveTier, logVisit, sessionCookie
} from "./_lib/member.js";

const isPage = pathname => pathname.endsWith("/") || pathname.endsWith(".html") || !/\.[a-z0-9]+$/i.test(pathname);
// Member-only downloadable files (e.g. story e-books) — locked like pages.
const isLockedFile = pathname => /\/downloads\/[^/]+\.(epub|pdf|zip)$/i.test(pathname);

export async function onRequest(context) {
  const { request, env, next, waitUntil } = context;
  const url = new URL(request.url);
  // Google Search Console verification file — served verbatim (Pages would otherwise 308 *.html → extensionless).
  if (url.pathname === "/googleeb08599e4cee6cba.html") {
    return new Response("google-site-verification: googleeb08599e4cee6cba.html", { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  const need = requiredTier(url.pathname);

  if (!need || request.method !== "GET" || !(isPage(url.pathname) || isLockedFile(url.pathname)) || !gateEnabled(env) || !authConfigured(env)) {
    return next();
  }

  const target = url.pathname + url.search;
  const toLogin = extra =>
    new Response(null, {
      status: 302,
      headers: { Location: `/member/?next=${encodeURIComponent(target)}${extra || ""}`, "Cache-Control": "no-store" }
    });

  const session = await readSession(request, env);
  if (!session) return toLogin();

  let refreshed = null;
  if (tierRank(need) > tierRank("free")) {
    // Paid page: check the current level in the database, not the cookie.
    const member = await getMember(env.MEMBERS_DB, session.sub);
    if (!member) return toLogin();
    const tier = effectiveTier(member);
    if (tierRank(tier) < tierRank(need)) return toLogin(`&need=${encodeURIComponent(need)}`);
    if (tier !== session.tier) refreshed = await sessionCookie(member, env, request);
  }

  // Count only real page opens, not background fetches from an app's offline cache.
  const dest = request.headers.get("Sec-Fetch-Dest");
  if ((!dest || dest === "document") && isPage(url.pathname)) waitUntil(logVisit(env.MEMBERS_DB, session.sub, url.pathname));
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "private, no-store");
  if (refreshed) out.headers.append("Set-Cookie", refreshed);
  return out;
}
