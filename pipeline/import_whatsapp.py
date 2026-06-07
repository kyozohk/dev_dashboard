#!/usr/bin/env python3
"""Parse WhatsApp chat exports into a structured day-keyed JSON, and copy
referenced media into the Obsidian vault.

WhatsApp export format per line:

    [DD/MM/YYYY, H:MM:SS AM/PM] Sender: message body
    [DD/MM/YYYY, H:MM:SS AM/PM] Sender: caption ‎<attached: file.ext>

Each chat folder contains a `_chat.txt` plus the referenced media files
with names like `00000148-PHOTO-2026-01-07-13-48-49.jpg`.

Outputs `pipeline/whatsapp_events.json`:

    {
      "2026-01-07": [
        {"chat": "kyozo-hq", "time": "13:48:49", "sender": "Ashok",
         "text": "demo of …", "attachments": ["whatsapp-media/kyozo-hq/00000148-…jpg"]}
      ]
    }

Media is copied into `<vault>/11 Tech + Dev/whatsapp-media/<chat-slug>/`.
The relative paths recorded in JSON are the same paths Obsidian uses for
embeds (`![[whatsapp-media/kyozo-hq/foo.jpg]]`).
"""
import json
import re
import shutil
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

# --- media resize policy --------------------------------------------------
# Images: max 1920px on the longer edge, JPEG quality 85.
# Videos: scale-down to 1280-wide (or pass-through if already smaller),
#         H.264 medium preset CRF 26 — gives a reasonable size for
#         demo/release recordings without losing legibility.
IMAGE_MAX_DIM = 1920
IMAGE_QUALITY = 85
VIDEO_MAX_WIDTH = 1280
VIDEO_CRF = 26
# Don't bother resizing files already smaller than this (bytes).
SMALL_FILE_THRESHOLD = 400 * 1024  # 400 KB
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic"}
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".avi"}


def resize_image(src: Path, dest: Path) -> str:
    """Return 'resized'/'copied'/'failed' and write to dest."""
    if src.stat().st_size < SMALL_FILE_THRESHOLD:
        shutil.copy2(src, dest)
        return "copied"
    try:
        subprocess.run(
            [
                "magick", str(src),
                "-auto-orient",
                "-resize", f"{IMAGE_MAX_DIM}x{IMAGE_MAX_DIM}>",
                "-quality", str(IMAGE_QUALITY),
                str(dest),
            ],
            check=True, capture_output=True, timeout=60,
        )
        return "resized"
    except Exception as e:
        print(f"    image resize failed for {src.name}: {e}", file=sys.stderr)
        shutil.copy2(src, dest)
        return "copied"


def resize_video(src: Path, dest: Path) -> str:
    if src.stat().st_size < SMALL_FILE_THRESHOLD * 4:  # ~1.5 MB
        shutil.copy2(src, dest)
        return "copied"
    try:
        # -y overwrite, scale only if width > target, h264 + aac
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(src),
                "-vf", f"scale='min({VIDEO_MAX_WIDTH},iw)':-2",
                "-c:v", "libx264", "-preset", "medium", "-crf", str(VIDEO_CRF),
                "-c:a", "aac", "-b:a", "96k",
                "-movflags", "+faststart",
                str(dest),
            ],
            check=True, capture_output=True, timeout=600,
        )
        return "resized"
    except Exception as e:
        print(f"    video resize failed for {src.name}: {e}", file=sys.stderr)
        shutil.copy2(src, dest)
        return "copied"


def copy_or_resize(src: Path, dest: Path) -> str:
    """Decide based on extension which resize path to use."""
    ext = src.suffix.lower()
    if ext in IMAGE_EXTS:
        return resize_image(src, dest)
    if ext in VIDEO_EXTS:
        return resize_video(src, dest)
    # PDFs and everything else — straight copy.
    shutil.copy2(src, dest)
    return "copied"

