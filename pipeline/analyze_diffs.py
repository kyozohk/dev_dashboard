#!/usr/bin/env python3
"""For each commit, pull the diff and extract actual code-level changes.

Outputs `commit_briefs.json` keyed by commit hash. Each entry contains:
  {
    "summary":  "Added /api/messages route. New components: MessageThread, MessageBubble. Schema: +Message.parentId.",
    "api":      ["POST /api/messages", "GET /api/messages/[id]"],
    "pages":    ["/messages"],
    "components": ["MessageThread", "MessageBubble"],
    "hooks":    ["useMessages"],
    "functions": [...],
    "schema":   ["model Message", "+Message.parentId"],
    "auth":     true/false,
    "deletions_dominant": false,
  }

These briefs then feed summarize.py so headlines and feature lists describe what
was actually built — not just what the committer happened to type.
"""
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path("/Users/ashokjaiswal/Development/Kyozo")
BUILD = ROOT / "kyozo-timeline-build"
COMMITS = BUILD / "commits.json"
OUT = BUILD / "commit_briefs.json"

# ---- diff extraction -----------------------------------------------------

def get_diff(repo: str, h: str) -> str:
    """Return raw unified diff for a single commit.

    Limited to text files with a moderate size cap to keep runtime sane.
    Excludes lockfiles, generated assets and node_modules-style noise.
    """
    repo_path = ROOT / repo
    try:
        out = subprocess.run(
            [
                "git", "-C", str(repo_path), "show",
                "--format=", "-U0",  # zero context lines = smaller, focuses on actual changes
                "--no-color",
                h,
                "--",
                ":(exclude)package-lock.json",
                ":(exclude)pnpm-lock.yaml",
                ":(exclude)yarn.lock",
                ":(exclude)pubspec.lock",
                ":(exclude)*.lock",
                ":(exclude)**/node_modules/**",
                ":(exclude)**/.next/**",
                ":(exclude)**/build/**",
                ":(exclude)**/dist/**",
                ":(exclude)*.png",
                ":(exclude)*.jpg",
                ":(exclude)*.svg",
                ":(exclude)*.webp",
                ":(exclude)*.gif",
                ":(exclude)*.ico",
                ":(exclude)*.woff*",
                ":(exclude)*.ttf",
            ],
            capture_output=True, text=True, timeout=20, errors="replace",
        )
        return out.stdout
    except subprocess.TimeoutExpired:
        return ""


# ---- pattern extractors ---------------------------------------------------

# new added lines look like "+something" but not "+++ file"
def added_lines(diff: str):
    for line in diff.splitlines():
        if line.startswith("+++"):
            continue
        if line.startswith("+"):
            yield line[1:]

def removed_lines(diff: str):
    for line in diff.splitlines():
        if line.startswith("---"):
            continue
        if line.startswith("-"):
            yield line[1:]

# files changed: parse "diff --git a/foo b/foo" headers
def changed_files(diff: str):
    files = []
    for line in diff.splitlines():
        m = re.match(r"^diff --git a/(.+) b/(.+)$", line)
        if m:
            files.append(m.group(2))
    return files


# ---- code-pattern matchers ------------------------------------------------

