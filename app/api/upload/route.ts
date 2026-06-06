import { NextRequest, NextResponse } from "next/server";
import {
  saveScreenshot,
  updateDay,
  updateRepoOnDay,
  updateProject,
} from "@/lib/vault";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Accepts multipart form-data:
 *   file       — image file
 *   scope      — "day" | "repo-day" | "project"
 *   key        — for "day": YYYY-MM-DD ; for "project": repo name ; for "repo-day": YYYY-MM-DD
 *   repo       — required when scope === "repo-day"
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const scope = String(form.get("scope") || "day") as "day" | "repo-day" | "project";
  const key = String(form.get("key") || "");
  const repo = String(form.get("repo") || "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }
  if (!key) return NextResponse.json({ error: "no key" }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const relPath = await saveScreenshot(scope, scope === "repo-day" ? key : key, file.name, bytes);

  // wire path into the matching JSON record
  if (scope === "day") {
    await updateDay(key, { screenshot: relPath });
  } else if (scope === "repo-day") {
    if (!repo) return NextResponse.json({ error: "no repo" }, { status: 400 });
    await updateRepoOnDay(key, repo, { screenshot: relPath });
  } else if (scope === "project") {
    await updateProject(key, { screenshot: relPath, screenshot_status: "captured" });
  }

  return NextResponse.json({ path: relPath });
}
