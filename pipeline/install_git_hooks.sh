#!/usr/bin/env bash
# Install the dashboard-refresh hook into every Kyozo repo so that any
# `git commit`, `git merge`, `git pull`, `git checkout` or `git rebase`
# automatically refreshes the Obsidian vault + dashboard data.
#
# Run once:
#   ./pipeline/install_git_hooks.sh
#
# Run with --uninstall to remove the hooks:
#   ./pipeline/install_git_hooks.sh --uninstall
#
# Idempotent — re-running is safe. Skips repos that already have an
# identical hook. Does NOT touch hooks that aren't ours.

set -u

ROOT="/Users/ashokjaiswal/Development/Kyozo"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$SCRIPT_DIR/git_hooks/kyozo-dashboard-refresh"
MARKER="# kyozo-dashboard-refresh-hook"   # used to recognise our own hooks

# Hooks we want installed in every repo.
HOOKS=(post-commit post-merge post-checkout post-rewrite)

# Repos we should NOT touch — the dashboard itself, the screenshots
# scratch dir, and anything inside dev_dashboard.
SKIP_PATTERNS=(
  "/dev_dashboard/"
  "/kyozo-timeline/"          # legacy
  "/kyozo-timeline-build/"    # legacy
)

is_skipped() {
  for pat in "${SKIP_PATTERNS[@]}"; do
    case "$1" in *"$pat"*) return 0 ;; esac
  done
  return 1
}

if [ ! -f "$TEMPLATE" ]; then
  echo "ERROR: hook template not found: $TEMPLATE" >&2
  exit 1
fi

action="${1:-install}"
installed=0
skipped=0
removed=0
preserved=0

# Walk every .git dir under ROOT.
while IFS= read -r gitdir; do
  if is_skipped "$gitdir"; then continue; fi
  hooks_dir="$gitdir/hooks"
  [ -d "$hooks_dir" ] || mkdir -p "$hooks_dir"

  for h in "${HOOKS[@]}"; do
    target="$hooks_dir/$h"

    if [ "$action" = "--uninstall" ]; then
      if [ -f "$target" ] && grep -q "$MARKER" "$target" 2>/dev/null; then
        rm -f "$target"
        removed=$((removed+1))
      fi
      continue
    fi

    if [ -f "$target" ]; then
      if grep -q "$MARKER" "$target" 2>/dev/null; then
        # Already ours — only rewrite if template changed.
        if ! diff -q "$target" "$TEMPLATE" >/dev/null 2>&1; then
          cp "$TEMPLATE" "$target"
          installed=$((installed+1))
        else
          skipped=$((skipped+1))
        fi
      else
        # Someone else's hook lives here — leave it alone, just chain.
        # We append a one-liner to call our hook in addition.
        if ! grep -q "kyozo-dashboard-refresh" "$target" 2>/dev/null; then
          {
            echo ""
            echo "$MARKER chained from existing hook"
            echo "$TEMPLATE \"\$@\""
          } >> "$target"
          installed=$((installed+1))
        else
          preserved=$((preserved+1))
        fi
      fi
    else
      cp "$TEMPLATE" "$target"
      installed=$((installed+1))
    fi
    chmod +x "$target"
  done

  echo "  ✓ ${gitdir%/.git}"
done < <(find "$ROOT" -name ".git" -type d 2>/dev/null)

echo ""
if [ "$action" = "--uninstall" ]; then
  echo "Uninstalled $removed hook(s)"
else
  echo "Installed/updated $installed hook(s); $skipped already up-to-date; $preserved chained from existing hooks"
  echo ""
  echo "Test it: make a commit in any Kyozo repo and watch"
  echo "  tail -f /tmp/kyozo-timeline-refresh.log"
fi
