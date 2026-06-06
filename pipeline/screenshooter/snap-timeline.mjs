// Quick screenshot of the kyozo-timeline app itself.
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const out = "/tmp/timeline-app-shots";
fs.mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1600, deviceScaleFactor: 2 });

for (const [name, url] of [
  ["home", "http://localhost:4123/"],
  ["day", "http://localhost:4123/day/2026-06-06"],
  ["week", "http://localhost:4123/week/2026-W23"],
  ["month", "http://localhost:4123/month/2026-06"],
  ["projects", "http://localhost:4123/projects"],
]) {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 1500));
  const file = `${out}/${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log("→", file);
}
await browser.close();
