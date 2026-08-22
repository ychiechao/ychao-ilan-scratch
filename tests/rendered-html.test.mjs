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
  assert.match(html, /youtube\.com\/embed\/videoseries/);
});
