#!/usr/bin/env python3
"""Produce daily / weekly / monthly summaries from commits.json.

For each day we group commits by repo, and synthesise a short headline by
looking at the highest-impact non-merge commit subjects + file paths touched.
This is rule-based (no LLM) so it runs instantly and is deterministic.

Daily entry shape:
{
  "day": "2026-03-12",
  "weekday": "Thursday",
  "iso_week": "2026-W11",
  "month": "2026-03",
  "total_commits": 12,
  "total_insertions": 845,
  "total_deletions": 200,
  "repos": [
     {
       "repo": "KyozoVerse",
       "commits": [...],
       "stack": "next.js" | "flutter" | "react-native" | "static" | "unknown",
       "headline": "...",
       "features": ["...","..."],
       "screenshot": null   # filled in later
     },
   ],
  "summary": "Across N repos: ...",
  "screenshot": null,     # day-level hero screenshot
  "notes": ""             # user-editable
}
"""
import json
import re
from collections import defaultdict, Counter
from datetime import datetime, date
from pathlib import Path

ROOT = Path("/Users/ashokjaiswal/Development/Kyozo")
BUILD = ROOT / "kyozo-timeline-build"
COMMITS = BUILD / "commits.json"

# ---- repo → stack heuristic ------------------------------------------------

STACK_OVERRIDES = {
    "kyozo_flutter": "flutter",
    "kyozo_react_native": "react-native",
    "kyozo-figma": "design",
    "kyozo-legal": "docs",
    "kyozo_docs": "docs",
    "kyozo_coming_soon": "next.js",
    "kyozo_dataroom": "next.js",
    "kyozo-admin": "next.js",
    "KyozoAdmin": "next.js",
    "kyozo-developers": "next.js",
    "Kyozo-Loop-Front": "next.js",
    "KyozoLoop": "next.js",
    "kyozosocial": "next.js",
    "KyozoVerse": "next.js",
    "kyozo-pro-flow": "next.js",
    "old/KyozoVerse": "next.js",
    "old/kyozo-pro-flow": "next.js",
    "old/KyozoProV3": "next.js",
    "old/kyozo_feed": "next.js",
    "spheres-tech": "next.js",
    "spheres.tech": "next.js",
    "waitlist.kyozo.com": "next.js",
    "www.kyozo.com": "next.js",
    "LoopDemo": "next.js",
    "demo": "static",
}

# ---- categorising file paths ----------------------------------------------

def file_category(path: str) -> str:
    p = path.lower()
    if any(s in p for s in ("/auth", "login", "signup", "signin", "session", "oauth")):
        return "auth"
    if any(s in p for s in ("/api/", "/server/", "route.ts", "route.js", "routes/")):
        return "api"
    if "schema" in p or "migration" in p or "/prisma/" in p or "/db/" in p:
        return "db"
    if any(s in p for s in ("/ui/", "component", "/pages/", "/app/", ".tsx", ".jsx")):
        return "ui"
    if p.endswith((".dart",)) or "/lib/" in p and p.endswith(".dart"):
        return "flutter"
    if any(s in p for s in (".md", "readme", "/docs/")):
        return "docs"
    if any(s in p for s in ("package.json", "yarn.lock", "package-lock", "pubspec", "requirements", "tsconfig", ".env", "vercel.json", "next.config")):
        return "config"
    if any(s in p for s in (".css", "tailwind", ".scss")):
        return "style"
    if any(s in p for s in ("test", "spec.")):
        return "test"
    if any(s in p for s in (".png", ".jpg", ".svg", ".webp", ".gif")):
        return "asset"
    return "other"


# ---- subject cleaning -----------------------------------------------------

SKIP_SUBJECTS = re.compile(r"^(merge|wip|fix typo|fixes?$|update$|updates?$|commit$|.{1,3}$|chore: ?$)", re.I)

def clean_subject(s: str) -> str:
    s = s.strip()
    # strip leading bullet/list markers
    s = re.sub(r"^[\*\-•]+\s*", "", s)
    # strip conventional commit prefix
    s = re.sub(r"^(feat|fix|chore|refactor|docs|style|test|build|ci|perf|revert)(\([^)]*\))?:\s*", "", s, flags=re.I)
    return s.strip()


def _best_text(c) -> str:
    """Prefer the code-based brief over the commit subject when we have one."""
    brief = (c.get("code_brief") or "").strip()
    subj = clean_subject(c.get("subject") or "")
    # If the brief gives any structured info, prefer it.
    if brief and len(brief) > 8:
        return brief
    return subj


def pick_headline(commits):
    """Pick a representative line for the day for this repo."""
    scored = []
    for c in commits:
        if c["is_merge"]:
            continue
        text = _best_text(c)
        if not text or SKIP_SUBJECTS.match(text):
            continue
        weight = c["insertions"] + c["deletions"] + 1
        scored.append((weight, text))
    if not scored:
        for c in commits:
            if not c["is_merge"]:
                return _best_text(c) or "(no message)"
        return "(merges only)"
    scored.sort(reverse=True)
    return scored[0][1]


