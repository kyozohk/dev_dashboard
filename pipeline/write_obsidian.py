#!/usr/bin/env python3
"""Write daily/weekly/monthly markdown into the Obsidian vault.

Layout (under <vault>/Kyozo/11 Tech + Dev/):
  data/daily.json           ← canonical store, read by the Next.js app
  data/weekly.json
  data/monthly.json
  data/projects.json        ← per-project info (stack, current screenshot path)
  screenshots/<repo>/...    ← project screenshots
  daily/2026/06/2026-06-06.md
  weekly/2026-W23.md
  monthly/2026-06.md
  11 Tech + Dev.md          ← landing page in the vault
"""
import json
import os
from pathlib import Path
from datetime import datetime

ROOT = Path("/Users/ashokjaiswal/Development/Kyozo")
BUILD = Path(__file__).resolve().parent  # pipeline/ dir of this repo
VAULT = Path("/Users/ashokjaiswal/Desktop/Obsidian")
DEV = VAULT / "Kyozo" / "11 Tech + Dev"

DATA = DEV / "data"
SHOTS = DEV / "screenshots"
DAILY_DIR = DEV / "daily"
WEEKLY_DIR = DEV / "weekly"
MONTHLY_DIR = DEV / "monthly"

for d in [DATA, SHOTS, DAILY_DIR, WEEKLY_DIR, MONTHLY_DIR]:
    d.mkdir(parents=True, exist_ok=True)


def _kv(k, v):
    if isinstance(v, str):
        v = v.replace('"', "'")
        return f'{k}: "{v}"'
    if isinstance(v, list):
        return f"{k}: [" + ", ".join(f'"{x}"' for x in v) + "]"
    return f"{k}: {v}"


def write_daily(daily):
    for d in daily:
        day = d["day"]
        year, month, _ = day.split("-")
        sub = DAILY_DIR / year / month
        sub.mkdir(parents=True, exist_ok=True)
        path = sub / f"{day}.md"

        front = [
            "---",
            f'day: "{day}"',
            f'weekday: "{d["weekday"]}"',
            f'iso_week: "{d["iso_week"]}"',
            f'month: "{d["month"]}"',
            f'total_commits: {d["total_commits"]}',
            f'total_insertions: {d["total_insertions"]}',
            f'total_deletions: {d["total_deletions"]}',
            f'primary_repo: "{d.get("primary_repo") or ""}"',
            f'primary_stack: "{d.get("primary_stack") or ""}"',
            f'screenshot: "{d.get("screenshot") or ""}"',
            "tags: [kyozo/development, daily]",
            "---",
            "",
        ]
        body = [
            f"# {day} — {d['weekday']}",
            "",
            f"**{d['total_commits']} commits** · +{d['total_insertions']} / -{d['total_deletions']}  ",
            f"week [[{d['iso_week']}]] · month [[{d['month']}]]",
            "",
            "## Headline",
            "",
            d.get("primary_headline", "") or "_no headline_",
            "",
        ]
        if d.get("areas"):
            body += ["## What was worked on", "", " · ".join(f"**{a}**" for a in d["areas"]), ""]
        if d.get("choices"):
            body += ["## Choices made", ""]
            for ch in d["choices"]:
                body += [f"- {ch}"]
            body += [""]
        if d.get("screenshot"):
            body += ["## Hero screenshot", "", f"![[{d['screenshot']}]]", ""]
        body += ["## Work by repo", ""]
        for r in d["repos"]:
            body += [
                f"### `{r['repo']}` _(+{r['insertions']} / -{r['deletions']}, {r['commits']} commits)_",
                "",
                f"**Headline:** {r['headline']}",
                "",
            ]
            if r.get("screenshot"):
                body += [f"![[{r['screenshot']}]]", ""]
            if r["features"]:
                body += ["**Features touched:**", ""]
                for f in r["features"]:
                    body += [f"- {f}"]
                body += [""]
            code = r.get("code") or {}
            if code:
                code_lines = []
                if code.get("pages"):
                    code_lines.append("**Pages:** " + ", ".join(code["pages"]))
                if code.get("api"):
                    code_lines.append("**API:** " + ", ".join(code["api"]))
                if code.get("components"):
                    code_lines.append("**Components:** " + ", ".join(code["components"]))
                if code.get("hooks"):
                    code_lines.append("**Hooks:** " + ", ".join(code["hooks"]))
                if code.get("widgets"):
                    code_lines.append("**Widgets:** " + ", ".join(code["widgets"]))
                if code.get("schema"):
                    code_lines.append("**Schema:** " + ", ".join(code["schema"]))
                if code.get("tables"):
                    code_lines.append("**Tables:** " + ", ".join(code["tables"]))
                if code.get("auth"):
                    code_lines.append("**Auth-related**")
                if code_lines:
                    body += ["> _from diff:_  "]
                    for line in code_lines:
                        body += ["> " + line + "  "]
                    body += [""]
            if r.get("categories"):
                cats = ", ".join(f"{k}: {v}" for k, v in r["categories"].items())
                body += [f"_areas: {cats}_", ""]
            body += ["---", ""]
        body += ["## Notes", "", d.get("notes", "") or "_(editable from the timeline app)_", ""]

        path.write_text("\n".join(front + body))


