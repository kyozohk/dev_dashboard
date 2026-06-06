import { NextResponse } from "next/server";
import { readDays, readMonths, readWeeks, readProjects } from "@/lib/vault";

export const dynamic = "force-dynamic";

export async function GET() {
  const [days, weeks, months, projects] = await Promise.all([
    readDays(),
    readWeeks(),
    readMonths(),
    readProjects(),
  ]);
  return NextResponse.json({ days, weeks, months, projects });
}
