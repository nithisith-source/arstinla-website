// Shows the public ID of the LINE Official Account that the contact form
// already sends to (same channel token), so the site's LINE links can use it.
// Read-only: returns only public profile fields, never the token.
export async function onRequestGet({ request, env }) {
  const wantsJson = new URL(request.url).searchParams.get("format") === "json";

  if (!env.LINE_CHANNEL_ACCESS_TOKEN) {
    return reply(wantsJson, { ok: false, error: "LINE token is not configured" }, 500);
  }

  let info;
  try {
    const res = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` }
    });
    if (!res.ok) {
      return reply(wantsJson, { ok: false, error: `LINE API error ${res.status}` }, 502);
    }
    info = await res.json();
  } catch (err) {
    return reply(wantsJson, { ok: false, error: "Could not reach LINE" }, 502);
  }

  const id = info.premiumId || info.basicId || "";
  const data = {
    ok: true,
    displayName: info.displayName || "",
    basicId: info.basicId || "",
    premiumId: info.premiumId || "",
    addFriendUrl: id ? `https://line.me/R/ti/p/${encodeURIComponent(id)}` : ""
  };
  return reply(wantsJson, data, 200);
}

function reply(wantsJson, data, status) {
  if (wantsJson) {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "Cache-Control": "public, max-age=3600"
      }
    });
  }
  const esc = s => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const body = data.ok
    ? `<p>บัญชี LINE ที่ฟอร์มบนเว็บส่งข้อความเข้า</p>
       <h1>${esc(data.displayName)}</h1>
       <p class="id">${esc(data.premiumId || data.basicId)}</p>
       ${data.premiumId ? `<p class="sub">Basic ID: ${esc(data.basicId)}</p>` : ""}
       <p><a href="${esc(data.addFriendUrl)}">ทดสอบลิงก์เพิ่มเพื่อน →</a></p>`
    : `<h1>ดึงข้อมูลไม่สำเร็จ</h1><p>${esc(data.error)}</p>`;
  return new Response(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LINE account</title>
<style>body{font-family:system-ui,sans-serif;background:#f3f0e8;color:#171816;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center}h1{margin:.2em 0;font-size:1.6rem}.id{font-size:2.4rem;font-weight:700;color:#a65335;margin:.3em 0}.sub{color:#67665f}a{color:#171816}</style></head>
<body><div>${body}</div></body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-store" }
  });
}