RE_EXPORT_FN = re.compile(r"^\s*export\s+(?:async\s+)?(?:default\s+)?function\s+(\w+)\b")
RE_EXPORT_CONST_FN = re.compile(r"^\s*export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(")
RE_EXPORT_CLASS = re.compile(r"^\s*export\s+(?:default\s+)?class\s+(\w+)\b")
RE_FN_DECL = re.compile(r"^\s*(?:async\s+)?function\s+(\w+)\s*\(")
RE_DEFAULT_EXPORT_INLINE = re.compile(r"^\s*export\s+default\s+(?:async\s+)?function\s+(\w+)?")
RE_DEFAULT_EXPORT_CONST = re.compile(r"^\s*export\s+default\s+(\w+)\s*;?\s*$")
RE_REACT_COMPONENT = re.compile(r"^\s*(?:export\s+(?:default\s+)?)?(?:function|const)\s+([A-Z]\w*)\b")
RE_USE_HOOK = re.compile(r"^\s*(?:export\s+(?:default\s+)?)?(?:function|const)\s+(use[A-Z]\w*)\b")
RE_HTTP_METHOD = re.compile(r"^\s*export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b")
RE_DART_CLASS = re.compile(r"^\s*class\s+(\w+)\b")
RE_DART_WIDGET = re.compile(r"^\s*class\s+(\w+)\s+extends\s+(?:Stateless|Stateful)Widget\b")
RE_PRISMA_MODEL = re.compile(r"^\s*model\s+(\w+)\b")
RE_PRISMA_ENUM = re.compile(r"^\s*enum\s+(\w+)\b")
RE_PRISMA_FIELD = re.compile(r"^\s*(\w+)\s+(\w+)(?:\?|\[\])?\s+@")
RE_SQL_TABLE = re.compile(r"\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\"`]?(\w+)", re.I)
RE_SQL_ALTER = re.compile(r"\bALTER\s+TABLE\s+[\"`]?(\w+)", re.I)
RE_ENV_VAR = re.compile(r"^([A-Z][A-Z0-9_]+)=")

# Feature-area categoriser: maps path fragments / keywords to plain-English
# area names. Order matters — first match wins.
FEATURE_RULES = [
    # (regex on file path, area name)
    (re.compile(r"(/auth/|/login|/signin|/signup|/session|middleware\.ts$|clerk|nextauth)", re.I), "Authentication"),
    (re.compile(r"(/messages?/|/threads?/|/chat|/conversations?)", re.I), "Messaging"),
    (re.compile(r"(/comments?/|reactions?)", re.I), "Comments & Reactions"),
    (re.compile(r"(/orgs?/|/teams?/|/workspaces?/|/communit)", re.I), "Organizations & Communities"),
    (re.compile(r"(/contacts?/|/members?/|/users?/|/people)", re.I), "Members & Contacts"),
    (re.compile(r"(/payments?/|/billing|/subscription|/checkout|stripe)", re.I), "Billing & Payments"),
    (re.compile(r"(/uploads?/|/media|/files?/|/storage|cloudinary|s3)", re.I), "Media & Uploads"),
    (re.compile(r"(/notifications?/|/email|/push|sendgrid|resend)", re.I), "Notifications"),
    (re.compile(r"(/search|/discover|/explore)", re.I), "Search & Discovery"),
    (re.compile(r"(/feed|/timeline|/posts?/|/stories?/)", re.I), "Feed & Posts"),
    (re.compile(r"(/profile|/settings|/account)", re.I), "Profile & Settings"),
    (re.compile(r"(/admin|/dashboard|/analytics)", re.I), "Admin & Analytics"),
    (re.compile(r"(/onboarding|/welcome|/intro|/tour)", re.I), "Onboarding"),
    (re.compile(r"(/waitlist|/invite|/referral)", re.I), "Waitlist & Invites"),
    (re.compile(r"(/legal|/privacy|/terms|/cookies?)", re.I), "Legal"),
    (re.compile(r"(\.prisma$|/migrations?/|/schema|/db/|/models?/)", re.I), "Data model & schema"),
    (re.compile(r"(/api/[^/]+/$|app/api/)", re.I), "API surface"),
    (re.compile(r"(\.dart$|/lib/)", re.I), "Mobile app"),
    (re.compile(r"(/ui/|/components?/|\.tsx$|\.jsx$)", re.I), "UI / Components"),
    (re.compile(r"(/docs?/|README|\.md$)", re.I), "Docs"),
    (re.compile(r"(\.test\.|\.spec\.|/tests?/|/__tests__/)", re.I), "Tests"),
    (re.compile(r"(/styles?/|tailwind|\.css$|\.scss$)", re.I), "Styling"),
    (re.compile(r"(package\.json$|pubspec\.yaml$|tsconfig|next\.config|vercel\.json)", re.I), "Build & config"),
]


