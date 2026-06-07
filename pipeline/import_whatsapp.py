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
MEDIA_DEST = VAULT_DEV / "whatsapp-media"

CHATS = {
    "WhatsApp Chat - Kyozo HQ 🎯": "kyozo-hq",
    "WhatsApp Chat - Kyozo Graphics": "kyozo-graphics",
    "WhatsApp Chat - Willer": "willer",
}

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
        attachments = []
        for am in RE_ATTACH.finditer(body):
            fname = am.group(1).strip()
            src = folder / fname
            if not src.exists():
                continue
            rel = f"whatsapp-media/{slug}/{fname}"
            attachments.append({"file": fname, "rel": rel, "src": str(src)})
        # remove the attachment tags from the visible text
        clean = RE_ATTACH.sub("", body).strip()
        # drop the trailing "‎" marker that WhatsApp inserts
        clean = clean.strip("‎ \t")
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

    for chat_dir_name, slug in CHATS.items():
        folder = WHATS_DIR / chat_dir_name
        if not folder.exists():
            print(f"  ! missing chat folder: {folder}", file=sys.stderr)
            continue
        print(f"parsing {folder.name} → {slug}", file=sys.stderr)
        msgs = parse_chat(folder, slug)
        print(f"  {len(msgs)} messages", file=sys.stderr)

        # Copy referenced media into the vault. We only copy attachments that
        # are actually referenced — orphans in the folder are skipped.
        dest_root = MEDIA_DEST / slug
        dest_root.mkdir(parents=True, exist_ok=True)
        for msg in msgs:
            for a in msg["attachments"]:
                src = Path(a["src"])
                dest = dest_root / a["file"]
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
                # Trim src field — only `file` + `rel` should land in the JSON.
                a.pop("src", None)

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
