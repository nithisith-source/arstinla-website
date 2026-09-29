const STORE_PATH = "media-data.json";
const AUDIO_DIRECTORY = "assets/audio/library";
const SUBTITLE_DIRECTORY = "assets/subtitles/library";
const MAX_AUDIO_SIZE = 20 * 1024 * 1024;
const MAX_SUBTITLE_SIZE = 1024 * 1024;

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

function songText(value, limit = 30000) {
  return String(value || "").replace(/\r\n?/g, "\n").trim().slice(0, limit);
}

function songbookRows(value) {
  let rows;

  try {
    rows = typeof value === "string" ? JSON.parse(value) : value;
  }
  catch {
    throw new Error("ข้อมูลเนื้อร้องและคอร์ดไม่ถูกต้อง");
  }

  if (!Array.isArray(rows)) {
    throw new Error("ข้อมูลเนื้อร้องและคอร์ดต้องเป็นรายการบรรทัด");
  }

  if (rows.length > 500) {
    throw new Error("เพลงหนึ่งเพลงมีได้ไม่เกิน 500 บรรทัด");
  }

  return rows.flatMap(row => {
    if (row?.type === "section") {
      const text = songText(row.text, 120);
      return text ? [{ type: "section", text }] : [];
    }

    const lyric = songText(row?.lyric, 500);
    const chord = songText(row?.chord, 250);
    return lyric || chord ? [{ type: "line", chord, lyric }] : [];
  });
}

function songbookFromText(lyrics, chords) {
  const chordLines = String(chords || "").replace(/\r/g, "").split("\n");
  let chordIndex = 0;

  return String(lyrics || "").replace(/\r/g, "").split("\n").flatMap(rawLine => {
    const lyric = rawLine.trim();
    if (!lyric) return [];
    const section = lyric.match(/^\[(.+)]$/);
    if (section) return [{ type: "section", text: songText(section[1], 120) }];
    return [{ type: "line", chord: songText(chordLines[chordIndex++], 250), lyric: songText(lyric, 500) }];
  });
}

function lyricsFromSongbook(rows) {
  return rows.map(row => row.type === "section" ? `[${row.text}]` : row.lyric).join("\n").trim();
}

function chordsFromSongbook(rows) {
  return rows.filter(row => row.type === "line").map(row => row.chord).join("\n").trim();
}

async function subtitleBytes(file) {
  if (!(file instanceof File) || file.size === 0) {
    return null;
  }

  if (!/\.vtt$/i.test(file.name)) {
    throw new Error("ไฟล์เนื้อร้องตามเวลาต้องเป็น .vtt");
  }

  if (file.size > MAX_SUBTITLE_SIZE) {
    throw new Error("ไฟล์ .vtt ต้องมีขนาดไม่เกิน 1 MB");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, "");

  if (!/^WEBVTT(?:\s|$)/.test(text)) {
    throw new Error("ไฟล์ .vtt ไม่ถูกต้อง: ต้องขึ้นต้นด้วย WEBVTT");
  }

  return bytes;
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
    const lyrics = songText(formData.get("lyrics"));
    const chords = songText(formData.get("chords"));
    const songbook = songbookFromText(lyrics, chords);
    const audio = formData.get("audio");
    const subtitle = formData.get("subtitle");

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
    const timedLyrics = await subtitleBytes(subtitle);

    if (!isMp3(bytes)) {
      return json({ ok: false, error: "ไฟล์ที่เลือกไม่ใช่ MP3 ที่ถูกต้อง" }, 400);
    }

    const snapshot = await readStore(config);
    const id = `track-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const githubPath = `${AUDIO_DIRECTORY}/${id}.mp3`;
    const publicPath = `/${githubPath}`;
    const subtitlePath = `${SUBTITLE_DIRECTORY}/${id}.vtt`;
    let uploaded = null;
    let uploadedSubtitle = null;

    try {
      uploaded = await putGithubFile(
        config,
        githubPath,
        bytesToBase64(bytes),
        `Add music track: ${title}`
      );

      if (timedLyrics) {
        uploadedSubtitle = await putGithubFile(
          config,
          subtitlePath,
          bytesToBase64(timedLyrics),
          `Add timed lyrics: ${title}`
        );
      }

      const track = {
        id,
        title,
        artist,
        file: publicPath,
        size: audio.size,
        lyrics,
        chords,
        songbook,
        subtitle: timedLyrics ? `/${subtitlePath}` : "",
        createdAt: new Date().toISOString(),
        protected: false
      };

      snapshot.data.tracks.push(track);
      await writeStore(config, snapshot, `Update music library: ${title}`);
      return json({ ok: true, track });
    }
    catch (error) {
      const uploadedSubtitleSha = uploadedSubtitle?.content?.sha;
      const uploadedSha = uploaded?.content?.sha;

      if (uploadedSubtitleSha) {
        try {
          await deleteGithubFile(
            config,
            subtitlePath,
            uploadedSubtitleSha,
            `Rollback timed lyrics: ${title}`
          );
        }
        catch {
          // Leave the orphaned subtitle in place if rollback cannot complete.
        }
      }

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
  }
  catch (error) {
    return json(
      { ok: false, error: error?.message || "เพิ่มเพลงไม่สำเร็จ" },
      500
    );
  }
}

export async function onRequestPatch({ request, env }) {
  if (!requireAdmin(request, env)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  try {
    const config = getConfig(env);
    const formData = await request.formData();
    const id = String(formData.get("id") || "").trim();
    const snapshot = await readStore(config);
    const track = snapshot.data.tracks.find(item => item.id === id);

    if (!track) {
      return json({ ok: false, error: "ไม่พบเพลงนี้" }, 404);
    }

    const subtitle = formData.get("subtitle");
    const timedLyrics = await subtitleBytes(subtitle);

    if (timedLyrics) {
      const subtitlePath = `${SUBTITLE_DIRECTORY}/${track.id}.vtt`;
      const currentSubtitle = await readGithubFile(config, subtitlePath);
      await putGithubFile(
        config,
        subtitlePath,
        bytesToBase64(timedLyrics),
        `Update timed lyrics: ${track.title}`,
        currentSubtitle?.sha || null
      );
      track.subtitle = `/${subtitlePath}`;
    }

    const songbookValue = formData.get("songbook");

    if (songbookValue !== null) {
      track.songbook = songbookRows(songbookValue);
      track.lyrics = lyricsFromSongbook(track.songbook);
      track.chords = chordsFromSongbook(track.songbook);
    }
    else {
      track.lyrics = songText(formData.get("lyrics"));
      track.chords = songText(formData.get("chords"));
      track.songbook = songbookFromText(track.lyrics, track.chords);
    }
    track.updatedAt = new Date().toISOString();
    await writeStore(config, snapshot, `Update lyrics and chords: ${track.title}`);

    return json({ ok: true, track });
  }
  catch (error) {
    return json(
      { ok: false, error: error?.message || "บันทึกเนื้อร้องและคอร์ดไม่สำเร็จ" },
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

    const subtitlePath = String(track.subtitle || "").replace(/^\//, "");

    if (subtitlePath.startsWith(`${SUBTITLE_DIRECTORY}/`)) {
      try {
        const subtitleFile = await readGithubFile(config, subtitlePath);

        if (subtitleFile?.sha) {
          await deleteGithubFile(
            config,
            subtitlePath,
            subtitleFile.sha,
            `Delete timed lyrics: ${track.title}`
          );
        }
      }
      catch {
        warning = warning || "ลบรายการแล้ว แต่ไฟล์เนื้อร้องตามเวลาเดิมยังอยู่ในระบบ";
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
