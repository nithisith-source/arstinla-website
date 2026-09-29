import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lyricsDirectory = path.join(root, "assets", "lyrics", "library");
const subtitleDirectory = path.join(root, "assets", "subtitles", "library");
const storePath = path.join(root, "media-data.json");

const songs = [
  { id: "everyday-with-you", source: "everyday-with-you.txt", duration: 233, intro: 11, outro: 6 },
  { id: "everything-is-good-now", source: "everything-is-good-now.txt", duration: 272, intro: 10, outro: 6 },
  { id: "eyelids", source: "eyelids.txt", duration: 240, intro: 8, outro: 5 },
  { id: "track-1790691868161-79766206", source: "dried-flowers.txt", duration: 233, intro: 12, outro: 8 },
  { id: "track-1790691922763-e1eb8926", source: "thank-you-for-leaving.txt", duration: 206, intro: 8, outro: 7 },
  { id: "track-1790691965377-8fee0ded", source: "temporary-destination.txt", duration: 262, intro: 5, outro: 7 },
  { id: "track-1790692006427-184acf10", source: "dark-moon.txt", duration: 269, intro: 11, outro: 5 },
  { id: "track-1790692036576-a523bf80", source: "stained-hands.txt", duration: 238, intro: 10, outro: 8 },
  { id: "track-1790692068304-d20aaddc", source: "watering-memories.txt", duration: 226, intro: 8, outro: 5 },
  { id: "friendship-unit", source: "friendship-unit.txt", duration: 265, intro: 10, outro: 6 },
];

const newTracks = [
  {
    id: "friendship-unit",
    title: "หนึ่งหน่วยมิตรภาพ",
    artist: "ARSTINLA",
    file: "/assets/audio/library/friendship-unit.mp3",
    size: 6266369,
    createdAt: "2026-09-29T15:00:34.000Z",
    protected: false,
  },
  {
    id: "quiet-country-night",
    title: "คืนสงบในชนบท",
    artist: "ARSTINLA",
    file: "/assets/audio/library/quiet-country-night.mp3",
    size: 3282576,
    createdAt: "2026-09-29T15:11:43.000Z",
    protected: false,
    instrumental: true,
    arrangement: [
      "Intro · soft ukulele fingerpicking",
      "Verse · gentle melody, glockenspiel enters",
      "Verse · same melody, warm guitar underneath",
      "Bridge · softer, pad only, ukulele returns",
      "Verse · gentle melody repeats",
      "Verse · melody repeats, slightly quieter",
      "Outro · ukulele alone, slow fade",
    ].join("\n"),
  },
];

function sectionGap(label) {
  const value = label.toLowerCase();
  if (value.includes("instrumental")) return 7;
  if (value.includes("bridge")) return 3;
  if (value.includes("final chorus")) return 3;
  if (value.includes("chorus")) return 2.4;
  if (value.includes("outro")) return 3;
  if (value.includes("spoken")) return 2.5;
  if (value.includes("group vocal")) return 2;
  if (value.includes("pre-chorus")) return 2;
  if (value.includes("verse")) return 1.7;
  return 1.5;
}

function parseLyrics(source) {
  const entries = [];
  let pendingGap = 0;
  let sawLyric = false;

  for (const rawLine of source.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      if (sawLyric) pendingGap = Math.max(pendingGap, 1.15);
      continue;
    }

    const section = line.match(/^\[(.+)]$/);
    if (section) {
      if (sawLyric) pendingGap = Math.max(pendingGap, sectionGap(section[1]));
      continue;
    }

    entries.push({ text: line, gapBefore: entries.length ? pendingGap : 0 });
    pendingGap = 0;
    sawLyric = true;
  }

  return entries;
}

function cueWeight(text) {
  const visibleLength = Array.from(text.replace(/[.…·]/g, "")).length;
  return Math.max(2.3, 1.2 + visibleLength / 7.5);
}

function timestamp(value) {
  const milliseconds = Math.max(0, Math.round(value * 1000));
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function buildVtt(source, spec) {
  const entries = parseLyrics(source);
  const totalGaps = entries.reduce((sum, entry) => sum + entry.gapBefore, 0);
  const weights = entries.map(entry => cueWeight(entry.text));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const available = Math.max(1, spec.duration - spec.intro - spec.outro - totalGaps);
  let cursor = spec.intro;

  const cues = entries.map((entry, index) => {
    cursor += entry.gapBefore;
    const start = cursor;
    const allocated = available * weights[index] / weightTotal;
    cursor += allocated;
    const end = Math.max(start + 1, cursor - 0.12);
    return `${index + 1}\n${timestamp(start)} --> ${timestamp(end)}\n${entry.text}`;
  });

  return `WEBVTT\n\nNOTE ARSTINLA timed-lyrics draft. Fine-tune timestamps in Media Manager after listening.\n\n${cues.join("\n\n")}\n`;
}

await mkdir(subtitleDirectory, { recursive: true });
const store = JSON.parse(await readFile(storePath, "utf8"));
store.tracks = Array.isArray(store.tracks) ? store.tracks : [];

for (const newTrack of newTracks) {
  if (!store.tracks.some(track => track.id === newTrack.id)) store.tracks.push(newTrack);
}

for (const spec of songs) {
  const track = store.tracks.find(item => item.id === spec.id);
  if (!track) throw new Error(`Missing media track: ${spec.id}`);
  const lyrics = (await readFile(path.join(lyricsDirectory, spec.source), "utf8")).trim();
  track.lyrics = lyrics;
  track.chords = String(track.chords || "");
  track.subtitle = `/assets/subtitles/library/${track.id}.vtt`;
  await writeFile(path.join(subtitleDirectory, `${track.id}.vtt`), buildVtt(lyrics, spec), "utf8");
}

const instrumental = store.tracks.find(track => track.id === "quiet-country-night");
if (instrumental) {
  instrumental.lyrics = "";
  instrumental.chords = String(instrumental.chords || "");
  instrumental.subtitle = "";
}

await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
console.log(`Generated ${songs.length} WebVTT files and updated ${store.tracks.length} media tracks.`);
