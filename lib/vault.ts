/**
 * Direct read/write against the Obsidian vault.
 *
 * Canonical source of truth = JSON files at <vault>/Kyozo/11 Tech + Dev/data/*.json
 * Markdown notes are *projections* of the JSON — when an entry is edited we
 * update both the JSON and the corresponding .md so Obsidian stays in sync.
 */
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import type { Day, Month, Project, Week } from "./types";

/**
 * Where to read JSON + screenshots from.
 *
 *  - Locally: uses your Obsidian vault. Edits write straight back.
 *  - On Vercel: vault doesn't exist; we fall back to the JSON + screenshots
 *    bundled into the deploy (committed by the nightly launchd job).
 *    Writes are best-effort and only persist until the next deploy.
 */
const VAULT = process.env.OBSIDIAN_VAULT || `${process.env.HOME ?? ""}/Desktop/Obsidian`;
const LOCAL_VAULT_DEV = path.join(VAULT, "Kyozo", "11 Tech + Dev");
const BUNDLED_ROOT = process.cwd();

const isLocalVaultPresent = (() => {
  try {
    return fsSync.existsSync(path.join(LOCAL_VAULT_DEV, "data", "daily.json"));
  } catch {
    return false;
  }
})();

// DEV_DIR always contains the data/ subfolder *and* screenshots/ subfolder,
// so relative paths stored in JSON resolve consistently in either env.
export const DEV_DIR = isLocalVaultPresent ? LOCAL_VAULT_DEV : BUNDLED_ROOT;
export const DATA_DIR = path.join(DEV_DIR, "data");
export const SHOTS_DIR = path.join(DEV_DIR, "screenshots");
export const DAILY_DIR = path.join(DEV_DIR, "daily");
export const WEEKLY_DIR = path.join(DEV_DIR, "weekly");
export const MONTHLY_DIR = path.join(DEV_DIR, "monthly");

export const READ_ONLY = !isLocalVaultPresent; // true on Vercel

async function readJson<T>(p: string): Promise<T> {
  const raw = await fs.readFile(p, "utf8");
  return JSON.parse(raw) as T;
}

async function writeJson(p: string, data: unknown) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(data, null, 2));
}

export async function readDays(): Promise<Day[]> {
  return readJson<Day[]>(path.join(DATA_DIR, "daily.json"));
}
export async function readWeeks(): Promise<Week[]> {
  return readJson<Week[]>(path.join(DATA_DIR, "weekly.json"));
}
export async function readMonths(): Promise<Month[]> {
  return readJson<Month[]>(path.join(DATA_DIR, "monthly.json"));
}
export async function readProjects(): Promise<Project[]> {
  try {
    return await readJson<Project[]>(path.join(DATA_DIR, "projects.json"));
  } catch {
    return [];
  }
}

export async function readDay(day: string): Promise<Day | null> {
  const all = await readDays();
  return all.find((d) => d.day === day) ?? null;
}
export async function readWeek(week: string): Promise<Week | null> {
  const all = await readWeeks();
  return all.find((d) => d.week === week) ?? null;
}
export async function readMonth(month: string): Promise<Month | null> {
  const all = await readMonths();
  return all.find((d) => d.month === month) ?? null;
}

export async function updateDay(day: string, patch: Partial<Day>): Promise<Day | null> {
  const all = await readDays();
  const idx = all.findIndex((d) => d.day === day);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch };
  await writeJson(path.join(DATA_DIR, "daily.json"), all);
  await regenDailyMarkdown(all[idx]);
  return all[idx];
}

export async function updateRepoOnDay(
  day: string,
  repo: string,
  patch: Partial<import("./types").RepoDay>
): Promise<Day | null> {
  const all = await readDays();
  const idx = all.findIndex((d) => d.day === day);
  if (idx < 0) return null;
  const ridx = all[idx].repos.findIndex((r) => r.repo === repo);
  if (ridx < 0) return null;
  all[idx].repos[ridx] = { ...all[idx].repos[ridx], ...patch };
  await writeJson(path.join(DATA_DIR, "daily.json"), all);
  await regenDailyMarkdown(all[idx]);
  return all[idx];
}

