import Link from "next/link";
import { notFound } from "next/navigation";
import { readDays, readMonth, readWeeks } from "@/lib/vault";
import MonthEditor from "./MonthEditor";
import { repoTagStyle } from "@/lib/colors";
import FeatureChip from "@/app/components/FeatureChip";

export const dynamic = "force-dynamic";

export default async function MonthPage({ params }: { params: { month: string } }) {
  const month = await readMonth(params.month);
  if (!month) return notFound();

  const [days, weeks] = await Promise.all([readDays(), readWeeks()]);
  const monthDays = days.filter((d) => d.month === month.month);
  const monthWeeks = weeks.filter((w) => w.days.some((d) => d.startsWith(month.month)));

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-ink/60 hover:text-accent">← Timeline</Link>
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{month.month}</h1>
        <p className="mt-1 text-sm text-ink/60">
          {month.active_days} active days · {month.total_commits} commits
        </p>
        <p className="mt-1 font-mono text-sm">
          <span className="text-emerald-600">+{month.total_insertions.toLocaleString()}</span>
          {" / "}
          <span className="text-red-500">-{month.total_deletions.toLocaleString()}</span>
          <span className="ml-2 text-ink/40 text-xs">
            ({(month.total_insertions + month.total_deletions).toLocaleString()} LOC)
          </span>
        </p>
      </header>

      {(month.areas?.length ?? 0) > 0 && (
        <section className="rounded-xl border border-ink/10 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink/60 mb-3">
            Feature areas this month
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {month.areas!.map((a) => <FeatureChip key={a} area={a} />)}
          </div>
        </section>
      )}

      <section className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-lg border border-ink/10 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink/60">Highlights</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {month.highlights.map((h, i) => (
                <li key={i}>
                  <span className="font-mono text-ink/60">{h.repo}</span> — {h.headline}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-ink/10 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink/60">Weeks</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {monthWeeks.map((w) => (
                <li key={w.week}>
                  <Link href={`/week/${w.week}`} className="hover:text-accent">
                    <span className="font-mono">{w.week}</span> · {w.total_commits} commits ({w.start} → {w.end})
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-ink/10 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink/60">Days</h2>
            <ul className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              {monthDays.map((d) => (
                <li key={d.day}>
                  <Link
                    href={`/day/${d.day}`}
                    className="block rounded-md border border-ink/10 px-2 py-1.5 hover:border-accent"
                  >
                    <div className="font-mono text-xs text-ink/60">{d.day}</div>
                    <div className="truncate text-sm">{d.primary_headline}</div>
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
              {month.active_repos.map((r) => (
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
          <MonthEditor initial={month} />
        </aside>
      </section>
    </div>
  );
}
