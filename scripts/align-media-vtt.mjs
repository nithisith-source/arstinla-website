import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const alignmentDirectory = path.resolve(process.argv[2] || ".");
const lyricsDirectory = path.join(root, "assets", "lyrics", "library");
const subtitleDirectory = path.join(root, "assets", "subtitles", "library");

const songs = [
  { id: "everyday-with-you", lyrics: "everyday-with-you.txt", alignment: "everyday-aligned.json" },
  { id: "everything-is-good-now", lyrics: "everything-is-good-now.txt", alignment: "everything-is-good-now-retry.json" },
  { id: "eyelids", lyrics: "eyelids.txt", alignment: "eyelids-aligned.json" },
  { id: "track-1790691868161-79766206", lyrics: "dried-flowers.txt", alignment: "track-1790691868161-79766206-aligned.json" },
  { id: "track-1790691922763-e1eb8926", lyrics: "thank-you-for-leaving.txt", alignment: "thank-you-for-leaving-force.json" },
  { id: "track-1790691965377-8fee0ded", lyrics: "temporary-destination.txt", alignment: "track-1790691965377-8fee0ded-aligned.json" },
  { id: "track-1790692006427-184acf10", lyrics: "dark-moon.txt", alignment: "track-1790692006427-184acf10-aligned.json" },
  { id: "track-1790692036576-a523bf80", lyrics: "stained-hands.txt", alignment: "track-1790692036576-a523bf80-aligned.json" },
  { id: "track-1790692068304-d20aaddc", lyrics: "watering-memories.txt", alignment: "watering-memories-force.json" },
  { id: "friendship-unit", lyrics: "friendship-unit.txt", alignment: "friendship-unit-retry.json" },
];

function lyricLines(source) {
  return source
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !/^\[.+]$/.test(line));
}

function normalized(value) {
  return Array.from(String(value || "").normalize("NFC").toLowerCase().replace(/[\p{P}\p{S}\p{Z}\d_]/gu, "")).join("");
}

function distance(left, right) {
  const a = Array.from(left);
  const b = Array.from(right);
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function matchCost(transcript, lyrics, segmentCount, lineCount) {
  const heard = normalized(transcript);
  const expected = normalized(lyrics);
  const scale = Math.max(1, heard.length, expected.length);
  const edit = distance(heard, expected) / scale;
  const lengthRatio = Math.abs(Math.log((heard.length + 1) / (expected.length + 1)));
  return edit + lengthRatio * 0.32 + (segmentCount - 1) * 0.025 + (lineCount - 1) * 0.018;
}

function usableSegments(transcription) {
  const musicOnly = /^\s*\[[^\]]*(?:music|音楽|เสียงดนตรี)[^\]]*\]\s*$/iu;
  return transcription
    .filter(segment => !musicOnly.test(segment.text || ""))
    .map(segment => ({
      start: Number(segment.offsets?.from || 0) / 1000,
      end: Number(segment.offsets?.to || 0) / 1000,
      text: String(segment.text || "").trim(),
    }))
    .filter(segment => segment.end > segment.start && normalized(segment.text).length > 0);
}

