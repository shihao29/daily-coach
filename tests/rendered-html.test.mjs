import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
let server;
let origin;
let serverOutput = "";

async function availablePort() {
  const socket = net.createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const address = socket.address();
  const port = typeof address === "object" && address ? address.port : 3199;
  socket.close();
  await once(socket, "close");
  return port;
}

before(
  async () => {
    const port = await availablePort();
    origin = `http://127.0.0.1:${port}`;
    server = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
      {
        cwd: projectRoot,
        env: { ...process.env, SILICONFLOW_API_KEY: "" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    server.stdout.on("data", (chunk) => (serverOutput += chunk));
    server.stderr.on("data", (chunk) => (serverOutput += chunk));

    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const response = await fetch(origin);
        if (response.ok) return;
      } catch {
        // The server is still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Next.js server did not start:\n${serverOutput}`);
  },
  { timeout: 20_000 },
);

after(() => {
  server?.kill();
});

test("server-renders the 朝夕 app shell", async () => {
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>朝夕｜你的每日监督教练<\/title>/);
  assert.match(html, /今天，也照顾好自己。/);
  assert.match(html, /打卡/);
  assert.match(html, /日历/);
  assert.match(html, /周报/);
  assert.match(html, /我的/);
  assert.doesNotMatch(html, /codex-preview|Building your site/i);
});

test("AI endpoint fails safely when the server secret is absent", async () => {
  const response = await fetch(`${origin}/api/coach/weekly`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "generate", period: {}, metrics: [] }),
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "AI 服务尚未配置" });
});
