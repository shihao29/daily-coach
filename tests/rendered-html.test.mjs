import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// 静态导出模式下不再有服务端，直接读取 next build 输出的 out/index.html
test("static export contains the 朝夕 app shell", async () => {
  const html = await readFile(
    path.join(projectRoot, "out", "index.html"),
    "utf8",
  );
  assert.match(html, /<title>朝夕｜你的每日监督教练<\/title>/);
  assert.match(html, /今天，也照顾好自己。/);
  assert.match(html, /打卡/);
  assert.match(html, /日历/);
  assert.match(html, /周报/);
  assert.match(html, /我的/);
  assert.doesNotMatch(html, /codex-preview|Building your site/i);
});

test("AI weekly report is wired to the client-side SiliconFlow call", async () => {
  // 确保前端打包后的 JS 里包含直连硅基流动的端点
  // 静态导出后所有 JS 都在 out/_next/static 下
  const { readdir } = await import("node:fs/promises");
  const staticDir = path.join(projectRoot, "out", "_next", "static");
  let found = false;
  async function scan(dir) {
    if (found) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await scan(full);
      } else if (entry.name.endsWith(".js")) {
        const content = await readFile(full, "utf8");
        if (content.includes("api.siliconflow.com")) {
          found = true;
          return;
        }
      }
    }
  }
  await scan(staticDir);
  assert.ok(found, "未在打包产物里找到硅基流动直连代码");
});
