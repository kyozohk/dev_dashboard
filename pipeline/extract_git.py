#!/usr/bin/env python3
"""Extract commit metadata from every git repo under Kyozo into commits.json."""

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path("/Users/ashokjaiswal/Development/Kyozo")
HERE = Path(__file__).resolve().parent  # pipeline/ dir of this repo
OUT = HERE / "commits.json"

SEP = "\x1f"  # unit separator (very unlikely in commit messages)
REC = "\x1e"  # record separator


def find_repos():
    repos = []
    for git_dir in ROOT.rglob(".git"):
        # Skip any of our own ephemeral / scaffold dirs.
        s = str(git_dir)
        if "kyozo-timeline-build" in s or "/dev_dashboard/" in s or "/kyozo-timeline/" in s:
            continue
        if not git_dir.is_dir():
            continue
        repo = git_dir.parent
        # only those directly under ROOT or under ROOT/old
        rel = repo.relative_to(ROOT)
        if len(rel.parts) > 2:
            continue
        repos.append(repo)
    return sorted(repos)


def get_commits(repo: Path):
    fmt = SEP.join(["%H", "%P", "%ad", "%an", "%ae", "%s", "%b"]) + REC
    try:
        out = subprocess.run(
            ["git", "-C", str(repo), "log", "--all", "--date=iso-strict",
             f"--pretty=format:{fmt}"],
            capture_output=True, text=True, timeout=120
        )
    except subprocess.TimeoutExpired:
        sys.stderr.write(f"timeout: {repo}\n")
        return []
    if out.returncode != 0:
        sys.stderr.write(f"git failed for {repo}: {out.stderr[:200]}\n")
        return []
    records = []
    for chunk in out.stdout.split(REC):
        chunk = chunk.strip("\n")
        if not chunk:
            continue
        parts = chunk.split(SEP)
        if len(parts) < 7:
            continue
        h, parents, date, an, ae, subject, body = parts[:7]
        records.append({
            "hash": h,
            "parents": parents.split() if parents else [],
            "date": date,
            "day": date[:10] if date else "",
            "author_name": an,
            "author_email": ae,
            "subject": subject,
            "body": body.strip(),
        })
    return records


def get_numstat(repo: Path, h: str):
    try:
        out = subprocess.run(
            ["git", "-C", str(repo), "show", "--numstat", "--format=", h],
            capture_output=True, text=True, timeout=15
        )
    except subprocess.TimeoutExpired:
        return 0, 0, 0, []
    ins = dels = 0
    files = []
    for line in out.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        cols = line.split("\t")
        if len(cols) < 3:
            continue
        a, d, fn = cols[0], cols[1], "\t".join(cols[2:])
        ai = int(a) if a.isdigit() else 0
        di = int(d) if d.isdigit() else 0
        ins += ai
        dels += di
        files.append({"file": fn, "ins": ai, "del": di})
    return ins, dels, len(files), files[:30]


def main():
    repos = find_repos()
    print(f"Found {len(repos)} repos", file=sys.stderr)
    all_commits = []
    for repo in repos:
        rel = str(repo.relative_to(ROOT))
        commits = get_commits(repo)
        print(f"  {rel}: {len(commits)} commits", file=sys.stderr)
        for c in commits:
            ins, dels, nfiles, files = get_numstat(repo, c["hash"])
            c["repo"] = rel
            c["is_merge"] = len(c["parents"]) > 1
            c["insertions"] = ins
            c["deletions"] = dels
            c["files_changed"] = nfiles
            c["files"] = files
            all_commits.append(c)
    # Sort by date asc
    all_commits.sort(key=lambda x: x["date"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(all_commits, indent=2, ensure_ascii=False))
    print(f"Wrote {len(all_commits)} commits to {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