def pick_features(commits, top_n=5):
    seen = set()
    feats = []
    scored = []
    for c in commits:
        if c["is_merge"]:
            continue
        text = _best_text(c)
        if not text or SKIP_SUBJECTS.match(text):
            continue
        weight = c["insertions"] + c["deletions"]
        scored.append((weight, text))
    scored.sort(reverse=True)
    for _, s in scored:
        key = s.lower()[:60]
        if key in seen:
            continue
        seen.add(key)
        feats.append(s)
        if len(feats) >= top_n:
            break
    return feats


def aggregate_code_facets(commits) -> dict:
    """Roll up structured per-commit code facets into per-repo-day buckets."""
    out: dict = {}
    for c in commits:
        for facet, items in (c.get("code") or {}).items():
            if isinstance(items, bool):
                if items:
                    out[facet] = True
                continue
            out.setdefault(facet, [])
            for it in items:
                if it not in out[facet]:
                    out[facet].append(it)
    for k, v in list(out.items()):
        if isinstance(v, list):
            out[k] = v[:12]
    return out


def aggregate_areas(commits) -> list:
    seen = set()
    ordered = []
    for c in commits:
        for a in (c.get("areas") or []):
            if a not in seen:
                seen.add(a)
                ordered.append(a)
    return ordered


def aggregate_choices(commits) -> list:
    seen = set()
    out = []
    for c in commits:
        for ch in (c.get("choices") or []):
            key = ch.lower()[:80]
            if key in seen:
                continue
            seen.add(key)
            out.append(ch)
    return out[:5]