def write_weekly(weekly, _daily_index):
    for w in weekly:
        path = WEEKLY_DIR / f"{w['week']}.md"
        front = [
            "---",
            f'week: "{w["week"]}"',
            f'start: "{w["start"]}"',
            f'end: "{w["end"]}"',
            f'total_commits: {w["total_commits"]}',
            "tags: [kyozo/development, weekly]",
            "---",
            "",
        ]
        body = [
            f"# Week {w['week']}",
            "",
            f"**{w['total_commits']} commits** · +{w['total_insertions']} / -{w['total_deletions']}  ",
            f"{w['start']} → {w['end']}",
            "",
        ]
        if w.get("areas"):
            body += ["## Feature areas this week", "", " · ".join(f"**{a}**" for a in w["areas"]), ""]
        body += ["## Active repos", ""]
        for r in w["active_repos"]:
            body += [f"- `{r}`"]
        body += ["", "## Highlights", ""]
        for h in w["highlights"]:
            body += [f"- **{h['repo']}** — {h['headline']}"]
        body += ["", "## Days", ""]
        # Lookup map: day → daily entry so we can show LOC per day.
        _ddx = {d["day"]: d for d in _daily_index}
        for day in w["days"]:
            dd = _ddx.get(day)
            if dd:
                body += [
                    f"- [[{day}]] — **+{dd['total_insertions']:,}** / -{dd['total_deletions']:,}"
                ]
            else:
                body += [f"- [[{day}]]"]
        body += ["", "## Notes", "", w.get("notes", "") or "_(editable from the timeline app)_", ""]
        path.write_text("\n".join(front + body))


def write_monthly(monthly, _daily_index):
    for m in monthly:
        path = MONTHLY_DIR / f"{m['month']}.md"
        front = [
            "---",
            f'month: "{m["month"]}"',
            f'active_days: {m["active_days"]}',
            f'total_commits: {m["total_commits"]}',
            "tags: [kyozo/development, monthly]",
            "---",
            "",
        ]
        loc = m["total_insertions"] + m["total_deletions"]
        body = [
            f"# {m['month']}",
            "",
            f"**+{m['total_insertions']:,} lines shipped** · -{m['total_deletions']:,} refactored · {loc:,} LOC churned  ",
            f"_{m['active_days']} active days · {m['total_commits']} commits_",
            "",
        ]
        if m.get("areas"):
            body += ["## Feature areas this month", "", " · ".join(f"**{a}**" for a in m["areas"]), ""]
        body += ["## Active repos", ""]
        for r in m["active_repos"]:
            body += [f"- `{r}`"]
        body += ["", "## Highlights", ""]
        for h in m["highlights"]:
            body += [f"- **{h['repo']}** — {h['headline']}"]
        body += ["", "## Days", ""]
        _ddx = {d["day"]: d for d in _daily_index}
        for day in m["days"]:
            dd = _ddx.get(day)
            if dd:
                body += [
                    f"- [[{day}]] — **+{dd['total_insertions']:,}** / -{dd['total_deletions']:,}"
                ]
            else:
                body += [f"- [[{day}]]"]
        body += ["", "## Notes", "", m.get("notes", "") or "_(editable from the timeline app)_", ""]
        path.write_text("\n".join(front + body))


def write_landing(daily, weekly, monthly):
    total_added = sum(d["total_insertions"] for d in daily)
    total_removed = sum(d["total_deletions"] for d in daily)
    total_loc = total_added + total_removed
    body = [
        "# Kyozo · Tech + Dev",
        "",
        f"**{total_added:,} lines of code shipped** across {len(daily)} active days  ",
        f"_{total_removed:,} lines refactored · {total_loc:,} total LOC churned_  ",
        f"_first: {daily[0]['day']} · latest: {daily[-1]['day']}_",
        "",
        "Auto-generated from git history across all repos in `~/Development/Kyozo`.  ",
        "Editable in the **dev_dashboard** Next.js app (writes back to this vault).",
        "",
        "## Months",
        "",
        "| Month | Lines shipped | Refactored | Active days |",
        "| --- | ---: | ---: | ---: |",
    ]
    for m in monthly[::-1]:
        body += [
            f"| [[{m['month']}]] | +{m['total_insertions']:,} | -{m['total_deletions']:,} | {m['active_days']} |"
        ]
    body += ["", "## Recent days", ""]
    for d in daily[::-1][:30]:
        loc = d["total_insertions"] + d["total_deletions"]
        body += [
            f"- [[{d['day']}]] — **+{d['total_insertions']:,}** / -{d['total_deletions']:,} "
            f"({loc:,} LOC) — {d['summary']}"
        ]
    # landing note has the same name as its containing folder (Obsidian MOC convention)
    (DEV / "11 Tech + Dev.md").write_text("\n".join(body))
    # Remove the older landing-page filename if a previous run created it.
    legacy = DEV / "Development.md"
    if legacy.exists():
        legacy.unlink()


