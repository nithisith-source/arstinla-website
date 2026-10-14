// GET or POST /api/auth/logout
import { cookie, SESSION_COOKIE, isSecure, safeNext } from "../../_lib/member.js";

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next") || "/member/");
  return new Response(null, {
    status: 302,
    headers: { Location: `${url.origin}${next}`, "Set-Cookie": cookie(SESSION_COOKIE, "", { maxAge: 0, secure: isSecure(request) }), "Cache-Control": "no-store" }
  });
}
