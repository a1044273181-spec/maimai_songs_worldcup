import { readFile, writeFile } from "node:fs/promises";

const outputPath = new URL("../public/maimai-cn.json", import.meta.url);
const lxnsUrl =
  "https://maimai.lxns.net/api/v0/maimai/song/list?version=25500&notes=false";
const radioApi =
  "https://music.163.com/api/dj/program/byradio?radioId=969217156&limit=500";
const radioPageUrl =
  "https://music.163.com/djradio?id=969217156&uct2=U2FsdGVkX1/bzEBHrll0bjx5XDziVImBjPnNHm0pQSQ=";
const offsets = [0, 500, 1000, 1500];

async function loadJson(url, fallback) {
  try {
    const response = await fetch(url, {
      headers: {
        Referer: "https://music.163.com/",
        "User-Agent": "Mozilla/5.0 mai:CUP catalog builder",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch {
    return JSON.parse(
      await readFile(new URL(`../work/${fallback}`, import.meta.url), "utf8"),
    );
  }
}

const [lxns, ...radioPages] = await Promise.all([
  loadJson(lxnsUrl, "lxns-song-list.json"),
  ...offsets.map((offset) =>
    loadJson(
      `${radioApi}&offset=${offset}`,
      offset === 0 ? "netease-radio.json" : `netease-radio-${offset}.json`,
    ),
  ),
]);

const classicIcons = {
  10000: "/version-icons/classic/maimai.png",
  11000: "/version-icons/classic/maimai.png",
  12000: "/version-icons/classic/green.png",
  13000: "/version-icons/classic/green.png",
  14000: "/version-icons/classic/orange.jpg",
  15000: "/version-icons/classic/orange.jpg",
  16000: "/version-icons/classic/pink.png",
  17000: "/version-icons/classic/pink.png",
  18000: "/version-icons/classic/murasaki.png",
  18500: "/version-icons/classic/murasaki.png",
  19000: "/version-icons/classic/milk.png",
  19500: "/version-icons/classic/milk.png",
  19900: "/version-icons/classic/finale.jpg",
};

const dxIcons = {
  20000: "/version-icons/dx-cn/dx-2020.webp",
  21000: "/version-icons/dx-cn/dx-2021.webp",
  22000: "/version-icons/dx-cn/dx-2022.webp",
  23000: "/version-icons/dx-cn/dx-2023.webp",
  24000: "/version-icons/dx-cn/dx-2024.webp",
  25000: "/version-icons/dx-cn/dx-2025.webp",
  25500: "/version-icons/dx-cn/dx-2026.webp",
};

const versions = lxns.versions.map((item) => ({
  title: item.title,
  version: String(item.version),
  abbr: item.title,
  era: item.version < 20000 ? "classic" : "dx",
  icon: classicIcons[item.version] ?? dxIcons[item.version],
}));

const majorVersions = lxns.versions
  .map((item) => item.version)
  .sort((left, right) => right - left);

function majorVersion(version) {
  return majorVersions.find((candidate) => version >= candidate);
}

const radioPrograms = radioPages.flatMap((page) => page.programs ?? []);
const radioByMaimaiId = new Map();

for (const program of radioPrograms) {
  const match = program.name?.match(/^(\d+)\s+/);
  if (!match || !program.mainSong?.id) continue;
  radioByMaimaiId.set(Number(match[1]), program);
}

const songs = lxns.songs
  .filter((song) => song.genre !== "宴会場")
  .map((song) => {
  const radioProgram = radioByMaimaiId.get(song.id);
  return {
    id: String(song.id),
    title: song.title,
    artist: song.artist,
    genre: song.genre,
    bpm: song.bpm,
    version: String(majorVersion(song.version)),
    cover: `https://assets2.lxns.net/maimai/jacket/${song.id}.png`,
    preview: radioProgram?.mainSong?.id
      ? `https://music.163.com/song/media/outer/url?id=${radioProgram.mainSong.id}.mp3`
      : null,
  };
  });

const catalog = {
  updatedAt: new Date().toISOString().slice(0, 10),
  source: "https://maimai.lxns.net/docs/api/maimai",
  previewSource: radioPageUrl,
  region: "cn",
  versionRule: "lxns-major-version",
  versions,
  songs,
};

await writeFile(outputPath, `${JSON.stringify(catalog)}\n`, "utf8");

const counts = Object.fromEntries(
  versions.map((version) => [
    version.title,
    songs.filter((song) => song.version === version.version).length,
  ]),
);

console.log(
  JSON.stringify(
    {
      updatedAt: catalog.updatedAt,
      versions: versions.length,
      songs: songs.length,
      previews: songs.filter((song) => song.preview).length,
      counts,
    },
    null,
    2,
  ),
);
