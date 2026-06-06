import { NextRequest, NextResponse } from "next/server";
import { readDay, updateDay, updateRepoOnDay } from "@/lib/vault";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: { day: string } }) {
  const d = await readDay(ctx.params.day);
  if (!d) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(d);
}

export async function PATCH(req: NextRequest, ctx: { params: { day: string } }) {
  const body = await req.json();
  // Two shapes:
  //   { repo: "foo", patch: { headline?: string, features?: string[], screenshot?: string } }
  //   { patch: { notes?: string, primary_headline?: string, screenshot?: string, summary?: string } }
  if (body.repo) {
    const updated = await updateRepoOnDay(ctx.params.day, body.repo, body.patch);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(updated);
  }
  const updated = await updateDay(ctx.params.day, body.patch);
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}
