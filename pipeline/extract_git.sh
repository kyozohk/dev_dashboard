#!/usr/bin/env bash
# Extracts commit metadata from every git repo under Kyozo into one NDJSON stream.
# Each line is a JSON object: {repo, hash, parents, date, iso, author_name, author_email, subject, body, files_changed, insertions, deletions, file_list}

set -u
ROOT="/Users/ashokjaiswal/Development/Kyozo"
OUT="/Users/ashokjaiswal/Development/Kyozo/kyozo-timeline-build/commits.ndjson"
> "$OUT"

# Find every .git directory (depth 4 to catch old/*)
repos=$(find "$ROOT" -maxdepth 4 -name ".git" -type d 2>/dev/null | grep -v kyozo-timeline-build)

# Use a unique separator unlikely to appear in commit messages
SEP=$'\x1f'   # ASCII unit separator
REC=$'\x1e'   # ASCII record separator

python3 - "$OUT" <<'PYEOF' <(
  for gitdir in $repos; do
    repo_dir=$(dirname "$gitdir")
    repo_name=${repo_dir#$ROOT/}
    # Get commits on all branches/tags reachable
    git -C "$repo_dir" log --all --no-merges --date=iso-strict \
      --pretty=format:"REPO=$repo_name|%H|%P|%ad|%an|%ae|%s%n----BODY----%n%b%n----END----" 2>/dev/null
    echo "REPO=$repo_name|--MERGES--"
    git -C "$repo_dir" log --all --merges --date=iso-strict \
      --pretty=format:"REPO=$repo_name|%H|%P|%ad|%an|%ae|%s%n----BODY----%n%b%n----END----" 2>/dev/null
  done
)
import sys, json, subprocess, re, os
out_path = sys.argv[1]
src = sys.argv[2]
with open(src) as f:
    text = f.read()
# Split into commit blocks
records = re.split(r'\n(?=REPO=)', text)
written = 0
ROOT = "/Users/ashokjaiswal/Development/Kyozo"
with open(out_path, "w") as out:
    for rec in records:
        rec = rec.strip()
        if not rec or rec.endswith("--MERGES--"):
            continue
        # header line
        try:
            header, _, rest = rec.partition("\n")
            parts = header.split("|", 6)
            if len(parts) < 7:
                continue
            repo_part, h, parents, date, an, ae, subject = parts
            repo = repo_part[len("REPO="):]
            # body
            body = ""
            m = re.search(r'----BODY----\n(.*?)\n----END----', rest, re.DOTALL)
            if m:
                body = m.group(1).strip()
            # is_merge if it has multiple parents
            is_merge = len(parents.strip().split()) > 1
            # Get numstat for this commit (works for both merges and regular)
            repo_path = os.path.join(ROOT, repo)
            try:
                ns = subprocess.run(
                    ["git", "-C", repo_path, "show", "--numstat", "--format=", h],
                    capture_output=True, text=True, timeout=10
                ).stdout
            except Exception:
                ns = ""
            files = []
            ins_total = 0
            del_total = 0
            for line in ns.splitlines():
                line = line.strip()
                if not line: continue
                cols = line.split("\t")
                if len(cols) < 3: continue
                a, d, fn = cols[0], cols[1], "\t".join(cols[2:])
                try: ai = int(a)
                except: ai = 0
                try: di = int(d)
                except: di = 0
                ins_total += ai
                del_total += di
                files.append({"file": fn, "ins": ai, "del": di})
            obj = {
                "repo": repo,
                "hash": h,
                "parents": parents.strip().split() if parents.strip() else [],
                "is_merge": is_merge,
                "date": date,
                "day": date[:10],
                "author_name": an,
                "author_email": ae,
                "subject": subject,
                "body": body,
                "insertions": ins_total,
                "deletions": del_total,
                "files_changed": len(files),
                "files": files[:50],  # cap to keep file size reasonable
            }
            out.write(json.dumps(obj, ensure_ascii=False) + "\n")
            written += 1
        except Exception as e:
            sys.stderr.write(f"err: {e}\n")
print(f"wrote {written} commits to {out_path}", file=sys.stderr)
PYEOF