def classify_feature_areas(files):
    """Return de-duped list of areas matching this commit's changed files."""
    areas = []
    seen = set()
    for fn in files:
        for pat, name in FEATURE_RULES:
            if pat.search(fn):
                if name not in seen:
                    areas.append(name)
                    seen.add(name)
                break  # one bucket per file
    return areas


# Heuristic detector for "design choices" inside commit message bodies.
RE_CHOICE_HINTS = re.compile(
    r"\b(decided|chose|opted|switched|migrat|replaced|prefer|because|in order to|"
    r"trade[- ]?off|to avoid|instead of|rationale|approach)\b",
    re.I,
)


def extract_choices(body: str) -> list:
    """Pull sentences from a commit body that look like design decisions."""
    if not body:
        return []
    chunks = re.split(r"(?<=[.!?])\s+|\n+", body)
    picks = []
    for s in chunks:
        s = s.strip()
        if not s or len(s) < 25 or len(s) > 280:
            continue
        if RE_CHOICE_HINTS.search(s):
            picks.append(s)
    return picks[:3]


def analyse_one(diff: str, repo: str) -> dict:
    """Extract structured info from one commit's diff."""
    out = {
        "api": [],
        "pages": [],
        "components": [],
        "hooks": [],
        "functions": [],
        "classes": [],
        "widgets": [],
        "schema": [],
        "tables": [],
        "env": [],
        "auth": False,
        "areas": [],
        "deletions_dominant": False,
    }
    files = changed_files(diff)
    out["_files"] = files
    out["areas"] = classify_feature_areas(files)

    # File-path-driven inference
    for fn in files:
        f = fn.lower()
        # Next.js API routes
        m = re.search(r"app/(?:\([^)]+\)/)?api/(.+?)/route\.(ts|js|tsx|jsx)$", fn)
        if m:
            route = "/api/" + m.group(1)
            out["api"].append(route)
        # Next.js pages
        m = re.search(r"app/(?:\([^)]+\)/)?(.+?)/page\.(tsx|jsx|ts|js)$", fn)
        if m:
            page = "/" + m.group(1).replace("(", "").replace(")", "")
            page = re.sub(r"//+", "/", page)
            if page != "/":
                out["pages"].append(page)
            else:
                out["pages"].append("/")
        # Root page
        if re.search(r"app/page\.(tsx|jsx|ts|js)$", fn):
            out["pages"].append("/")
        # Auth-related?
        if any(s in f for s in ("/auth/", "auth.ts", "login", "signup", "signin", "/session", "middleware.ts")):
            out["auth"] = True
        # Prisma schema
        if "schema.prisma" in f:
            out["schema"].append(fn)
        # SQL migrations
        if "/migrations/" in f or re.search(r"\d+_.*\.sql$", f):
            out["schema"].append(fn)

    # Content-driven extraction (only on added lines so we report new things)
    seen_fns = set()
    seen_components = set()
    seen_hooks = set()
    seen_classes = set()
    seen_widgets = set()
    new_routes_in_content = set()

    add_count = 0
    del_count = 0
    for ln in added_lines(diff):
        add_count += 1
        # HTTP method exports → API endpoint methods
        m = RE_HTTP_METHOD.match(ln)
        if m:
            new_routes_in_content.add(m.group(1))
        # Exported functions
        m = RE_EXPORT_FN.match(ln) or RE_EXPORT_CONST_FN.match(ln) or RE_FN_DECL.match(ln)
        if m and m.group(1):
            name = m.group(1)
            if name.startswith("use") and len(name) > 3 and name[3].isupper():
                seen_hooks.add(name)
            elif name and name[0].isupper():
                seen_components.add(name)
            else:
                seen_fns.add(name)
        # Exported classes
        m = RE_EXPORT_CLASS.match(ln)
        if m:
            seen_classes.add(m.group(1))
        # Dart widgets
        m = RE_DART_WIDGET.match(ln)
        if m:
            seen_widgets.add(m.group(1))
        # Generic Dart classes
        m = RE_DART_CLASS.match(ln)
        if m and m.group(1) not in seen_widgets:
            seen_classes.add(m.group(1))
        # Prisma
        m = RE_PRISMA_MODEL.match(ln)
        if m:
            out["schema"].append(f"model {m.group(1)}")
        m = RE_PRISMA_ENUM.match(ln)
        if m:
            out["schema"].append(f"enum {m.group(1)}")
        # SQL DDL
        for m in RE_SQL_TABLE.finditer(ln):
            out["tables"].append(f"+{m.group(1)}")
        for m in RE_SQL_ALTER.finditer(ln):
            out["tables"].append(f"~{m.group(1)}")
        # env vars
        m = RE_ENV_VAR.match(ln)
        if m:
            out["env"].append(m.group(1))

    for ln in removed_lines(diff):
        del_count += 1

    out["functions"] = sorted(seen_fns)[:8]
    out["components"] = sorted(seen_components)[:8]
    out["hooks"] = sorted(seen_hooks)[:6]
    out["classes"] = sorted(seen_classes)[:6]
    out["widgets"] = sorted(seen_widgets)[:6]
    out["api"] = sorted(set(out["api"]))[:8]
    out["pages"] = sorted(set(out["pages"]))[:8]
    out["schema"] = sorted(set(out["schema"]))[:6]
    out["tables"] = sorted(set(out["tables"]))[:6]
    out["env"] = sorted(set(out["env"]))[:6]
    if del_count > 5 * max(add_count, 1):
        out["deletions_dominant"] = True
    # Attach HTTP methods to API routes if we have them
    if out["api"] and new_routes_in_content:
        methods = "+".join(sorted(new_routes_in_content))
        out["api"] = [f"{methods} {r}" for r in out["api"]]

    return out


