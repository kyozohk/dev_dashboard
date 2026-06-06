import { NextRequest, NextResponse } from "next/server";
import { readMonth, updateMonth } from "@/lib/vault";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: { month: string } }) {
  const m = await readMonth(ctx.params.month);
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(m);
}

export async function PATCH(req: NextRequest, ctx: { params: { month: string } }) {
  const { patch } = await req.json();
  const updated = await updateMonth(ctx.params.month, patch);
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}
