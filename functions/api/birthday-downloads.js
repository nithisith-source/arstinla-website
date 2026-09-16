function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function validDay(value) {
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

function keyForDay(day) {
  return `birthday-wallpaper:day:${String(day).padStart(2, "0")}`;
}

async function readNumber(store, key) {
  const value = Number(await store.get(key));
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export async function onRequestGet({ request, env }) {
  const day = validDay(new URL(request.url).searchParams.get("day"));

  if (!day) return json({ ok: false, error: "Invalid day" }, 400);

  if (!env.BIRTHDAY_STATS) {
    return json({ ok: false, error: "Download counter is not configured" }, 503);
  }

  const [count, total] = await Promise.all([
    readNumber(env.BIRTHDAY_STATS, keyForDay(day)),
    readNumber(env.BIRTHDAY_STATS, "birthday-wallpaper:total")
  ]);

  return json({ ok: true, day, count, total });
}

export async function onRequestPost({ request, env }) {
  if (!env.BIRTHDAY_STATS) {
    return json({ ok: false, error: "Download counter is not configured" }, 503);
  }

  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if ((origin && origin !== requestUrl.origin) || (fetchSite && fetchSite !== "same-origin")) {
    return json({ ok: false, error: "Forbidden" }, 403);
  }

  let body;
  try {
    body = await request.json();
  }
  catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const day = validDay(body?.day);
  if (!day) return json({ ok: false, error: "Invalid day" }, 400);

  const dayKey = keyForDay(day);
  const totalKey = "birthday-wallpaper:total";
  const [currentDay, currentTotal] = await Promise.all([
    readNumber(env.BIRTHDAY_STATS, dayKey),
    readNumber(env.BIRTHDAY_STATS, totalKey)
  ]);
  const count = currentDay + 1;
  const total = currentTotal + 1;

  await Promise.all([
    env.BIRTHDAY_STATS.put(dayKey, String(count)),
    env.BIRTHDAY_STATS.put(totalKey, String(total))
  ]);

  return json({ ok: true, day, count, total });
}