def synth_brief(b: dict, fallback: str) -> str:
    parts = []
    if b["pages"]:
        ps = ", ".join(b["pages"][:3])
        parts.append(f"Pages: {ps}")
    if b["api"]:
        ap = ", ".join(b["api"][:3])
        parts.append(f"API: {ap}")
    if b["components"]:
        comps = ", ".join(b["components"][:4])
        parts.append(f"Components: {comps}")
    if b["widgets"]:
        ws = ", ".join(b["widgets"][:4])
        parts.append(f"Widgets: {ws}")
    if b["hooks"]:
        parts.append(f"Hooks: {', '.join(b['hooks'][:3])}")
    if b["schema"] or b["tables"]:
        sc = ", ".join((b["schema"] + b["tables"])[:4])
        parts.append(f"Schema: {sc}")
    if b["auth"]:
        parts.append("Auth")
    if not parts:
        # fall back to the original commit subject when the diff produced nothing
        return fallback or ""
    return " · ".join(parts)


# ---- main -----------------------------------------------------------------

def main():
    commits = json.loads(COMMITS.read_text())
    print(f"Analysing diffs for {len(commits)} commits…", file=sys.stderr)
    briefs = {}
    done = 0
    for c in commits:
        if c.get("is_merge"):
            briefs[c["hash"]] = {"brief": "(merge)", "raw": None}
            continue
        # cheap skip: zero text-file churn
        if c["insertions"] + c["deletions"] == 0:
            briefs[c["hash"]] = {"brief": "", "raw": None}
            continue
        diff = get_diff(c["repo"], c["hash"])
        if not diff.strip():
            briefs[c["hash"]] = {"brief": "", "raw": None}
            continue
        b = analyse_one(diff, c["repo"])
        brief = synth_brief(b, c.get("subject", ""))
        choices = extract_choices(c.get("body", ""))
        briefs[c["hash"]] = {
            "brief": brief,
            "api": b["api"], "pages": b["pages"],
            "components": b["components"], "hooks": b["hooks"],
            "functions": b["functions"], "classes": b["classes"],
            "widgets": b["widgets"], "schema": b["schema"],
            "tables": b["tables"], "auth": b["auth"],
            "areas": b["areas"],
            "choices": choices,
            "deletions_dominant": b["deletions_dominant"],
        }
        done += 1
        if done % 100 == 0:
            print(f"  {done}/{len(commits)}", file=sys.stderr)
    OUT.write_text(json.dumps(briefs, indent=2, ensure_ascii=False))
    print(f"Wrote {len(briefs)} briefs to {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
