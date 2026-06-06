import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Daily cron entrypoint for the deployed (Vercel) app.
 *
 * IMPORTANT ARCHITECTURAL NOTE
 * ----------------------------
 * Vercel functions cannot read the user's local Obsidian vault — they run in
 * the cloud, the vault lives on disk. So the *source of truth* for the
 * deployed instance is the `data/` JSON committed to the timeline repo.
 *
 * The pipeline is two-sided:
 *   1. **Local cron** (`kyozo-timeline-build/refresh.sh` + launchd plist)
 *      re-extracts git history every night, writes JSON to the Obsidian
 *      vault, and — if `PUSH_TO_GIT=1` — also commits the JSON into the
 *      timeline repo. Vercel picks up the push and auto-redeploys.
 *   2. **Vercel cron** (this route) runs each day to revalidate the
 *      timeline pages and optionally fetch a remote data source if you
 *      ever wire one up.
 *
 * Auth: Vercel cron requests include the env `CRON_SECRET` as a bearer
 * token. We reject anything else so this endpoint isn't a public refresh
 * trigger.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const got = req.headers.get("authorization");
    if (got !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // Optionally pull fresh data from a remote source (e.g. raw GitHub URL,
  // a hosted JSON endpoint). Disabled by default. If you store the canonical
  // JSON in a public repo, set REMOTE_DATA_URL and we fetch the latest here.
  const remote = process.env.REMOTE_DATA_URL;
  let remoteUpdated: string | null = null;
  if (remote) {
    try {
      // Convention: REMOTE_DATA_URL points at a folder; we expect
      // <url>/daily.json, <url>/weekly.json, <url>/monthly.json
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const targets = ["daily.json", "weekly.json", "monthly.json", "projects.json"];
      const out = path.join(process.cwd(), "data");
      await fs.mkdir(out, { recursive: true });
      for (const t of targets) {
        const r = await fetch(`${remote.replace(/\/$/, "")}/${t}`);
        if (r.ok) {
          const text = await r.text();
          await fs.writeFile(path.join(out, t), text);
        }
      }
      remoteUpdated = remote;
    } catch (e) {
      return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
    }
  }

  // Revalidate every page so the next request sees fresh data.
  for (const p of ["/", "/projects"]) revalidatePath(p);
  revalidatePath("/day/[day]", "page");
  revalidatePath("/week/[week]", "page");
  revalidatePath("/month/[month]", "page");

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    remoteUpdated,
    note: "Local data is updated by the launchd job; this endpoint revalidates the deployed UI.",
  });
}
