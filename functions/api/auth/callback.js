// GET /api/auth/callback  ← LINE redirects here after the user approves
import {
  authConfigured, verify, getCookie, cookie, STATE_COOKIE, safeNext, isSecure,
  upsertMember, sessionCookie, lineApiUrl
} from "../../_lib/member.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const fail = (code, next = "/") =>
    new Response(null, {
      status: 302,
      headers: {
        Location: `${url.origin}/member/?error=${code}&next=${encodeURIComponent(next)}`,
        "Set-Cookie": cookie(STATE_COOKIE, "", { maxAge: 0, secure: isSecure(request) }),
        "Cache-Control": "no-store"
      }
    });

  if (!authConfigured(env)) return fail("setup");
  const saved = await verify(getCookie(request, STATE_COOKIE), env.SESSION_SECRET);
  const next = safeNext(saved && saved.next);
  if (url.searchParams.get("error")) return fail("cancelled", next);
  if (!saved || saved.state !== url.searchParams.get("state")) return fail("state", next);
  const code = url.searchParams.get("code");
  if (!code) return fail("cancelled", next);

  try {
    const api = lineApiUrl(env);
    const tokenRes = await fetch(`${api}/oauth2/v2.1/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${url.origin}/api/auth/callback`,
        client_id: env.LINE_LOGIN_CHANNEL_ID,
        client_secret: env.LINE_LOGIN_CHANNEL_SECRET
      })
    });
    if (!tokenRes.ok) return fail("token", next);
    const token = await tokenRes.json();

    const verifyRes = await fetch(`${api}/oauth2/v2.1/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: token.id_token, client_id: env.LINE_LOGIN_CHANNEL_ID, nonce: saved.nonce })
    });
    if (!verifyRes.ok) return fail("verify", next);
    const idt = await verifyRes.json();
    if (!idt.sub) return fail("verify", next);

    let friend = false;
    try {
      const fr = await fetch(`${api}/friendship/v1/status`, { headers: { Authorization: `Bearer ${token.access_token}` } });
      if (fr.ok) friend = Boolean((await fr.json()).friendFlag);
    } catch { /* optional */ }

    const member = await upsertMember(env.MEMBERS_DB, {
      id: idt.sub,
      name: idt.name,
      picture: idt.picture,
      email: idt.email,
      friend
    });

    const headers = new Headers({ Location: `${url.origin}${next}`, "Cache-Control": "no-store" });
    headers.append("Set-Cookie", await sessionCookie(member, env, request));
    headers.append("Set-Cookie", cookie(STATE_COOKIE, "", { maxAge: 0, secure: isSecure(request) }));
    return new Response(null, { status: 302, headers });
  } catch (err) {
    console.error("LINE login failed", err);
    return fail("server", next);
  }
}
