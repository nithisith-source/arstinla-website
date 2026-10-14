// Shared helpers for the ARSTINLA member system (LINE Login + Cloudflare D1).
// No request handlers live here, so this file never becomes a public route.
//
// Required Cloudflare settings (Pages project → Settings):
//   Secrets   LINE_LOGIN_CHANNEL_ID, LINE_LOGIN_CHANNEL_SECRET, SESSION_SECRET
//   Binding   MEMBERS_DB  (D1 database)
//   Variable  MEMBER_GATE = "on"   ← turns the tool/app gate on (off by default)

export const SESSION_COOKIE = "arst_session";
export const STATE_COOKIE = "arst_login_state";
export const SESSION_DAYS = 30;

// Member levels, lowest to highest. Add more later (e.g. "studio") if needed.
export const TIERS = ["free", "pro"];
export const tierRank = tier => Math.max(0, TIERS.indexOf(tier || "free"));

// Which pages need which level. Paths are prefixes; the longest match wins.
// Everything under /tools/ and /apps/ needs at least a free account.
// To make a tool paid later, add e.g.  "/tools/massing-studio/": "pro"
export const GATED = {
  "/tools/": "free",
  "/apps/": "free",
  "/stories/": "free",
  "/media/": "free"
};

export function requiredTier(pathname) {
  let best = null;
  for (const prefix of Object.keys(GATED)) {
    if (pathname.startsWith(prefix) && (!best || prefix.length > best.length)) best = prefix;
  }
  return best ? GATED[best] : null;
}

export function gateEnabled(env) {
  return String(env.MEMBER_GATE || "").toLowerCase() === "on";
}

// Names (never values) of settings that are still missing — shown on /api/auth/me to help setup.
export function missingSettings(env) {
  return ["LINE_LOGIN_CHANNEL_ID", "LINE_LOGIN_CHANNEL_SECRET", "SESSION_SECRET", "MEMBERS_DB"].filter(k => !env[k]);
}

export function authConfigured(env) {
  return Boolean(env.LINE_LOGIN_CHANNEL_ID && env.LINE_LOGIN_CHANNEL_SECRET && env.SESSION_SECRET && env.MEMBERS_DB);
}

// LINE endpoints (overridable only for local testing).
export const lineAuthUrl = env => env.LINE_AUTH_BASE || "https://access.line.me";
export const lineApiUrl = env => env.LINE_API_BASE || "https://api.line.me";

/* ---------------- small utils ---------------- */

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function sign(payload, secret) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verify(token, secret) {
  if (!token || !secret || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), b64urlDecode(sig), enc.encode(body));
    if (!ok) return null;
    const data = JSON.parse(dec.decode(b64urlDecode(body)));
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

export function randomId(bytes = 16) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

export function cookie(name, value, { maxAge, path = "/", secure = true } = {}) {
  const bits = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, "HttpOnly", "SameSite=Lax"];
  if (secure) bits.push("Secure");
  if (maxAge !== undefined) bits.push(`Max-Age=${maxAge}`);
  return bits.join("; ");
}

export const isSecure = request => new URL(request.url).protocol === "https:";

// Only allow redirects back into this site.
export function safeNext(next) {
  const n = String(next || "");
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/";
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=UTF-8", "Cache-Control": "no-store", ...headers }
  });
}

/* ---------------- session ---------------- */

export async function readSession(request, env) {
  return verify(getCookie(request, SESSION_COOKIE), env.SESSION_SECRET);
}

export async function sessionCookie(member, env, request) {
  const token = await sign(
    { sub: member.id, name: member.name, pic: member.picture || "", tier: member.tier || "free", exp: Date.now() + SESSION_DAYS * 864e5 },
    env.SESSION_SECRET
  );
  return cookie(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400, secure: isSecure(request) });
}

/* ---------------- database ---------------- */

let schemaReady = false;
export async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      name TEXT,
      picture TEXT,
      email TEXT,
      tier TEXT NOT NULL DEFAULT 'free',
      tier_until TEXT,
      friend INTEGER DEFAULT 0,
      consent_at TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      last_login_at TEXT,
      login_count INTEGER DEFAULT 0
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS visits (
      member_id TEXT NOT NULL,
      path TEXT NOT NULL,
      at TEXT NOT NULL
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS visits_member ON visits(member_id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS visits_path ON visits(path)`)
  ]);
  schemaReady = true;
}

export async function getMember(db, id) {
  await ensureSchema(db);
  return db.prepare("SELECT * FROM members WHERE id = ?").bind(id).first();
}

// Paid levels can have an end date; once passed the member counts as free.
export function effectiveTier(member) {
  if (!member) return "free";
  if (member.tier_until && new Date(member.tier_until).getTime() < Date.now()) return "free";
  return member.tier || "free";
}

export async function upsertMember(db, profile) {
  await ensureSchema(db);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO members (id, name, picture, email, friend, consent_at, created_at, last_login_at, login_count)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?6, 1)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         picture = excluded.picture,
         email = COALESCE(excluded.email, members.email),
         friend = excluded.friend,
         last_login_at = excluded.last_login_at,
         login_count = members.login_count + 1`
    )
    .bind(profile.id, profile.name || "", profile.picture || "", profile.email || null, profile.friend ? 1 : 0, now)
    .run();
  return getMember(db, profile.id);
}

// Shortens tool URLs so stats group by tool, e.g. /tools/birthday/?day=3 → /tools/birthday/
export function toolKey(pathname) {
  const m = pathname.match(/^\/(tools|apps|stories)\/([^/]+)/);
  return m ? `/${m[1]}/${m[2]}/` : pathname;
}

export async function logVisit(db, memberId, pathname) {
  try {
    await ensureSchema(db);
    await db.prepare("INSERT INTO visits (member_id, path, at) VALUES (?, ?, ?)").bind(memberId, toolKey(pathname), new Date().toISOString()).run();
  } catch {
    /* stats are best-effort */
  }
}
