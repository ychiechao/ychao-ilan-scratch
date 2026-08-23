import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
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

test("server-renders the course platform shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>宜蘭 Scratch 基礎課程<\/title>/i);
  assert.match(html, /學生入口/);
  assert.match(html, /老師後台/);
  assert.match(html, /課程地圖/);
  assert.match(html, /aria-label="回到課程地圖"[^>]*>\s*宜蘭 Scratch 基礎課程/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/);
});

test("server-renders a standalone chapter page", async () => {
  const response = await render("/chapters/1");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Scratch 基本環境/);
  assert.match(html, /學習目標/);
  assert.match(html, /內容說明/);
  assert.match(html, /章節影片/);
  assert.match(html, /自我檢核/);
  assert.match(html, /我已將作品下載為 \.sb3 檔案/);
  assert.match(html, /youtube\.com\/embed\/NSIGbZ9j3zY/);
  assert.doesNotMatch(html, /embed\/videoseries/);
  assert.match(html, /href="\/chapters\/2"/);
  assert.match(html, /href="\/\?mode=student(?:&amp;|&)chapter=1#student-entry"/);
});

test("renders the revised chapter 2 checklist", async () => {
  const response = await render("/chapters/2");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /角色會先回到設定好的初始位置與方向/);
  assert.match(html, /使用前進指令與重複積木/);
  assert.match(html, /不會超出舞台範圍/);
});

test("renders the verified videos for every chapter", async () => {
  const cases = [
    { path: "/chapters/1", videoIds: ["NSIGbZ9j3zY"] },
    { path: "/chapters/2", videoIds: ["-TT0OIgRbgY"] },
    { path: "/chapters/3", videoIds: ["Jvpr-2X5EJs", "HYsreADflfs"] },
    { path: "/chapters/4", videoIds: ["Ljh-5RNk0Uk"] },
    { path: "/chapters/5", videoIds: ["QPD05s8Kc8w"] },
    { path: "/chapters/6", videoIds: ["gKWIFFpyW3c"] },
    { path: "/chapters/7", videoIds: ["K7AhE9D2yJg"] },
    { path: "/chapters/8", videoIds: ["NeOBcpvmAuw"] },
    { path: "/chapters/9", videoIds: ["RHICqwxNtWY"] },
    { path: "/chapters/10", videoIds: ["F0DISm_jCxw"] },
    { path: "/chapters/11", videoIds: ["kafiqqrHbQM", "DOsK2b0b5rQ"] },
    { path: "/chapters/12", videoIds: ["7tiS3n6N4_c"] },
  ];

  for (const item of cases) {
    const response = await render(item.path);
    assert.equal(response.status, 200);
    const html = await response.text();
    item.videoIds.forEach((videoId) => assert.match(html, new RegExp(`youtube\\.com/embed/${videoId}`)));
  }
});
