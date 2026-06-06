import { NextRequest, NextResponse } from "next/server";
import { readWeek, updateWeek } from "@/lib/vault";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: { week: string } }) {
  const w = await readWeek(ctx.params.week);
  if (!w) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(w);
}

export async function PATCH(req: NextRequest, ctx: { params: { week: string } }) {
  const { patch } = await req.json();
  const updated = await updateWeek(ctx.params.week, patch);
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}
