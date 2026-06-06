import Link from "next/link";
import { notFound } from "next/navigation";
import { readDays, readWeek } from "@/lib/vault";
import WeekEditor from "./WeekEditor";
import { repoTagStyle } from "@/lib/colors";
import FeatureChip from "@/app/components/FeatureChip";

export const dynamic = "force-dynamic";

export default async function WeekPage({ params }: { params: { week: string } }) {
  const week = await readWeek(params.week);
  if (!week) return notFound();

  const days = await readDays();
  const weekDays = days.filter((d) => week.days.includes(d.day));

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-ink/60 hover:text-accent">← Timeline</Link>
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Week {week.week}</h1>
        <p className="mt-1 text-sm text-ink/60">
          {week.start} → {week.end} · {week.total_commits} commits
        </p>
        <p className="mt-1 font-mono text-sm">
          <span className="text-emerald-600">+{week.total_insertions.toLocaleString()}</span>
          {" / "}
          <span className="text-red-500">-{week.total_deletions.toLocaleString()}</span>
          <span className="ml-2 text-ink/40 text-xs">
            ({(week.total_insertions + week.total_deletions).toLocaleString()} LOC)
          </span>
        </p>
      </header>

      {(week.areas?.length ?? 0) > 0 && (
        <section className="rounded-xl border border-ink/10 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink/60 mb-3">
            Feature areas this week
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {week.areas!.map((a) => <FeatureChip key={a} area={a} />)}
          </div>
        </section>
      )}

      <section className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-lg border border-ink/10 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink/60">Highlights</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {week.highlights.map((h, i) => (
                <li key={i}><span className="font-mono text-ink/60">{h.repo}</span> — {h.headline}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-ink/10 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink/60">Days in this week</h2>
            <ul className="mt-3 space-y-2">
              {weekDays.map((d) => (
                <li key={d.day}>
                  <Link href={`/day/${d.day}`} className="block rounded-md border border-ink/10 px-3 py-2 hover:border-accent">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-ink/60">{d.day}</span>
                      <span className="text-xs text-ink/40">{d.weekday}</span>
                      <span className="ml-auto font-mono text-xs text-ink/50">{d.total_commits}c</span>
                    </div>
                    <div className="text-sm truncate">{d.primary_headline}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-ink/10 p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink/60">Active repos</h3>
            <div className="mt-2 flex flex-wrap gap-1">
              {week.active_repos.map((r) => (
                <span
                  key={r}
                  className="inline-block rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium"
                  style={repoTagStyle(r)}
                >
                  {r}
                </span>
              ))}
            </div>
          </div>

          <WeekEditor initial={week} />
        </aside>
      </section>
    </div>
  );
}
