import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the mai:CUP application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>mai:CUP｜舞萌中国版歌曲淘汰赛<\/title>/);
  assert.match(html, /正在装载舞萌中国版曲库/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("catalog uses Chinese annual versions and mapped previews", async () => {
  const catalog = JSON.parse(
    await readFile(
      new URL("../public/maimai-cn.json", import.meta.url),
      "utf8",
    ),
  );

  assert.equal(catalog.versions.length, 20);
  assert.equal(catalog.songs.length, 1251);
  assert.equal(catalog.versions.at(-1).title, "舞萌DX 2026");
  assert.equal(catalog.versions.at(-1).version, "25500");
  assert.ok(catalog.songs.filter((song) => song.preview).length >= 1180);
  assert.ok(catalog.songs.every((song) => song.genre !== "宴会場"));
  assert.equal(
    catalog.songs.filter((song) => song.version === "25500").length,
    30,
  );
  assert.ok(
    catalog.songs.every((song) =>
      catalog.versions.some((version) => version.version === song.version),
    ),
  );
});

test("battle UI implements immediate preview and a single-screen tournament poster", async () => {
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const styles = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(page, /audioRef = useRef<HTMLAudioElement/);
  assert.doesNotMatch(page, /PREVIEW_DELAY_MS|setTimeout/);
  assert.match(page, /PREVIEW_LIMIT_SECONDS = 30/);
  assert.match(page, /await audio\.play\(\)/);
  assert.match(page, /Math\.ceil\(nextQualified\.length \/ 3\)/);
  assert.match(page, /第一轮小组赛/);
  assert.match(page, /淘汰复活/);
  assert.match(page, /四分之一决赛/);
  assert.match(page, /半决赛/);
  assert.match(page, /总决赛/);
  assert.match(page, /观看比赛概览/);
  assert.match(page, /className="roster-group"/);
  assert.match(page, /className="tournament-poster poster-source-layout"/);
  assert.match(page, /className="overview-screen"/);
  assert.match(page, /className="overview-preview-image"/);
  assert.match(page, /posterPreviewUrl/);
  assert.match(page, /URL\.createObjectURL\(blob\)/);
  assert.match(page, /URL\.revokeObjectURL/);
  assert.match(styles, /\.overview-fit-page[\s\S]*height: 100dvh/);
  assert.match(styles, /\.overview-preview-image[\s\S]*max-height: 100%/);
  assert.match(styles, /\.poster-source-layout[\s\S]*left: -20000px/);
  assert.match(page, /src="\/site-qr\.png"/);
  assert.match(page, /import\("html-to-image"\)/);
  assert.match(page, /POSTER_EXPORT_WIDTH = 1080/);
  assert.match(page, /canvasWidth: POSTER_EXPORT_WIDTH/);
  assert.match(page, /pixelRatio: 1/);
  assert.match(page, /className = "poster-export-host"/);
  assert.match(page, /className="export-button"/);
  assert.match(page, /navigator\.canShare\(\{ files: \[file\] \}\)/);
  assert.match(page, /posterBlobRef = useRef<Blob/);
  assert.match(page, /setExportState\("ready"\)/);
  assert.match(page, /downloadPoster\(blob, posterFileName\(\)\)/);
  assert.match(page, /className="card-select-button"/);
  assert.match(page, /onClick=\{\(\) => onChoose\(song\)\}/);
  assert.match(page, /className="cover-preview-button"/);
  assert.match(page, /stopPreview\(\)/);
  assert.match(page, /立即试听/);
  assert.match(page, /暂无试听/);

  const qr = await stat(new URL("../public/site-qr.png", import.meta.url));
  assert.ok(qr.size > 1000);
});
