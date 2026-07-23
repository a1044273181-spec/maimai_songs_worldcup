import { readFile, writeFile } from "node:fs/promises";

const outputPath = new URL("../public/maimai-cn.json", import.meta.url);
const sourceUrl =
  "https://dp4p6x0xfi5o9.cloudfront.net/maimai/data.json";
const fallbackPath = new URL(
  "../work/arcade-maimai-data.json",
  import.meta.url,
);

let raw;
try {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  raw = await response.json();
} catch {
  raw = JSON.parse(await readFile(fallbackPath, "utf8"));
}

const classicIcons = {
  maimai: "/version-icons/classic/maimai.png",
  "maimai PLUS": "/version-icons/classic/maimai.png",
  GreeN: "/version-icons/classic/green.png",
  "GreeN PLUS": "/version-icons/classic/green.png",
  ORANGE: "/version-icons/classic/orange.jpg",
  "ORANGE PLUS": "/version-icons/classic/orange.jpg",
  PiNK: "/version-icons/classic/pink.png",
  "PiNK PLUS": "/version-icons/classic/pink.png",
  MURASAKi: "/version-icons/classic/murasaki.png",
  "MURASAKi PLUS": "/version-icons/classic/murasaki.png",
  MiLK: "/version-icons/classic/milk.png",
  "MiLK PLUS": "/version-icons/classic/milk.png",
  FiNALE: "/version-icons/classic/finale.jpg",
};

const dxIcons = {
  "maimaiでらっくす": "/version-icons/dx/dx.png",
  "maimaiでらっくす PLUS": "/version-icons/dx/dx-plus.png",
  Splash: "/version-icons/dx/splash.png",
  "Splash PLUS": "/version-icons/dx/splash-plus.png",
  UNiVERSE: "/version-icons/dx/universe.png",
  "UNiVERSE PLUS": "/version-icons/dx/universe-plus.png",
  FESTiVAL: "/version-icons/dx/festival.png",
  "FESTiVAL PLUS": "/version-icons/dx/festival-plus.png",
  BUDDiES: "/version-icons/dx/buddies.png",
  "BUDDiES PLUS": "/version-icons/dx/buddies-plus.png",
  PRiSM: "/version-icons/dx/prism.png",
  "PRiSM PLUS": "/version-icons/dx/prism-plus.png",
  CiRCLE: "/version-icons/dx/circle.png",
  "CiRCLE PLUS": "/version-icons/dx/circle-plus.png",
};

const versions = raw.versions.map((item) => ({
  title: item.version,
  version: item.version,
  abbr: item.abbr,
  releaseDate: item.releaseDate,
  era: classicIcons[item.version] ? "classic" : "dx",
  icon: classicIcons[item.version] ?? dxIcons[item.version],
}));

const songs = raw.songs
  .filter((song) => song.sheets.some((sheet) => sheet.regions?.cn === true))
  .map((song, index) => ({
    id: `${index}:${song.songId}`,
    title: song.title,
    artist: song.artist,
    genre: song.category,
    bpm: song.bpm,
    version: song.version,
    cover: `https://dp4p6x0xfi5o9.cloudfront.net/maimai/img/cover/${song.imageName}`,
  }));

const catalog = {
  updatedAt: raw.updateTime.slice(0, 10),
  source: "https://arcade-songs.zetaraku.dev/maimai/",
  region: "cn",
  versionRule: "song.version",
  versions,
  songs,
};

await writeFile(outputPath, `${JSON.stringify(catalog)}\n`, "utf8");

const counts = Object.fromEntries(
  versions.map((version) => [
    version.version,
    songs.filter((song) => song.version === version.version).length,
  ]),
);

console.log(
  JSON.stringify(
    {
      updatedAt: catalog.updatedAt,
      versions: versions.length,
      songs: songs.length,
      counts,
    },
    null,
    2,
  ),
);
