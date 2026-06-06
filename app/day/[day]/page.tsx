import Link from "next/link";
import { notFound } from "next/navigation";
import { readDay, readDays } from "@/lib/vault";
import DayEditor from "./DayEditor";

export const dynamic = "force-dynamic";

export default async function DayPage({ params }: { params: { day: string } }) {
  const day = await readDay(params.day);
  if (!day) return notFound();

  const days = await readDays();
  const idx = days.findIndex((d) => d.day === day.day);
  const prev = idx > 0 ? days[idx - 1] : null;
  const next = idx < days.length - 1 ? days[idx + 1] : null;

  return (
    <div className="space-y-6">
      <nav className="flex items-center justify-between text-sm">
        <Link href="/" className="text-ink/60 hover:text-accent">← Timeline</Link>
        <div className="flex gap-2">
          {prev && (
            <Link href={`/day/${prev.day}`} className="btn">
              ← {prev.day}
            </Link>
          )}
          {next && (
            <Link href={`/day/${next.day}`} className="btn">
              {next.day} →
            </Link>
          )}
        </div>
      </nav>

      <header>
        <div className="text-xs font-mono text-ink/50">
          <Link href={`/week/${day.iso_week}`} className="hover:text-accent">{day.iso_week}</Link>
          {" · "}
          <Link href={`/month/${day.month}`} className="hover:text-accent">{day.month}</Link>
        </div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          {day.day} <span className="text-ink/40 font-normal">— {day.weekday}</span>
        </h1>
        <div className="mt-2 flex flex-wrap items-baseline gap-3 text-sm text-ink/60">
          <span>{day.total_commits} commits</span>
          <span>·</span>
          <span className="text-emerald-600 font-mono">+{day.total_insertions.toLocaleString()}</span>
          <span className="text-red-500 font-mono">-{day.total_deletions.toLocaleString()}</span>
          <span className="text-ink/40 font-mono text-xs">
            ({(day.total_insertions + day.total_deletions).toLocaleString()} LOC)
          </span>
        </div>
      </header>

      <DayEditor initial={day} />
    </div>
  );
}
