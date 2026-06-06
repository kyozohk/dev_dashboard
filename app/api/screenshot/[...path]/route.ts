import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { DEV_DIR } from "@/lib/vault";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Serves images from the Obsidian vault's screenshots/ folder.
 * URL: /api/screenshot/<rel-path-inside-Development>
 * eg.  /api/screenshot/screenshots/projects/KyozoVerse/123-foo.png
 */
export async function GET(_req: NextRequest, ctx: { params: { path: string[] } }) {
  const rel = ctx.params.path.join("/");
  const abs = path.join(DEV_DIR, rel);

  // confine to vault directory — defend against path-traversal in user input
  if (!abs.startsWith(DEV_DIR)) {
    return new Response("forbidden", { status: 403 });
  }
  if (!fs.existsSync(abs)) {
    return new Response("not found", { status: 404 });
  }
  const buf = fs.readFileSync(abs);
  const ext = path.extname(abs).toLowerCase();
  const ct =
    ext === ".png" ? "image/png" :
    ext === ".webp" ? "image/webp" :
    ext === ".gif" ? "image/gif" :
    ext === ".svg" ? "image/svg+xml" : "image/jpeg";
  return new Response(buf, { headers: { "content-type": ct, "cache-control": "no-store" } });
}
