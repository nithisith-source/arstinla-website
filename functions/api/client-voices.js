const STORE_PATH = "client-voices-data.json";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const INVITE_LIFETIME_DAYS = 90;

class RequestError extends Error {
  constructor(message, status = 400, details = "") {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}

function clean(value, max = 500, multiline = false) {
  const text = String(value ?? "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);

  return multiline
    ? text.replace(/\r\n?/g, "\n")
    : text.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ");
}

function cleanCommitLabel(value) {
  return clean(value, 60).replace(/[^\p{L}\p{N} ._+@&'-]/gu, "");
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || "").replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  return base64ToBytes(
    normalized + "=".repeat((4 - normalized.length % 4) % 4)
  );
}

function normalizeStore(value) {
  return {
    version: 1,
    approved: Array.isArray(value?.approved) ? value.approved : [],
    pending: Array.isArray(value?.pending) ? value.pending : []
  };
}

function cloneStore(store) {
  return JSON.parse(JSON.stringify(store));
}

function requireAdmin(request, env) {
  const supplied = request.headers.get("x-admin-key") || "";

  if (!env.ADMIN_KEY || supplied !== env.ADMIN_KEY) {
    throw new RequestError("Unauthorized", 401);
  }
}

function getRepository(env) {
  const owner = clean(env.GITHUB_OWNER, 120);
  const repo = clean(env.GITHUB_REPO, 120);
  const branch = clean(env.GITHUB_BRANCH || "main", 120);
  const token = env.GITHUB_TOKEN;

  if (!owner || !repo || !branch || !token) {
    throw new RequestError("GitHub environment variables missing", 500);
  }

  return { owner, repo, branch, token };
}

function githubHeaders(repository) {
  return {
    Authorization: `Bearer ${repository.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ARSTINLA-Client-Voices"
  };
}

function githubContentUrl(repository, path) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/contents/${encodedPath}`;
}

async function readStore(env) {
  const repository = getRepository(env);
  const url = `${githubContentUrl(repository, STORE_PATH)}?ref=${encodeURIComponent(repository.branch)}`;
  const response = await fetch(url, { headers: githubHeaders(repository) });

  if (response.status === 404) {
    return { repository, sha: null, data: normalizeStore(null) };
  }

  if (!response.ok) {
    throw new RequestError(
      "อ่านข้อมูล Client Voices ไม่สำเร็จ",
      502,
      await response.text()
    );
  }

  const file = await response.json();

  try {
    const source = new TextDecoder().decode(base64ToBytes(file.content));
    return {
      repository,
      sha: file.sha,
      data: normalizeStore(JSON.parse(source))
    };
  }
  catch {
    throw new RequestError("รูปแบบข้อมูล Client Voices ไม่ถูกต้อง", 500);
  }
}

async function writeStore(snapshot, data, message) {
  const source = `${JSON.stringify(normalizeStore(data), null, 2)}\n`;
  const payload = {
    message,
    content: bytesToBase64(new TextEncoder().encode(source)),
    branch: snapshot.repository.branch
  };

  if (snapshot.sha) payload.sha = snapshot.sha;

  return fetch(githubContentUrl(snapshot.repository, STORE_PATH), {
    method: "PUT",
    headers: {
      ...githubHeaders(snapshot.repository),
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

async function mutateStore(env, message, mutation) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snapshot = await readStore(env);
    const working = cloneStore(snapshot.data);
    const mutationResult = await mutation(working);

    if (mutationResult?.changed === false) {
      return mutationResult.value;
    }

    const response = await writeStore(snapshot, working, message);

    if (response.ok) return mutationResult?.value;

    if ([409, 422].includes(response.status) && attempt < 2) continue;

    throw new RequestError(
      "บันทึกข้อมูล Client Voices ไม่สำเร็จ",
      502,
      await response.text()
    );
  }

  throw new RequestError("ข้อมูลมีการเปลี่ยนแปลงพร้อมกัน กรุณาลองใหม่", 409);
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`ARSTINLA client voices invite:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function createInvitation(payload, secret) {
  const encodedPayload = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await hmacKey(secret),
      new TextEncoder().encode(encodedPayload)
    )
  );

  return `${encodedPayload}.${bytesToBase64Url(signature)}`;
}

async function verifyInvitation(token, secret) {
  const parts = clean(token, 3000).split(".");

  if (parts.length !== 2) {
    throw new RequestError("ลิงก์เชิญไม่ถูกต้องหรือหมดอายุ", 403);
  }

  let valid = false;

  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      base64UrlToBytes(parts[1]),
      new TextEncoder().encode(parts[0])
    );
  }
  catch {
    valid = false;
  }

  if (!valid) throw new RequestError("ลิงก์เชิญไม่ถูกต้องหรือหมดอายุ", 403);

  let payload;

  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0])));
  }
  catch {
    throw new RequestError("ลิงก์เชิญไม่ถูกต้องหรือหมดอายุ", 403);
  }

  if (
    !payload?.projectName ||
    !Number.isFinite(Number(payload.exp)) ||
    Number(payload.exp) < Date.now()
  ) {
    throw new RequestError("ลิงก์เชิญไม่ถูกต้องหรือหมดอายุ", 403);
  }

  return payload;
}

async function invitationHash(token) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
  );
  return bytesToBase64Url(digest);
}

async function encryptionKey(secret) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`ARSTINLA encrypted pending voices:${secret}`)
  );

  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptRecord(record, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await encryptionKey(secret),
      new TextEncoder().encode(JSON.stringify(record))
    )
  );

  return {
    id: record.id,
    inviteHash: record.inviteHash,
    submittedAt: record.submittedAt,
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(ciphertext)
  };
}

async function decryptRecord(entry, secret) {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(entry.iv) },
    await encryptionKey(secret),
    base64UrlToBytes(entry.ciphertext)
  );

  return JSON.parse(new TextDecoder().decode(plain));
}

function normalizeSocialUrl(value) {
  const source = clean(value, 400);
  if (!source) return "";

  let url;
  try {
    url = new URL(source);
  }
  catch {
    throw new RequestError("กรุณาใส่ลิงก์ Facebook หรือ Instagram ให้ถูกต้อง");
  }

  const hostname = url.hostname.toLowerCase();
  const allowed = [
    "facebook.com",
    "www.facebook.com",
    "m.facebook.com",
    "fb.com",
    "www.fb.com",
    "instagram.com",
    "www.instagram.com"
  ];

  if (url.protocol !== "https:" || !allowed.includes(hostname)) {
    throw new RequestError("รองรับเฉพาะลิงก์ Facebook หรือ Instagram แบบ https เท่านั้น");
  }

  url.hash = "";
  return url.toString();
}

function parsePhoto(photo) {
  if (!photo) return null;

  const type = clean(photo.type, 80).toLowerCase();
  const accepted = ["image/jpeg", "image/png", "image/webp"];

  if (!accepted.includes(type)) {
    throw new RequestError("รองรับรูป JPG, PNG หรือ WebP เท่านั้น");
  }

  let bytes;
  try {
    bytes = base64ToBytes(photo.data);
  }
  catch {
    throw new RequestError("ไฟล์รูปภาพไม่ถูกต้อง");
  }

  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    throw new RequestError("รูปภาพต้องมีขนาดไม่เกิน 2 MB");
  }

  const validJpeg = type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8;
  const validPng = type === "image/png" && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const validWebp = type === "image/webp" && new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP";

  if (!validJpeg && !validPng && !validWebp) {
    throw new RequestError("เนื้อหาไฟล์รูปภาพไม่ตรงกับประเภทไฟล์");
  }

  return {
    name: clean(photo.name, 160),
    type,
    data: bytesToBase64(bytes)
  };
}

function applyEditableFields(record, edits = {}) {
  const next = { ...record };
  const clientName = clean(edits.clientName ?? record.clientName, 100);
  const projectName = clean(edits.projectName ?? record.projectName, 140);
  const service = clean(edits.service ?? record.service, 140);
  const comment = clean(edits.comment ?? record.comment, 1500, true);
  const rating = Number(edits.rating ?? record.rating);

  if (!clientName || !projectName || !comment) {
    throw new RequestError("กรุณากรอกชื่อ โครงการ และความคิดเห็นให้ครบ");
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new RequestError("คะแนนต้องอยู่ระหว่าง 1 ถึง 5");
  }

  next.clientName = clientName;
  next.projectName = projectName;
  next.service = service;
  next.comment = comment;
  next.rating = rating;
  next.socialUrl = normalizeSocialUrl(edits.socialUrl ?? record.socialUrl);
  return next;
}

async function uploadApprovedPhoto(env, record) {
  if (!record.photo?.data) return "";

  const extension = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  }[record.photo.type];

  if (!extension) throw new RequestError("ประเภทไฟล์รูปภาพไม่ถูกต้อง");

  const repository = getRepository(env);
  const path = `assets/client-voices/${record.id}.${extension}`;
  const url = githubContentUrl(repository, path);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existingResponse = await fetch(
      `${url}?ref=${encodeURIComponent(repository.branch)}`,
      { headers: githubHeaders(repository) }
    );

    let sha;
    if (existingResponse.ok) sha = (await existingResponse.json()).sha;
    else if (existingResponse.status !== 404) {
      throw new RequestError("ตรวจสอบรูป Client Voice ไม่สำเร็จ", 502, await existingResponse.text());
    }

    const payload = {
      message: `Add Client Voice photo: ${cleanCommitLabel(record.projectName) || record.id}`,
      content: record.photo.data,
      branch: repository.branch
    };
    if (sha) payload.sha = sha;

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        ...githubHeaders(repository),
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) return `/${path}`;
    if ([409, 422].includes(response.status) && attempt < 2) continue;

    throw new RequestError("อัปโหลดรูป Client Voice ไม่สำเร็จ", 502, await response.text());
  }

  throw new RequestError("อัปโหลดรูป Client Voice ไม่สำเร็จ กรุณาลองใหม่", 409);
}

async function notifyLine(env, record) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN || !env.LINE_USER_ID) return;

  const text = `💬 ARSTINLA — CLIENT VOICE\n\nมีความคิดเห็นใหม่รอตรวจสอบ\n\nลูกค้า: ${record.clientName}\nโครงการ: ${record.projectName}\nคะแนน: ${record.rating}/5\n\nกรุณาเปิด Client Voices Manager เพื่ออนุมัติ`;

  try {
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        to: env.LINE_USER_ID,
        messages: [{ type: "text", text }]
      })
    });
  }
  catch (error) {
    console.error("Client Voice LINE notification failed", error?.message || error);
  }
}

function errorResponse(error) {
  const status = Number(error?.status) || 500;
  return json({
    ok: false,
    error: error?.message || "เกิดข้อผิดพลาด กรุณาลองใหม่",
    ...(error?.details ? { details: error.details } : {})
  }, status);
}

export async function onRequestGet({ request, env }) {
  try {
    const snapshot = await readStore(env);

    if (new URL(request.url).searchParams.get("view") === "public") {
      const approved = snapshot.data.approved
        .filter(item => item?.published !== false)
        .map(item => ({
          id: item.id,
          clientName: item.clientName,
          projectName: item.projectName,
          service: item.service,
          comment: item.comment,
          rating: item.rating,
          socialUrl: item.socialUrl,
          photo: item.photo,
          approvedAt: item.approvedAt
        }))
        .sort((left, right) => String(right.approvedAt || "").localeCompare(String(left.approvedAt || "")));

      return json({ ok: true, approved });
    }

    requireAdmin(request, env);
    const pending = [];

    for (const entry of snapshot.data.pending) {
      try {
        const record = await decryptRecord(entry, env.ADMIN_KEY);
        pending.push({
          ...record,
          photoDataUrl: record.photo?.data
            ? `data:${record.photo.type};base64,${record.photo.data}`
            : "",
          photo: undefined
        });
      }
      catch {
        pending.push({
          id: entry.id,
          submittedAt: entry.submittedAt,
          unreadable: true
        });
      }
    }

    pending.sort((left, right) => String(right.submittedAt || "").localeCompare(String(left.submittedAt || "")));
    const approved = [...snapshot.data.approved]
      .sort((left, right) => String(right.approvedAt || "").localeCompare(String(left.approvedAt || "")));

    return json({ ok: true, pending, approved });
  }
  catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const action = clean(body?.action, 40).toLowerCase();

    if (action === "invite") {
      requireAdmin(request, env);

      const clientName = clean(body.clientName, 100);
      const projectName = clean(body.projectName, 140);

      if (!projectName) throw new RequestError("กรุณากรอกชื่อโครงการ");

      const expiresAt = Date.now() + INVITE_LIFETIME_DAYS * 24 * 60 * 60 * 1000;
      const token = await createInvitation({
        version: 1,
        clientName,
        projectName,
        exp: expiresAt
      }, env.ADMIN_KEY);

      const origin = new URL(request.url).origin;
      return json({
        ok: true,
        inviteUrl: `${origin}/client-voices/submit/?invite=${encodeURIComponent(token)}`,
        expiresAt: new Date(expiresAt).toISOString()
      });
    }

    if (action !== "submit") throw new RequestError("คำขอไม่ถูกต้อง");

    if (body.website) return json({ ok: true });
    if (!env.ADMIN_KEY) throw new RequestError("ระบบยังไม่พร้อมรับความคิดเห็น", 500);

    const invitation = await verifyInvitation(body.inviteToken, env.ADMIN_KEY);

    if (!body.consent) {
      throw new RequestError("กรุณายืนยันความยินยอมก่อนส่งความคิดเห็น");
    }

    const submittedAt = new Date().toISOString();
    const id = crypto.randomUUID();
    const record = applyEditableFields({
      id,
      inviteHash: await invitationHash(body.inviteToken),
      clientName: clean(body.clientName || invitation.clientName, 100),
      projectName: clean(invitation.projectName, 140),
      service: clean(body.service, 140),
      comment: clean(body.comment, 1500, true),
      rating: Number(body.rating),
      socialUrl: body.socialUrl,
      photo: parsePhoto(body.photo),
      submittedAt,
      consentAt: submittedAt
    });

    const encrypted = await encryptRecord(record, env.ADMIN_KEY);

    await mutateStore(
      env,
      `Receive Client Voice: ${cleanCommitLabel(record.projectName) || "Project"}`,
      store => {
        const alreadyUsed = [
          ...store.pending,
          ...store.approved
        ].some(item => item.inviteHash === record.inviteHash);

        if (alreadyUsed) {
          throw new RequestError("ลิงก์นี้ถูกใช้ส่งความคิดเห็นแล้ว กรุณาติดต่อทีมงานหากต้องการแก้ไข", 409);
        }

        store.pending.push(encrypted);
        return { value: { id } };
      }
    );

    await notifyLine(env, record);
    return json({ ok: true, id }, 201);
  }
  catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPut({ request, env }) {
  try {
    requireAdmin(request, env);
    const body = await request.json();
    const action = clean(body?.action, 40).toLowerCase();
    const id = clean(body?.id, 100);

    if (!id) throw new RequestError("ไม่พบรายการที่ต้องการแก้ไข");

    if (action === "approve") {
      const current = await readStore(env);
      const pendingEntry = current.data.pending.find(item => item.id === id);

      if (!pendingEntry) {
        const approved = current.data.approved.find(item => item.id === id);
        if (approved) return json({ ok: true, item: approved });
        throw new RequestError("ไม่พบ Client Voice ที่รออนุมัติ", 404);
      }

      const decrypted = await decryptRecord(pendingEntry, env.ADMIN_KEY);
      const edited = applyEditableFields(decrypted, body.edits || {});
      const photoPath = await uploadApprovedPhoto(env, edited);
      const approvedAt = new Date().toISOString();
      const approvedItem = {
        id: edited.id,
        inviteHash: edited.inviteHash,
        clientName: edited.clientName,
        projectName: edited.projectName,
        service: edited.service,
        comment: edited.comment,
        rating: edited.rating,
        socialUrl: edited.socialUrl,
        photo: photoPath,
        submittedAt: edited.submittedAt,
        approvedAt,
        published: true
      };

      await mutateStore(
        env,
        `Approve Client Voice: ${cleanCommitLabel(edited.projectName) || id}`,
        store => {
          const pendingIndex = store.pending.findIndex(item => item.id === id);
          const approvedIndex = store.approved.findIndex(item => item.id === id);

          if (pendingIndex < 0 && approvedIndex >= 0) {
            return { changed: false, value: store.approved[approvedIndex] };
          }

          if (pendingIndex < 0) throw new RequestError("ไม่พบ Client Voice ที่รออนุมัติ", 404);

          store.pending.splice(pendingIndex, 1);
          if (approvedIndex >= 0) store.approved[approvedIndex] = approvedItem;
          else store.approved.push(approvedItem);
          return { value: approvedItem };
        }
      );

      return json({ ok: true, item: approvedItem });
    }

    if (action === "update" || action === "visibility") {
      const updated = await mutateStore(
        env,
        `${action === "visibility" ? "Update" : "Edit"} Client Voice: ${id}`,
        store => {
          const index = store.approved.findIndex(item => item.id === id);
          if (index < 0) throw new RequestError("ไม่พบ Client Voice ที่เผยแพร่แล้ว", 404);

          const currentItem = store.approved[index];
          const nextItem = action === "update"
            ? applyEditableFields(currentItem, body.edits || {})
            : { ...currentItem, published: Boolean(body.published) };

          nextItem.updatedAt = new Date().toISOString();
          store.approved[index] = nextItem;
          return { value: nextItem };
        }
      );

      return json({ ok: true, item: updated });
    }

    throw new RequestError("คำสั่งแก้ไขไม่ถูกต้อง");
  }
  catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    requireAdmin(request, env);
    const body = await request.json();
    const id = clean(body?.id, 100);
    const kind = clean(body?.kind, 20).toLowerCase();

    if (!id || !["pending", "approved"].includes(kind)) {
      throw new RequestError("ข้อมูลยืนยันการลบไม่ครบถ้วน");
    }

    await mutateStore(env, `Delete Client Voice: ${id}`, store => {
      const list = kind === "pending" ? store.pending : store.approved;
      const index = list.findIndex(item => item.id === id);

      if (index < 0) throw new RequestError("ไม่พบ Client Voice ที่ต้องการลบ", 404);
      list.splice(index, 1);
      return { value: { id } };
    });

    return json({ ok: true, id, assetsPreserved: true });
  }
  catch (error) {
    return errorResponse(error);
  }
}