ROOT = Path("/Users/ashokjaiswal/Development/Kyozo")
WHATS_DIR = ROOT / "whatsapp"
HERE = Path(__file__).resolve().parent
OUT = HERE / "whatsapp_events.json"
VAULT_DEV = Path("/Users/ashokjaiswal/Desktop/Obsidian/Kyozo/11 Tech + Dev")
# Photos and videos land in the same `screenshots/` folder as captured
# project screenshots — no chat sub-folders. Filenames get prefixed with
# the chat slug to avoid collisions (each chat numbers attachments 1, 2, …).
MEDIA_DEST = VAULT_DEV / "screenshots"

CHATS = {
    "WhatsApp Chat - Kyozo HQ 🎯": "hq",
    "WhatsApp Chat - Kyozo Graphics": "graphics",
    "WhatsApp Chat - Willer": "willer",
}

# Chats whose messages are assumed product-relevant by default (team chats).
TEAM_CHATS = {"hq", "graphics"}

# Words that mark a message as product-relevant (case-insensitive substring).
PRODUCT_KEYWORDS = [
    "kyozo", "demo", "screen", "screenshot", "design", "mock", "mockup",
    "ui", "ux", "feed", "post", "page", "view", "dashboard", "login", "signin",
    "signup", "app", "build", "deploy", "deployed", "ship", "shipping",
    "shipped", "launch", "launched", "release", "released", "live", "preview",
    "prototype", "beta", "v1", "v2", "v3", "version", "rollout", "milestone",
    "loop", "verse",  # product names
    "figma", "vercel", "loom",  # tools-in-context
]
_KW_RE = re.compile("|".join(re.escape(k) for k in PRODUCT_KEYWORDS), re.I)
_URL_RE = re.compile(r"https?://\S+", re.I)

# Line opener for a message. Note WhatsApp prepends an invisible LRM (U+200E)
# to many lines — we strip leading whitespace + that char before matching.
RE_LINE = re.compile(
    r"^\s*‎?\s*\[(\d{1,2})/(\d{1,2})/(\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})\s*([AP]M)\]\s*([^:]+?):\s*(.*)$"
)
RE_ATTACH = re.compile(r"<attached:\s*([^>]+?)>")


def to_24h(h, m, s, ampm):
    h = int(h)
    if ampm == "PM" and h != 12:
        h += 12
    if ampm == "AM" and h == 12:
        h = 0
    return f"{h:02d}:{int(m):02d}:{int(s):02d}"


def parse_chat(folder: Path, slug: str):
    """Yield (day, time, sender, text, attachments_relpath_list)."""
    txt = (folder / "_chat.txt").read_text(encoding="utf-8", errors="replace")
    # WhatsApp exports use   line separators sometimes; normalise.
    txt = txt.replace(" ", "\n").replace("‎", "")

    # A message can span multiple lines (caption continuations). We detect the
    # start of each message by the timestamp pattern and accumulate continuation
    # lines until the next match.
    msgs = []
    current = None
    for raw_line in txt.splitlines():
        line = raw_line
        m = RE_LINE.match(line)
        if m:
            if current:
                msgs.append(current)
            dd, mm, yyyy = m.group(1), m.group(2), m.group(3)
            hh, mi, ss, ampm = m.group(4), m.group(5), m.group(6), m.group(7)
            day = f"{yyyy}-{int(mm):02d}-{int(dd):02d}"
            time = to_24h(hh, mi, ss, ampm)
            sender = m.group(8).strip()
            body = m.group(9)
            current = {"day": day, "time": time, "sender": sender, "text": body, "raw_lines": [body]}
        else:
            if current is not None and line.strip():
                current["raw_lines"].append(line)
    if current:
        msgs.append(current)

    out = []
    for msg in msgs:
        body = "\n".join(msg["raw_lines"])
        # Strip the attachment markers from visible text first.
        clean = RE_ATTACH.sub("", body).strip().strip("‎ \t")
        # Parse attachments — keep ONLY images + videos. Drop PDFs, audio,
        # voice notes, contact cards: management-irrelevant noise.
        attachments = []
        for am in RE_ATTACH.finditer(body):
            fname = am.group(1).strip()
            src = folder / fname
            if not src.exists():
                continue
            ext = Path(fname).suffix.lower()
            if ext not in IMAGE_EXTS and ext not in VIDEO_EXTS:
                continue  # skip PDFs/audio/vcards/etc.
            # New filename prefix with chat slug avoids cross-chat collisions
            new_name = f"{slug}-{fname}"
            rel = f"screenshots/{new_name}"
            attachments.append({"file": new_name, "src_path": str(src), "rel": rel, "kind": "video" if ext in VIDEO_EXTS else "image"})

        # Product-relevance: drop anything we can't justify keeping.
        # Rules:
        #   - videos are always kept (rare + almost always demos)
        #   - photos in team chats (hq/graphics) are always kept
        #   - photos in Willer chat require: URL nearby OR product keyword in text
        #   - text-only messages: keep if they contain a URL (likely product link)
        has_video = any(a["kind"] == "video" for a in attachments)
        has_image = any(a["kind"] == "image" for a in attachments)
        has_url = bool(_URL_RE.search(clean))
        has_kw = bool(_KW_RE.search(clean))

        if has_video:
            keep = True
        elif has_image:
            keep = (slug in TEAM_CHATS) or has_url or has_kw
        elif has_url:
            keep = True   # standalone product link
        else:
            keep = False

        if not keep:
            continue

        out.append({
            "day": msg["day"],
            "time": msg["time"],
            "sender": msg["sender"],
            "text": clean,
            "attachments": attachments,
        })
    return out