def main():
    commits = json.loads(COMMITS.read_text())
    print(f"Loaded {len(commits)} commits")

    # Load code-based briefs if available — these describe what was *built*
    # at code level (new API routes, components, schema), not just the
    # commit message the author happened to type.
    briefs_path = BUILD / "commit_briefs.json"
    briefs = {}
    if briefs_path.exists():
        briefs = json.loads(briefs_path.read_text())
        # Replace each commit's subject with its code-based brief (when one
        # exists) so the rest of the pipeline ranks/picks from real content.
        replaced = 0
        for c in commits:
            b = briefs.get(c["hash"])
            if b and b.get("brief"):
                c["code_brief"] = b["brief"]
                # tag the structured fields too so they can surface in the UI
                for k in ("api", "pages", "components", "hooks", "schema", "tables", "widgets", "auth"):
                    if b.get(k):
                        c.setdefault("code", {})[k] = b[k]
                # plain-English areas + choices live alongside `code` so the UI
                # can render an executive layer without digging into chips
                if b.get("areas"):
                    c["areas"] = b["areas"]
                if b.get("choices"):
                    c["choices"] = b["choices"]
                # ALSO promote the brief over the original subject, but only
                # when the original subject was uninformative (wip/update/etc.)
                subj = c.get("subject", "").strip()
                if SKIP_SUBJECTS.match(subj) or len(subj) < 8:
                    c["subject"] = b["brief"]
                    replaced += 1
        print(f"Promoted {replaced} weak commit subjects with code-based briefs")

    # group by day → repo
    by_day = defaultdict(lambda: defaultdict(list))
    for c in commits:
        if not c["day"]:
            continue
        by_day[c["day"]][c["repo"]].append(c)

    daily = []
    for day in sorted(by_day):
        repos_data = []
        total_ins = total_dels = total_commits = 0
        for repo, cs in sorted(by_day[day].items()):
            ins = sum(c["insertions"] for c in cs)
            dels = sum(c["deletions"] for c in cs)
            total_ins += ins
            total_dels += dels
            total_commits += len(cs)
            # categories
            cats = Counter()
            for c in cs:
                for f in c["files"]:
                    cats[file_category(f["file"])] += 1
            repos_data.append({
                "repo": repo,
                "stack": STACK_OVERRIDES.get(repo, "unknown"),
                "commits": len(cs),
                "insertions": ins,
                "deletions": dels,
                "headline": pick_headline(cs),
                "features": pick_features(cs),
                "categories": dict(cats.most_common(5)),
                "code": aggregate_code_facets(cs),
                "areas": aggregate_areas(cs),
                "choices": aggregate_choices(cs),
                "commit_hashes": [c["hash"] for c in cs],
                "screenshot": None,
            })
        # pick day-level headline = repo with most churn
        repos_data.sort(key=lambda r: r["insertions"] + r["deletions"], reverse=True)
        day_dt = datetime.strptime(day, "%Y-%m-%d").date()
        iso_year, iso_week, _ = day_dt.isocalendar()
        # day-level rollup of feature areas + choices across all repos
        all_areas = []
        for r in repos_data:
            for a in r.get("areas", []):
                if a not in all_areas:
                    all_areas.append(a)
        all_choices = []
        for r in repos_data:
            for ch in r.get("choices", []):
                if ch not in all_choices:
                    all_choices.append(ch)
        daily.append({
            "day": day,
            "weekday": day_dt.strftime("%A"),
            "iso_week": f"{iso_year}-W{iso_week:02d}",
            "month": day[:7],
            "year": day[:4],
            "total_commits": total_commits,
            "total_insertions": total_ins,
            "total_deletions": total_dels,
            "primary_repo": repos_data[0]["repo"] if repos_data else None,
            "primary_stack": repos_data[0]["stack"] if repos_data else None,
            "primary_headline": repos_data[0]["headline"] if repos_data else "",
            "areas": all_areas,
            "choices": all_choices[:5],
            "repos": repos_data,
            "summary": "",   # filled below
            "screenshot": None,
            "notes": "",
        })

    # build per-day summary text
    for d in daily:
        parts = [f"{r['repo']}: {r['headline']}" for r in d["repos"][:3]]
        d["summary"] = " · ".join(parts)

    (BUILD / "daily.json").write_text(json.dumps(daily, indent=2, ensure_ascii=False))
    print(f"daily.json: {len(daily)} days")

    # ---- weekly ----
    weekly = defaultdict(lambda: {"days": [], "commits": 0, "insertions": 0, "deletions": 0,
                                  "repos": Counter(), "headlines": [], "areas": Counter()})
    for d in daily:
        w = weekly[d["iso_week"]]
        w["days"].append(d["day"])
        w["commits"] += d["total_commits"]
        w["insertions"] += d["total_insertions"]
        w["deletions"] += d["total_deletions"]
        for r in d["repos"]:
            w["repos"][r["repo"]] += r["insertions"] + r["deletions"]
            if r["headline"]:
                w["headlines"].append((r["insertions"] + r["deletions"], r["repo"], r["headline"]))
        for a in d.get("areas", []):
            w["areas"][a] += 1

    weekly_out = []
    for wk in sorted(weekly):
        w = weekly[wk]
        top_repos = [r for r, _ in w["repos"].most_common(3)]
        w["headlines"].sort(reverse=True)
        top_lines = []
        seen = set()
        for _, repo, head in w["headlines"]:
            key = (repo, head.lower()[:50])
            if key in seen: continue
            seen.add(key)
            top_lines.append({"repo": repo, "headline": head})
            if len(top_lines) >= 5: break
        weekly_out.append({
            "week": wk,
            "days": w["days"],
            "start": w["days"][0],
            "end": w["days"][-1],
            "total_commits": w["commits"],
            "total_insertions": w["insertions"],
            "total_deletions": w["deletions"],
            "active_repos": top_repos,
            "areas": [a for a, _ in w["areas"].most_common(8)],
            "highlights": top_lines,
            "notes": "",
        })
    (BUILD / "weekly.json").write_text(json.dumps(weekly_out, indent=2, ensure_ascii=False))
    print(f"weekly.json: {len(weekly_out)} weeks")

    # ---- monthly ----
    monthly = defaultdict(lambda: {"days": [], "commits": 0, "insertions": 0, "deletions": 0,
                                   "repos": Counter(), "headlines": [], "areas": Counter()})
    for d in daily:
        m = monthly[d["month"]]
        m["days"].append(d["day"])
        m["commits"] += d["total_commits"]
        m["insertions"] += d["total_insertions"]
        m["deletions"] += d["total_deletions"]
        for r in d["repos"]:
            m["repos"][r["repo"]] += r["insertions"] + r["deletions"]
            if r["headline"]:
                m["headlines"].append((r["insertions"] + r["deletions"], r["repo"], r["headline"]))
        for a in d.get("areas", []):
            m["areas"][a] += 1

    monthly_out = []
    for mo in sorted(monthly):
        m = monthly[mo]
        top_repos = [r for r, _ in m["repos"].most_common(5)]
        m["headlines"].sort(reverse=True)
        top_lines = []
        seen = set()
        for _, repo, head in m["headlines"]:
            key = (repo, head.lower()[:50])
            if key in seen: continue
            seen.add(key)
            top_lines.append({"repo": repo, "headline": head})
            if len(top_lines) >= 10: break
        monthly_out.append({
            "month": mo,
            "days": m["days"],
            "active_days": len(m["days"]),
            "total_commits": m["commits"],
            "total_insertions": m["insertions"],
            "total_deletions": m["deletions"],
            "active_repos": top_repos,
            "areas": [a for a, _ in m["areas"].most_common(10)],
            "highlights": top_lines,
            "notes": "",
        })
    (BUILD / "monthly.json").write_text(json.dumps(monthly_out, indent=2, ensure_ascii=False))
    print(f"monthly.json: {len(monthly_out)} months")


if __name__ == "__main__":
    main()
