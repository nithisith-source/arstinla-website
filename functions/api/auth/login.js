// GET /api/auth/login?next=/tools/xxx/&consent=1  → redirect to LINE Login
import { authConfigured, sign, randomId, cookie, STATE_COOKIE, safeNext, isSecure, lineAuthUrl } from "../../_lib/member.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  if (!authConfigured(env)) {
    return Response.redirect(`${url.origin}/member/?error=setup&next=${encodeURIComponent(next)}`, 302);
  }
  if (url.searchParams.get("consent") !== "1") {
    return Response.redirect(`${url.origin}/member/?error=consent&next=${encodeURIComponent(next)}`, 302);
  }
  const state = randomId();
  const nonce = randomId();
  const stateToken = await sign({ state, nonce, next, consent: 1, exp: Date.now() + 10 * 60 * 1000 }, env.SESSION_SECRET);
  const auth = new URL("/oauth2/v2.1/authorize", lineAuthUrl(env));
  auth.search = new URLSearchParams({
    response_type: "code",
    client_id: env.LINE_LOGIN_CHANNEL_ID,
    redirect_uri: `${url.origin}/api/auth/callback`,
    state,
    nonce,
    scope: "profile openid",
    bot_prompt: "aggressive"
  }).toString();
  const setCookie = cookie(STATE_COOKIE, stateToken, { maxAge: 600, secure: isSecure(request) });
  // format=json: the page puts the LINE URL straight on the button, so a tap is a Universal Link
  // and the phone opens the LINE app (no QR code / email) instead of following a redirect.
  if (url.searchParams.get("format") === "json") {
    return new Response(JSON.stringify({ url: auth.toString() }), {
      headers: { "Content-Type": "application/json", "Set-Cookie": setCookie, "Cache-Control": "no-store" }
    });
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: auth.toString(),
      "Set-Cookie": setCookie,
      "Cache-Control": "no-store"
    }
  });
}