export async function updateWeek(week: string, patch: Partial<Week>): Promise<Week | null> {
  const all = await readWeeks();
  const idx = all.findIndex((d) => d.week === week);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch };
  await writeJson(path.join(DATA_DIR, "weekly.json"), all);
  await regenWeeklyMarkdown(all[idx]);
  return all[idx];
}

export async function updateMonth(month: string, patch: Partial<Month>): Promise<Month | null> {
  const all = await readMonths();
  const idx = all.findIndex((d) => d.month === month);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch };
  await writeJson(path.join(DATA_DIR, "monthly.json"), all);
  await regenMonthlyMarkdown(all[idx]);
  return all[idx];
}

// ---------- markdown projection -------------------------------------------

function frontmatter(rows: Record<string, unknown>): string {
  const lines = ["---"];
  for (const [k, v] of Object.entries(rows)) {
    if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map((x) => `"${String(x)}"`).join(", ")}]`);
    } else if (typeof v === "string") {
      lines.push(`${k}: "${v.replace(/"/g, "'")}"`);
    } else {
      lines.push(`${k}: ${String(v)}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

async function regenDailyMarkdown(d: Day) {
  const [year, month] = d.day.split("-");
  const dir = path.join(DAILY_DIR, year, month);
  await fs.mkdir(dir, { recursive: true });
  const fp = path.join(dir, `${d.day}.md`);

  const fm = frontmatter({
    day: d.day,
    weekday: d.weekday,
    iso_week: d.iso_week,
    month: d.month,
    total_commits: d.total_commits,
    total_insertions: d.total_insertions,
    total_deletions: d.total_deletions,
    primary_repo: d.primary_repo || "",
    primary_stack: d.primary_stack || "",
    screenshot: d.screenshot || "",
    tags: ["kyozo/development", "daily"],
  });
  const lines: string[] = [];
  lines.push(`# ${d.day} — ${d.weekday}`, "");
  lines.push(`**${d.total_commits} commits** · +${d.total_insertions} / -${d.total_deletions}  `);
  lines.push(`week [[${d.iso_week}]] · month [[${d.month}]]`, "");
  lines.push("## Headline", "", d.primary_headline || "_no headline_", "");
  if (d.areas && d.areas.length) {
    lines.push("## What was worked on", "", d.areas.map((a) => `**${a}**`).join(" · "), "");
  }
  if (d.choices && d.choices.length) {
    lines.push("## Choices made", "");
    for (const ch of d.choices) lines.push(`- ${ch}`);
    lines.push("");
  }
  if (d.screenshot) lines.push("## Hero screenshot", "", `![[${d.screenshot}]]`, "");
  lines.push("## Work by repo", "");
  for (const r of d.repos) {
    lines.push(`### \`${r.repo}\` _(+${r.insertions} / -${r.deletions}, ${r.commits} commits)_`, "");
    lines.push(`**Headline:** ${r.headline}`, "");
    if (r.screenshot) lines.push(`![[${r.screenshot}]]`, "");
    if (r.features?.length) {
      lines.push("**Features touched:**", "");
      for (const f of r.features) lines.push(`- ${f}`);
      lines.push("");
    }
    const code = r.code;
    if (code) {
      const codeLines: string[] = [];
      if (code.pages?.length) codeLines.push(`**Pages:** ${code.pages.join(", ")}`);
      if (code.api?.length) codeLines.push(`**API:** ${code.api.join(", ")}`);
      if (code.components?.length) codeLines.push(`**Components:** ${code.components.join(", ")}`);
      if (code.hooks?.length) codeLines.push(`**Hooks:** ${code.hooks.join(", ")}`);
      if (code.widgets?.length) codeLines.push(`**Widgets:** ${code.widgets.join(", ")}`);
      if (code.schema?.length) codeLines.push(`**Schema:** ${code.schema.join(", ")}`);
      if (code.tables?.length) codeLines.push(`**Tables:** ${code.tables.join(", ")}`);
      if (code.auth) codeLines.push(`**Auth-related**`);
      if (codeLines.length) {
        lines.push("> _from diff:_  ");
        for (const cl of codeLines) lines.push(`> ${cl}  `);
        lines.push("");
      }
    }
    lines.push("---", "");
  }
  lines.push("## Notes", "", d.notes || "_(editable from the timeline app)_", "");
  await fs.writeFile(fp, fm + lines.join("\n"));
}

async function regenWeeklyMarkdown(w: Week) {
  await fs.mkdir(WEEKLY_DIR, { recursive: true });
  const fp = path.join(WEEKLY_DIR, `${w.week}.md`);
  const fm = frontmatter({
    week: w.week,
    start: w.start,
    end: w.end,
    total_commits: w.total_commits,
    tags: ["kyozo/development", "weekly"],
  });
  const lines: string[] = [];
  lines.push(`# Week ${w.week}`, "");
  lines.push(`**${w.total_commits} commits** · +${w.total_insertions} / -${w.total_deletions}  `);
  lines.push(`${w.start} → ${w.end}`, "", "## Active repos", "");
  for (const r of w.active_repos) lines.push(`- \`${r}\``);
  lines.push("", "## Highlights", "");
  for (const h of w.highlights) lines.push(`- **${h.repo}** — ${h.headline}`);
  lines.push("", "## Days", "");
  for (const d of w.days) lines.push(`- [[${d}]]`);
  lines.push("", "## Notes", "", w.notes || "_(editable from the timeline app)_", "");
  await fs.writeFile(fp, fm + lines.join("\n"));
}

async function regenMonthlyMarkdown(m: Month) {
  await fs.mkdir(MONTHLY_DIR, { recursive: true });
  const fp = path.join(MONTHLY_DIR, `${m.month}.md`);
  const fm = frontmatter({
    month: m.month,
    active_days: m.active_days,
    total_commits: m.total_commits,
    tags: ["kyozo/development", "monthly"],
  });
  const lines: string[] = [];
  lines.push(`# ${m.month}`, "");
  lines.push(`**${m.total_commits} commits across ${m.active_days} active days** · +${m.total_insertions} / -${m.total_deletions}`, "");
  lines.push("## Active repos", "");
  for (const r of m.active_repos) lines.push(`- \`${r}\``);
  lines.push("", "## Highlights", "");
  for (const h of m.highlights) lines.push(`- **${h.repo}** — ${h.headline}`);
  lines.push("", "## Days", "");
  for (const d of m.days) lines.push(`- [[${d}]]`);
  lines.push("", "## Notes", "", m.notes || "_(editable from the timeline app)_", "");
  await fs.writeFile(fp, fm + lines.join("\n"));
}

// ---------- screenshots ---------------------------------------------------

export async function saveScreenshot(
  scope: "day" | "repo-day" | "project",
  key: string,
  filename: string,
  bytes: Buffer
): Promise<string> {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const subdir = scope === "project" ? path.join("projects", key) : path.join(scope, key);
  const target = path.join(SHOTS_DIR, subdir);
  await fs.mkdir(target, { recursive: true });
  const finalName = `${Date.now()}-${safe}`;
  await fs.writeFile(path.join(target, finalName), bytes);
  // path stored in JSON is relative to <vault>/Kyozo/11 Tech + Dev
  return path.posix.join("screenshots", subdir, finalName);
}

export function vaultRelToAbs(rel: string): string {
  return path.join(DEV_DIR, rel);
}

export async function updateProject(repo: string, patch: Partial<Project>): Promise<Project | null> {
  const all = await readProjects();
  const idx = all.findIndex((p) => p.repo === repo);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch };
  await writeJson(path.join(DATA_DIR, "projects.json"), all);
  return all[idx];
}