function alignGroups(segments, lines) {
  const rows = segments.length + 1;
  const columns = lines.length + 1;
  const scores = Array.from({ length: rows }, () => Array(columns).fill(Number.POSITIVE_INFINITY));
  const back = Array.from({ length: rows }, () => Array(columns).fill(null));
  scores[0][0] = 0;

  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < columns; j += 1) {
      if (!Number.isFinite(scores[i][j])) continue;

      if (i < segments.length) {
        const skipCost = scores[i][j] + (normalized(segments[i].text).length < 5 ? 0.45 : 1.15);
        if (skipCost < scores[i + 1][j]) {
          scores[i + 1][j] = skipCost;
          back[i + 1][j] = { previousI: i, previousJ: j, skipped: true };
        }
      }

      for (let segmentCount = 1; segmentCount <= 3 && i + segmentCount <= segments.length; segmentCount += 1) {
        const transcript = segments.slice(i, i + segmentCount).map(segment => segment.text).join("");
        for (let lineCount = 1; lineCount <= 6 && j + lineCount <= lines.length; lineCount += 1) {
          const expected = lines.slice(j, j + lineCount).join("");
          const candidate = scores[i][j] + matchCost(transcript, expected, segmentCount, lineCount);
          if (candidate < scores[i + segmentCount][j + lineCount]) {
            scores[i + segmentCount][j + lineCount] = candidate;
            back[i + segmentCount][j + lineCount] = {
              previousI: i,
              previousJ: j,
              segmentCount,
              lineCount,
              skipped: false,
            };
          }
        }
      }
    }
  }

  if (!Number.isFinite(scores[segments.length][lines.length])) throw new Error("Unable to align all lyric lines");
  const groups = [];
  let i = segments.length;
  let j = lines.length;
  while (i > 0 || j > 0) {
    const step = back[i][j];
    if (!step) throw new Error(`Broken alignment at ${i}:${j}`);
    if (!step.skipped) {
      groups.push({
        segments: segments.slice(step.previousI, i),
        lines: lines.slice(step.previousJ, j),
      });
    }
    i = step.previousI;
    j = step.previousJ;
  }

  return { groups: groups.reverse(), score: scores[segments.length][lines.length] };
}

function lineWeight(text) {
  return Math.max(2.2, 1.1 + Array.from(normalized(text)).length / 7.2);
}

function voiceTime(spans, progress) {
  const total = spans.reduce((sum, span) => sum + span.end - span.start, 0);
  let target = Math.max(0, Math.min(1, progress)) * total;
  for (const span of spans) {
    const length = span.end - span.start;
    if (target <= length) return span.start + target;
    target -= length;
  }
  return spans.at(-1).end;
}

function cueLines(groups) {
  const cues = [];
  for (const group of groups) {
    const weights = group.lines.map(lineWeight);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let consumed = 0;
    group.lines.forEach((text, index) => {
      const start = voiceTime(group.segments, consumed / total);
      consumed += weights[index];
      let end = voiceTime(group.segments, consumed / total);

      for (let spanIndex = 0; spanIndex < group.segments.length - 1; spanIndex += 1) {
        const current = group.segments[spanIndex];
        const next = group.segments[spanIndex + 1];
        if (next.start - current.end > 0.85 && start < current.end && end > next.start) {
          end = current.end;
          break;
        }
      }

      cues.push({ start, end: Math.max(start + 0.8, end - 0.08), text });
    });
  }

  for (let index = 0; index < cues.length - 1; index += 1) {
    if (cues[index].end >= cues[index + 1].start) {
      cues[index].end = Math.max(cues[index].start + 0.5, cues[index + 1].start - 0.08);
    }
  }
  return cues;
}

function timestamp(value) {
  const milliseconds = Math.max(0, Math.round(value * 1000));
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

for (const song of songs) {
  const lines = lyricLines(await readFile(path.join(lyricsDirectory, song.lyrics), "utf8"));
  const alignment = JSON.parse(await readFile(path.join(alignmentDirectory, song.alignment), "utf8"));
  const segments = usableSegments(alignment.transcription || []);
  if (!segments.length) throw new Error(`No vocal segments found for ${song.id}`);
  const result = alignGroups(segments, lines);
  const cues = cueLines(result.groups);
  const body = cues.map((cue, index) => `${index + 1}\n${timestamp(cue.start)} --> ${timestamp(cue.end)}\n${cue.text}`).join("\n\n");
  const vtt = `WEBVTT\n\nNOTE ARSTINLA timed lyrics aligned to the recorded vocal.\n\n${body}\n`;
  await writeFile(path.join(subtitleDirectory, `${song.id}.vtt`), vtt, "utf8");
  console.log(`${song.id}: ${segments.length} vocal segments, ${lines.length} lyric lines, score ${result.score.toFixed(2)}, ${timestamp(cues[0].start)} - ${timestamp(cues.at(-1).end)}`);
}
