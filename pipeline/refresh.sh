#!/usr/bin/env bash
# Daily refresh: re-read every git repo, regenerate JSON, write to the
# Obsidian vault, and (optionally) push data/ + screenshots/ to the
# dev_dashboard repo so the Vercel-hosted UI shows fresh data.
#
# Designed to be run from cron / launchd; logs to /tmp/kyozo-timeline-refresh.log.
# Set PUSH_TO_GIT=1 to enable the git-push step.

set -e

# Source repos to mine — the parent of dev_dashboard.
ROOT="/Users/ashokjaiswal/Development/Kyozo"

# This dashboard's repo. Detected relative to this script's location so the
# pipeline works no matter where dev_dashboard is checked out.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

VAULT_DATA="$HOME/Desktop/Obsidian/Kyozo/11 Tech + Dev/data"
VAULT_DEV="$HOME/Desktop/Obsidian/Kyozo/11 Tech + Dev"
LOG="/tmp/kyozo-timeline-refresh.log"

PUSH_TO_GIT="${PUSH_TO_GIT:-0}"

# Make sure node/git/python are on PATH inside launchd's minimal env.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

{
  echo
  echo "===== refresh at $(date -Iseconds) ====="
  echo "dashboard dir : $DASHBOARD_DIR"
  cd "$ROOT"

  echo "[1/4] extract_git.py"
  python3 "$SCRIPT_DIR/extract_git.py"

  echo "[2/4] analyze_diffs.py"
  python3 "$SCRIPT_DIR/analyze_diffs.py"

  echo "[3/4] summarize.py"
  python3 "$SCRIPT_DIR/summarize.py"

  echo "[4/4] write_obsidian.py (preserves user edits)"
  python3 "$SCRIPT_DIR/write_obsidian.py"

  if [ "$PUSH_TO_GIT" = "1" ] && [ -d "$DASHBOARD_DIR/.git" ]; then
    mkdir -p "$DASHBOARD_DIR/data" "$DASHBOARD_DIR/screenshots"
    cp "$VAULT_DEV/data"/*.json "$DASHBOARD_DIR/data/"
    rsync -a --delete "$VAULT_DEV/screenshots/" "$DASHBOARD_DIR/screenshots/"

    cd "$DASHBOARD_DIR"
    git add data/ screenshots/
    if ! git diff --cached --quiet; then
      git commit -m "data: daily refresh $(date -I)" --quiet
      git push --quiet origin HEAD || echo "  ! git push failed (network?)"
      echo "  pushed updated data/ + screenshots/ to GitHub"
    else
      echo "  no changes to push"
    fi
  fi

  echo "===== done at $(date -Iseconds) ====="
} >> "$LOG" 2>&1