def main():
    if not WHATS_DIR.exists():
        sys.exit(f"WhatsApp folder not found: {WHATS_DIR}")
    by_day = defaultdict(list)
    media_resized = 0
    media_copied = 0
    media_skipped = 0
    bytes_in = 0
    bytes_out = 0

    MEDIA_DEST.mkdir(parents=True, exist_ok=True)
    for chat_dir_name, slug in CHATS.items():
        folder = WHATS_DIR / chat_dir_name
        if not folder.exists():
            print(f"  ! missing chat folder: {folder}", file=sys.stderr)
            continue
        print(f"parsing {folder.name} → {slug}", file=sys.stderr)
        msgs = parse_chat(folder, slug)
        print(f"  {len(msgs)} product-relevant messages", file=sys.stderr)

        # Copy referenced media into the FLAT screenshots/ directory.
        for msg in msgs:
            for a in msg["attachments"]:
                src = Path(a["src_path"])
                dest = MEDIA_DEST / a["file"]
                if dest.exists() and dest.stat().st_size > 0:
                    media_skipped += 1
                else:
                    result = copy_or_resize(src, dest)
                    if result == "resized":
                        media_resized += 1
                    else:
                        media_copied += 1
                    bytes_in += src.stat().st_size
                    bytes_out += dest.stat().st_size if dest.exists() else 0
                a.pop("src_path", None)
                a.pop("kind", None)

        for msg in msgs:
            by_day[msg["day"]].append({
                "chat": slug,
                "time": msg["time"],
                "sender": msg["sender"],
                "text": msg["text"],
                "attachments": msg["attachments"],
            })

    # sort each day's events chronologically
    for day in by_day:
        by_day[day].sort(key=lambda e: e["time"])

    OUT.write_text(json.dumps(by_day, indent=2, ensure_ascii=False))
    days = sorted(by_day.keys())
    msg_total = sum(len(v) for v in by_day.values())
    print(f"\n{msg_total} messages across {len(days)} days", file=sys.stderr)
    if days:
        print(f"  first day: {days[0]}", file=sys.stderr)
        print(f"  last day:  {days[-1]}", file=sys.stderr)
    mb = lambda n: f"{n/1024/1024:.1f} MB"
    print(
        f"  resized {media_resized}, copied {media_copied}, "
        f"skipped {media_skipped} (already present)",
        file=sys.stderr,
    )
    if bytes_in:
        savings = 100 * (1 - bytes_out / max(bytes_in, 1))
        print(f"  size: in {mb(bytes_in)} → out {mb(bytes_out)} ({savings:.0f}% smaller)", file=sys.stderr)
    print(f"  events  → {OUT}", file=sys.stderr)
    print(f"  media   → {MEDIA_DEST}", file=sys.stderr)


if __name__ == "__main__":
    main()
