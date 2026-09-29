const STORE_PATH = "media-data.json";
const AUDIO_DIRECTORY = "assets/audio/library";
const MAX_AUDIO_SIZE = 20 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(index, index + chunkSize)
    );
  }

  return btoa(binary);
}

function base64ToText(value) {
  const normalized = String(value || "").replace(/\s/g, "");
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function textToBase64(value) {
  return bytesToBase64(new TextEncoder().encode(value));
}

function getConfig(env) {
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || "main";
  const token = env.GITHUB_TOKEN;

  if (!owner || !repo || !token) {
    throw new Error("GitHub environment variables missing");
  }

  return { owner, repo, branch, token };
}

function githubHeaders(config) {
  return {
    Authorization: `Bearer ${config.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ARSTINLA-Media-Manager"
  };
}

function githubFileUrl(config, path) {
  return `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`;
}

async function readGithubFile(config, path) {
  const response = await fetch(
    `${githubFileUrl(config, path)}?ref=${encodeURIComponent(config.branch)}`,
    { headers: githubHeaders(config) }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Cannot read ${path}`);
  }

  return response.json();
}

async function putGithubFile(config, path, content, message, sha = null) {
  const payload = {
    message,
    content,
    branch: config.branch
  };

  if (sha) {
    payload.sha = sha;
  }

  const response = await fetch(githubFileUrl(config, path), {
    method: "PUT",
    headers: {
      ...githubHeaders(config),
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Cannot update ${path}: ${details}`);
  }

  return response.json();
}

async function deleteGithubFile(config, path, sha, message) {
  const response = await fetch(githubFileUrl(config, path), {
    method: "DELETE",
    headers: {
      ...githubHeaders(config),
      "content-type": "application/json"
    },
    body: JSON.stringify({
      message,
      sha,
      branch: config.branch
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Cannot delete ${path}: ${details}`);
  }
}

async function readStore(config) {
  const file = await readGithubFile(config, STORE_PATH);

  if (!file) {
    return {
      sha: null,
      data: { tracks: [] }
    };
  }

  let data;

  try {
    data = JSON.parse(base64ToText(file.content));
  }
  catch {
    throw new Error("Media data is not valid JSON");
  }

  if (!Array.isArray(data.tracks)) {
    data.tracks = [];
  }

  return { sha: file.sha, data };
}

async function writeStore(config, snapshot, message) {
  const content = `${JSON.stringify(snapshot.data, null, 2)}\n`;
  return putGithubFile(
    config,
    STORE_PATH,
    textToBase64(content),
    message,
    snapshot.sha
  );
}

function requireAdmin(request, env) {
  const key = request.headers.get("x-admin-key");
  return Boolean(env.ADMIN_KEY && key === env.ADMIN_KEY);
}

function isMp3(bytes) {
  if (bytes.length < 3) {
    return false;
  }

  const hasId3 =
    bytes[0] === 0x49 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x33;

  const hasFrameSync =
    bytes[0] === 0xff &&
    (bytes[1] & 0xe0) === 0xe0;

  return hasId3 || hasFrameSync;
}

export async function onRequestPost({ request, env }) {
  if (!requireAdmin(request, env)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  try {
    const config = getConfig(env);
    const formData = await request.formData();
    const title = String(formData.get("title") || "").trim();
    const artist = String(formData.get("artist") || "ARSTINLA").trim() || "ARSTINLA";
    const audio = formData.get("audio");

    if (!title) {
      return json({ ok: false, error: "กรุณาใส่ชื่อเพลง" }, 400);
    }

    if (!(audio instanceof File) || audio.size === 0) {
      return json({ ok: false, error: "กรุณาเลือกไฟล์ MP3" }, 400);
    }

    if (!/\.mp3$/i.test(audio.name)) {
      return json({ ok: false, error: "รองรับเฉพาะไฟล์ .mp3" }, 400);
    }

    if (audio.size > MAX_AUDIO_SIZE) {
      return json({ ok: false, error: "ไฟล์ MP3 ต้องมีขนาดไม่เกิน 20 MB" }, 400);
    }

    const bytes = new Uint8Array(await audio.arrayBuffer());

    if (!isMp3(bytes)) {
      return json({ ok: false, error: "ไฟล์ที่เลือกไม่ใช่ MP3 ที่ถูกต้อง" }, 400);
    }

    const snapshot = await readStore(config);
    const id = `track-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const githubPath = `${AUDIO_DIRECTORY}/${id}.mp3`;
    const publicPath = `/${githubPath}`;

    const uploaded = await putGithubFile(
      config,
      githubPath,
      bytesToBase64(bytes),
      `Add music track: ${title}`
    );

    const track = {
      id,
      title,
      artist,
      file: publicPath,
      size: audio.size,
      createdAt: new Date().toISOString(),
      protected: false
    };

    snapshot.data.tracks.push(track);

    try {
      await writeStore(config, snapshot, `Update music library: ${title}`);
    }
    catch (error) {
      const uploadedSha = uploaded?.content?.sha;

      if (uploadedSha) {
        try {
          await deleteGithubFile(
            config,
            githubPath,
            uploadedSha,
            `Rollback music upload: ${title}`
          );
        }
        catch {
          // Leave the orphaned file in place if rollback cannot complete.
        }
      }

      throw error;
    }

    return json({ ok: true, track });
  }
  catch (error) {
    return json(
      { ok: false, error: error?.message || "เพิ่มเพลงไม่สำเร็จ" },
      500
    );
  }
}

export async function onRequestDelete({ request, env }) {
  if (!requireAdmin(request, env)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  try {
    const config = getConfig(env);
    const body = await request.json();
    const id = String(body?.id || "").trim();
    const snapshot = await readStore(config);
    const index = snapshot.data.tracks.findIndex(track => track.id === id);

    if (index < 0) {
      return json({ ok: false, error: "ไม่พบเพลงนี้" }, 404);
    }

    const track = snapshot.data.tracks[index];

    if (track.protected) {
      return json({ ok: false, error: "เพลงระบบไม่สามารถลบจาก Media Manager" }, 400);
    }

    snapshot.data.tracks.splice(index, 1);
    await writeStore(config, snapshot, `Remove music track: ${track.title}`);

    let warning = "";
    const githubPath = String(track.file || "").replace(/^\//, "");

    if (githubPath.startsWith(`${AUDIO_DIRECTORY}/`)) {
      try {
        const audioFile = await readGithubFile(config, githubPath);

        if (audioFile?.sha) {
          await deleteGithubFile(
            config,
            githubPath,
            audioFile.sha,
            `Delete music file: ${track.title}`
          );
        }
      }
      catch {
        warning = "ลบรายการแล้ว แต่ไฟล์เสียงเดิมยังอยู่ในระบบ";
      }
    }

    return json({ ok: true, removed: track, warning });
  }
  catch (error) {
    return json(
      { ok: false, error: error?.message || "ลบเพลงไม่สำเร็จ" },
      500
    );
  }
}
