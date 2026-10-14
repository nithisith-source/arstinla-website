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
  return new Response(null, {
    status: 302,
    headers: {
      Location: auth.toString(),
      "Set-Cookie": cookie(STATE_COOKIE, stateToken, { maxAge: 600, secure: isSecure(request) }),
      "Cache-Control": "no-store"
    }
  });
}
