// Renders scripts/demo/heroDemo.html into docs/assets/demo.gif and a still docs/assets/demo.png.
// Needs Google Chrome and ffmpeg. Usage: node scripts/demo/renderHeroDemo.mjs [--fps 15] [--chrome path]
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const { values: options } = parseArgs({
  options: {
    fps: { type: "string", default: "15" },
    chrome: { type: "string", default: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" },
    still: { type: "string", default: "25" },
  },
});

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const demoPage = pathToFileURL(join(repositoryRoot, "scripts/demo/heroDemo.html")).href;
const outputGif = join(repositoryRoot, "docs/assets/demo.gif");
const outputStill = join(repositoryRoot, "docs/assets/demo.png");
const framesPerSecond = Number(options.fps);
const width = 1200;
const height = 675;
const supersampling = 2;

const workFolder = mkdtempSync(join(tmpdir(), "overleaf-demo-"));
const debuggingPort = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(
  options.chrome,
  [
    "--headless=new",
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${join(workFolder, "profile")}`,
    "--hide-scrollbars",
    "--disable-gpu",
    `--window-size=${width},${height}`,
    demoPage,
  ],
  { stdio: "ignore" },
);

async function pageWebSocketUrl() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)).json();
      const page = targets.find((target) => target.type === "page" && target.url.startsWith("file:"));
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await setTimeout(200);
  }
  throw new Error("Chrome did not open the demo page");
}

function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  return { opened, send, close: () => socket.close() };
}

try {
  const browser = connect(await pageWebSocketUrl());
  await browser.opened;
  await browser.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: supersampling,
    mobile: false,
  });
  await browser.send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });
  const { result } = await browser.send("Runtime.evaluate", { expression: "window.DURATION" });
  const frameCount = Math.round(result.value * framesPerSecond);

  async function capture(time, path) {
    await browser.send("Runtime.evaluate", { expression: `render(${time})` });
    const { data } = await browser.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path, Buffer.from(data, "base64"));
  }

  for (let frame = 0; frame < frameCount; frame += 1) {
    await capture(frame / framesPerSecond, join(workFolder, `frame${String(frame).padStart(4, "0")}.png`));
  }
  await capture(Number(options.still), join(workFolder, "still.png"));
  browser.close();

  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-framerate",
    String(framesPerSecond),
    "-i",
    join(workFolder, "frame%04d.png"),
    "-vf",
    `scale=${width}:${height}:flags=lanczos,split[frames][palette];` +
      "[palette]palettegen=max_colors=256:stats_mode=full[colors];" +
      "[frames][colors]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
    "-loop",
    "0",
    outputGif,
  ]);
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    join(workFolder, "still.png"),
    "-vf",
    `scale=${width}:${height}:flags=lanczos`,
    outputStill,
  ]);
  process.stdout.write(`Rendered ${frameCount} frames to ${outputGif} and a still to ${outputStill}.\n`);
} finally {
  chrome.kill();
  rmSync(workFolder, { recursive: true, force: true });
}
