/**
 * Best-effort screenshooter for each Kyozo project.
 *
 * For each project:
 *   1. detect stack from package.json or pubspec.yaml
 *   2. install deps if missing
 *   3. spawn dev server on a free port (PORT=NNNN npm run dev, or flutter run -d web-server)
 *   4. wait for the port to respond (max 60s)
 *   5. screenshot at desktop (1280x800) and mobile (390x844) sizes
 *   6. write screenshots into the Obsidian vault, update projects.json
 *
 * Failure is expected for many projects (missing .env, db, OAuth, etc.).
 * Any project that fails is marked screenshot_status="failed" with a note.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import puppeteer from "puppeteer-core";

const ROOT = "/Users/ashokjaiswal/Development/Kyozo";
const VAULT_DEV = "/Users/ashokjaiswal/Desktop/Obsidian/Kyozo/11 Tech + Dev";
const SHOTS_DIR = path.join(VAULT_DEV, "screenshots", "projects");
const PROJECTS_JSON = path.join(VAULT_DEV, "data", "projects.json");
const DAILY_JSON = path.join(VAULT_DEV, "data", "daily.json");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const PROJECT_LIST = [
  // (name, relative path, stack)
  ["www.kyozo.com", "www.kyozo.com", "next.js"],
  ["waitlist.kyozo.com", "waitlist.kyozo.com", "vite"],
  ["kyozo_coming_soon", "kyozo_coming_soon", "next.js"],
  ["kyozosocial", "kyozosocial", "flutter"],
  ["kyozo_dataroom", "kyozo_dataroom", "next.js"],
  ["spheres-tech", "spheres-tech", "next.js"],
  ["kyozo-admin", "kyozo-admin", "next.js"],
  ["kyozo-pro-flow", "kyozo-pro-flow", "next.js"],
  ["KyozoVerse", "KyozoVerse", "next.js"],
  ["KyozoLoop", "KyozoLoop", "next.js"],
  ["Kyozo-Loop-Front", "Kyozo-Loop-Front", "next.js"],
  ["kyozo_flutter", "kyozo_flutter", "flutter"],
];

function log(...a) { console.log("[shot]", ...a); }

async function getFreePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

async function waitForHttp(port, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(2000) });
      if (r.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function killProcess(child) {
  if (!child || child.killed) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try { child.kill("SIGTERM"); } catch {}
  }
  await new Promise((r) => setTimeout(r, 1500));
  try { process.kill(-child.pid, "SIGKILL"); } catch {}
}

async function captureProject(p) {
  const dir = path.join(ROOT, p.rel);
  log(`--- ${p.name} (${p.stack}) ---`);

  if (!fs.existsSync(dir)) return { ok: false, error: "directory missing" };

  // Install deps if needed
  if (p.stack === "flutter") {
    log(`  flutter pub get`);
    const ok = await runCommand("flutter", ["pub", "get"], dir, 180_000);
    if (!ok) return { ok: false, error: "flutter pub get failed" };
  } else {
    if (!fs.existsSync(path.join(dir, "node_modules"))) {
      log(`  installing deps (this may take a minute)`);
      const ok = await runCommand("npm", ["install", "--silent", "--no-audit", "--no-fund"], dir, 240_000);
      if (!ok) return { ok: false, error: "npm install failed" };
    }
  }

  let port = await getFreePort();
  let child;
  if (p.stack === "next.js") {
    // If the project's `dev` script hardcodes a port (e.g. `next dev -p 9008`),
    // we must use *that* port - PORT env is ignored when -p is specified.
    let useScriptPort = null;
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
      const devScript = (pkg.scripts || {}).dev || "";
      const m = devScript.match(/-p\s+(\d+)|--port[=\s]+(\d+)/);
      if (m) useScriptPort = parseInt(m[1] || m[2], 10);
    } catch {}

    // Bypass the npm script entirely and call next dev with our own port.
    // This is more reliable than fighting with hardcoded ports in package.json.
    const nextBin = path.join(dir, "node_modules", ".bin", "next");
    if (fs.existsSync(nextBin)) {
      const env = { ...process.env, BROWSER: "none", NEXT_TELEMETRY_DISABLED: "1" };
      child = spawn(nextBin, ["dev", "-p", String(port)], {
        cwd: dir, env, detached: true, stdio: ["ignore", "pipe", "pipe"],
      });
    } else if (useScriptPort) {
      // Fallback: use the npm script and its hardcoded port.
      port = useScriptPort;
      const env = { ...process.env, BROWSER: "none", NEXT_TELEMETRY_DISABLED: "1" };
      child = spawn("npm", ["run", "dev"], { cwd: dir, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    } else {
      const env = { ...process.env, PORT: String(port), BROWSER: "none", NEXT_TELEMETRY_DISABLED: "1" };
      child = spawn("npm", ["run", "dev"], { cwd: dir, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    }
  } else if (p.stack === "vite") {
    const viteBin = path.join(dir, "node_modules", ".bin", "vite");
    const env = { ...process.env, NODE_ENV: "development" };
    if (fs.existsSync(viteBin)) {
      child = spawn(viteBin, ["--port", String(port), "--strictPort"], {
        cwd: dir, env, detached: true, stdio: ["ignore", "pipe", "pipe"],
      });
    } else {
      child = spawn("npx", ["vite", "--port", String(port), "--strictPort"], {
        cwd: dir, env, detached: true, stdio: ["ignore", "pipe", "pipe"],
      });
    }
  } else if (p.stack === "flutter") {
    child = spawn(
      "flutter",
      [
        "run", "-d", "web-server",
        "--web-port", String(port),
        "--web-hostname", "127.0.0.1",
        "--no-web-resources-cdn",
      ],
      { cwd: dir, detached: true, stdio: ["ignore", "pipe", "pipe"] }
    );
  } else {
    return { ok: false, error: "unsupported stack" };
  }

  // Tee a small log buffer for diagnostics
  let logBuf = "";
  child.stdout.on("data", (d) => { logBuf += d.toString(); if (logBuf.length > 4000) logBuf = logBuf.slice(-4000); });
  child.stderr.on("data", (d) => { logBuf += d.toString(); if (logBuf.length > 4000) logBuf = logBuf.slice(-4000); });

  log(`  waiting for http://localhost:${port}`);
  const waitMs = p.stack === "flutter" ? 360_000 : 180_000;
  const up = await waitForHttp(port, waitMs);
  if (!up) {
    await killProcess(child);
    return { ok: false, error: "server didn't come up", log: logBuf.slice(-600) };
  }

  // give it a moment to settle after first request
  await new Promise((r) => setTimeout(r, 2500));

  const outDir = path.join(SHOTS_DIR, p.name);
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  let desktopPath = null, mobilePath = null, captureErr = null;
  // Flutter web needs much longer to bootstrap (Dart JS compile + canvas paint)
  const isFlutter = p.stack === "flutter";
  const settleMs = isFlutter ? 12000 : 2500;
  try {
    const page = await browser.newPage();
    // Desktop
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
    try {
      await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle2", timeout: 60_000 });
    } catch (e) {
      // Fallback to domcontentloaded
      await page.goto(`http://localhost:${port}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    }
    if (isFlutter) {
      // wait for Flutter's glass-pane (canvas) to appear, which signals bootstrap
      await page.waitForSelector("flt-glass-pane, flutter-view, flt-scene-host", { timeout: 60_000 }).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, settleMs));
    const desktopFile = path.join(outDir, `desktop-${Date.now()}.png`);
    await page.screenshot({ path: desktopFile, fullPage: false });
    desktopPath = path.posix.join("screenshots", "projects", p.name, path.basename(desktopFile));

    // Mobile
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
    await page.reload({ waitUntil: "networkidle2", timeout: 60_000 }).catch(() => {});
    if (isFlutter) {
      await page.waitForSelector("flt-glass-pane, flutter-view, flt-scene-host", { timeout: 60_000 }).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, isFlutter ? 8000 : 1500));
    const mobileFile = path.join(outDir, `mobile-${Date.now()}.png`);
    await page.screenshot({ path: mobileFile, fullPage: false });
    mobilePath = path.posix.join("screenshots", "projects", p.name, path.basename(mobileFile));
  } catch (e) {
    captureErr = String(e.message || e);
  } finally {
    await browser.close().catch(() => {});
    await killProcess(child);
  }

  if (!desktopPath && !mobilePath) {
    return { ok: false, error: captureErr || "screenshot failed", log: logBuf.slice(-600) };
  }
  return { ok: true, desktop: desktopPath, mobile: mobilePath };
}

function runCommand(cmd, args, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, stdio: "inherit" });
    const t = setTimeout(() => { try { p.kill("SIGKILL"); } catch {} resolve(false); }, timeoutMs);
    p.on("exit", (code) => { clearTimeout(t); resolve(code === 0); });
  });
}

// ---------- main ---------------------------------------------------------

async function main() {
  const projects = JSON.parse(fs.readFileSync(PROJECTS_JSON, "utf8"));
  const onlyArg = process.argv[2] || null;
  const targets = onlyArg
    ? PROJECT_LIST.filter(([n]) => n === onlyArg)
    : PROJECT_LIST;

  const results = {};
  for (const [name, rel, stack] of targets) {
    try {
      const r = await captureProject({ name, rel, stack });
      results[name] = r;
      log(`  → ${r.ok ? "OK" : `FAIL: ${r.error}`}`);

      // update projects.json regardless
      const idx = projects.findIndex((p) => p.repo === name);
      if (idx >= 0) {
        if (r.ok) {
          projects[idx].screenshot = r.desktop || r.mobile;
          projects[idx].screenshot_status = "captured";
          projects[idx].screenshot_mobile = r.mobile || null;
          projects[idx].screenshot_desktop = r.desktop || null;
        } else {
          projects[idx].screenshot_status = "failed";
          projects[idx].screenshot_error = r.error;
        }
        fs.writeFileSync(PROJECTS_JSON, JSON.stringify(projects, null, 2));
      }
    } catch (e) {
      log(`  → CRASH: ${e.message}`);
      results[name] = { ok: false, error: String(e.message) };
    }
  }

  // After all captures, populate per-day repo screenshots:
  // for every daily entry whose repo has a captured project screenshot,
  // link the project screenshot if no day-specific one was set.
  log(`\nLinking project screenshots into daily entries...`);
  const daily = JSON.parse(fs.readFileSync(DAILY_JSON, "utf8"));
  const projShotMap = Object.fromEntries(
    projects.filter((p) => p.screenshot).map((p) => [p.repo, p.screenshot])
  );
  let linked = 0;
  for (const d of daily) {
    for (const r of d.repos) {
      if (!r.screenshot && projShotMap[r.repo]) {
        r.screenshot = projShotMap[r.repo];
        linked++;
      }
    }
    if (!d.screenshot && d.primary_repo && projShotMap[d.primary_repo]) {
      d.screenshot = projShotMap[d.primary_repo];
    }
  }
  fs.writeFileSync(DAILY_JSON, JSON.stringify(daily, null, 2));
  log(`Linked ${linked} repo entries to project screenshots`);

  log("\nSUMMARY:");
  for (const [n, r] of Object.entries(results)) {
    log(`  ${r.ok ? "✓" : "✗"} ${n} ${r.ok ? "" : "(" + r.error + ")"}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