def write_projects(daily):
    """Derive a per-project record from the daily data.

    User-supplied fields on projects.json (screenshot paths/statuses, notes,
    run_command) must survive a regeneration. We re-derive counts from daily
    data but keep those user fields intact when they exist.
    """
    existing = {}
    fp = DATA / "projects.json"
    if fp.exists():
        for p in json.loads(fp.read_text()):
            existing[p["repo"]] = p

    projects = {}
    for d in daily:
        for r in d["repos"]:
            p = projects.get(r["repo"])
            if not p:
                prior = existing.get(r["repo"]) or {}
                p = {
                    "repo": r["repo"],
                    "stack": r["stack"],
                    "first_day": d["day"],
                    "last_day": d["day"],
                    "total_commits": 0,
                    "total_insertions": 0,
                    "total_deletions": 0,
                    "screenshot": prior.get("screenshot"),
                    "screenshot_status": prior.get("screenshot_status", "pending"),
                    "screenshot_desktop": prior.get("screenshot_desktop"),
                    "screenshot_mobile": prior.get("screenshot_mobile"),
                    "screenshot_error": prior.get("screenshot_error"),
                    "run_command": prior.get("run_command", ""),
                    "notes": prior.get("notes", ""),
                }
                projects[r["repo"]] = p
            p["last_day"] = d["day"]
            p["total_commits"] += r["commits"]
            p["total_insertions"] += r["insertions"]
            p["total_deletions"] += r["deletions"]
    out = sorted(projects.values(), key=lambda x: x["last_day"], reverse=True)
    fp.write_text(json.dumps(out, indent=2, ensure_ascii=False))


def _merge_daily(fresh, existing):
    """Merge freshly-generated data with what's already in the vault.

    Rule of thumb: code-derived fields (headlines, features, totals, code facets)
    are owned by the pipeline; user-derived fields (notes, screenshots) are
    owned by the vault and must not be clobbered.
    """
    by_day = {d["day"]: d for d in (existing or [])}
    out = []
    for d in fresh:
        prior = by_day.get(d["day"]) or {}
        # day-level user fields to preserve
        for k in ("notes", "screenshot"):
            if prior.get(k):
                d[k] = prior[k]
        # repo-level user fields
        prior_repos = {r["repo"]: r for r in (prior.get("repos") or [])}
        for r in d["repos"]:
            pr = prior_repos.get(r["repo"]) or {}
            if pr.get("screenshot"):
                r["screenshot"] = pr["screenshot"]
        out.append(d)
    return out


def _merge_weekly(fresh, existing):
    by = {x["week"]: x for x in (existing or [])}
    for x in fresh:
        prior = by.get(x["week"]) or {}
        if prior.get("notes"):
            x["notes"] = prior["notes"]
    return fresh


def _merge_monthly(fresh, existing):
    by = {x["month"]: x for x in (existing or [])}
    for x in fresh:
        prior = by.get(x["month"]) or {}
        if prior.get("notes"):
            x["notes"] = prior["notes"]
    return fresh


def main():
    daily = json.loads((BUILD / "daily.json").read_text())
    weekly = json.loads((BUILD / "weekly.json").read_text())
    monthly = json.loads((BUILD / "monthly.json").read_text())

    # Merge with whatever's already in the vault so user edits survive.
    daily_existing = json.loads((DATA / "daily.json").read_text()) if (DATA / "daily.json").exists() else []
    weekly_existing = json.loads((DATA / "weekly.json").read_text()) if (DATA / "weekly.json").exists() else []
    monthly_existing = json.loads((DATA / "monthly.json").read_text()) if (DATA / "monthly.json").exists() else []

    daily = _merge_daily(daily, daily_existing)
    weekly = _merge_weekly(weekly, weekly_existing)
    monthly = _merge_monthly(monthly, monthly_existing)

    # write canonical data back into the vault
    (DATA / "daily.json").write_text(json.dumps(daily, indent=2, ensure_ascii=False))
    (DATA / "weekly.json").write_text(json.dumps(weekly, indent=2, ensure_ascii=False))
    (DATA / "monthly.json").write_text(json.dumps(monthly, indent=2, ensure_ascii=False))

    write_daily(daily)
    write_weekly(weekly, daily)
    write_monthly(monthly, daily)
    write_landing(daily, weekly, monthly)
    write_projects(daily)
    print(f"Wrote {len(daily)} daily, {len(weekly)} weekly, {len(monthly)} monthly notes to {DEV}")


if __name__ == "__main__":
    main()
