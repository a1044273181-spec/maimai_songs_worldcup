import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  assert.match(html, /<title>mai:CUP｜舞萌 DX 中国版年度本命曲决战<\/title>/);
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
  assert.equal(catalog.songs.length, 1305);
  assert.equal(catalog.versions.at(-1).title, "舞萌DX 2026");
  assert.equal(catalog.versions.at(-1).version, "25500");
  assert.ok(catalog.songs.filter((song) => song.preview).length >= 1200);
  assert.equal(
    catalog.songs.filter((song) => song.version === "25500").length,
    37,
  );
  assert.ok(
    catalog.songs.every((song) =>
      catalog.versions.some((version) => version.version === song.version),
    ),
  );
});

test("battle UI enforces a single 30-second preview player", async () => {
  const page = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /audioRef = useRef<HTMLAudioElement/);
  assert.match(page, /audio\.currentTime >= 30/);
  assert.match(page, /stopPreview\(\)/);
  assert.match(page, /试听 30s/);
  assert.match(page, /暂无试听/);
});
