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
  assert.match(html, /已加入學生登入/);
  assert.match(html, /第一次加入班級/);
  assert.match(html, /登入課程/);
  assert.match(html, /<input(?=[^>]*name="email")(?=[^>]*type="email")[^>]*>/);
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

test("renders the chapter 3 sample-based checklist", async () => {
  const response = await render("/chapters/3");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /滑行作品按下綠旗後/);
  assert.match(html, /至少四段滑行到指定位置/);
  assert.match(html, /每一段滑行時間都使用隨機取數積木/);
  assert.match(html, /座標作品按下綠旗後/);
  assert.match(html, /重複與改變 X／Y 座標積木/);
  assert.match(html, /座標移動路線不會超出舞台/);
});

test("renders the sample-based chapter 4 and 5 checklists", async () => {
  const controller = await render("/chapters/4");
  assert.equal(controller.status, 200);
  const controllerHtml = await controller.text();
  assert.match(controllerHtml, /重複無限次中持續偵測上、下、左、右方向鍵/);
  assert.match(controllerHtml, /增加或減少主角的 X／Y 座標/);

  const supporting = await render("/chapters/5");
  assert.equal(supporting.status, 200);
  const supportingHtml = await supporting.text();
  assert.match(supportingHtml, /至少有主角與一個會移動的配角/);
  assert.match(supportingHtml, /配角每一段滑行時間都使用隨機取數積木/);
});

test("renders the sample-based chapter 6 through 9 checklists", async () => {
  const cases = [
    { chapter: 6, text: "按下空白鍵後，子彈會移到主角位置" },
    { chapter: 7, text: "配角子彈會重複移到配角位置" },
    { chapter: 8, text: "等待隨機時間後建立分身" },
    { chapter: 9, text: "攻擊碰到敵人後" },
  ];
  for (const item of cases) {
    const response = await render(`/chapters/${item.chapter}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), new RegExp(item.text));
  }
});

test("renders win and lose in chapter 10 and timer in chapter 11", async () => {
  const winLose = await render("/chapters/10");
  assert.equal(winLose.status, 200);
  const winLoseHtml = await winLose.text();
  assert.match(winLoseHtml, /勝負判斷：使用廣播/);
  assert.match(winLoseHtml, /勝負判斷：不使用廣播/);
  assert.match(winLoseHtml, /送出並接收 WIN／LOSE/);

  const timer = await render("/chapters/11");
  assert.equal(timer.status, 200);
  const timerHtml = await timer.text();
  assert.match(timerHtml, /遊戲時間設定為大於零/);
  assert.match(timerHtml, /每秒將時間減少一/);
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
    { path: "/chapters/10", videoIds: ["kafiqqrHbQM", "DOsK2b0b5rQ"] },
    { path: "/chapters/11", videoIds: ["F0DISm_jCxw"] },
    { path: "/chapters/12", videoIds: ["7tiS3n6N4_c"] },
  ];

  for (const item of cases) {
    const response = await render(item.path);
    assert.equal(response.status, 200);
    const html = await response.text();
    item.videoIds.forEach((videoId) => assert.match(html, new RegExp(`youtube\\.com/embed/${videoId}`)));
  }
});
