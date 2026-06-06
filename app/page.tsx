import Link from "next/link";
import { readDays, readMonths, readWeeks } from "@/lib/vault";
import { repoTagStyle } from "@/lib/colors";
import MonthAccordion from "@/app/components/MonthAccordion";
import FeatureChip from "@/app/components/FeatureChip";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [days, weeks, months] = await Promise.all([readDays(), readWeeks(), readMonths()]);
  const descending = [...days].reverse();

  const totalCommits = days.reduce((s, d) => s + d.total_commits, 0);
  const totalAdded = days.reduce((s, d) => s + d.total_insertions, 0);
  const totalRemoved = days.reduce((s, d) => s + d.total_deletions, 0);
  const totalLOC = totalAdded + totalRemoved;
  const netLOC = totalAdded - totalRemoved;
  const firstDay = days[0]?.day;
  const lastDay = days[days.length - 1]?.day;
  const activeRepos = new Set(days.flatMap((d) => d.repos.map((r) => r.repo))).size;

  // Tally feature-area frequency across every day so we can show "what was
  // worked on the most" — the part management understands without reading code.
  const areaCounts = new Map<string, number>();
  for (const d of days) {
    for (const a of d.areas ?? []) {
      areaCounts.set(a, (areaCounts.get(a) ?? 0) + 1);
    }
  }
  const topAreas = [...areaCounts.entries()].sort((a, b) => b[1] - a[1]);

  // group days by month for the rail
  const byMonth = new Map<string, typeof days>();
  for (const d of descending) {
    if (!byMonth.has(d.month)) byMonth.set(d.month, []);
    byMonth.get(d.month)!.push(d);
  }

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-3xl font-bold tracking-tight">Kyozo · Development Timeline</h1>
        <p className="mt-2 text-ink/60">
          {months.length}-month history · {days.length} active development days · {weeks.length} weeks of progress
        </p>
        <p className="mt-1 text-sm text-ink/40 font-mono">
          {firstDay} → {lastDay} · {activeRepos} repos · {totalCommits.toLocaleString()} commits shipped
        </p>
      </section>

      {/* Executive metrics */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 rounded-xl border border-ink/10 bg-ink text-paper p-5">
        <Stat label="Lines of code shipped" value={totalAdded.toLocaleString()} hint="new code written" tone="green" />
        <Stat label="Lines refactored"      value={totalRemoved.toLocaleString()} hint="legacy code removed/replaced" tone="red" />
        <Stat label="Total code churn"      value={totalLOC.toLocaleString()} hint="LOC pushed (in + out)" tone="neutral" />
        <Stat label="Net product growth"    value={netLOC.toLocaleString()} hint="net new lines of code" tone={netLOC >= 0 ? "green" : "red"} />
      </section>

      {/* Features delivered — the headline for non-technical reviewers */}
      {topAreas.length > 0 && (
        <section className="rounded-xl border border-ink/10 p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink/60">
              Major feature areas delivered
            </h2>
            <span className="text-xs text-ink/40">
              {topAreas.length} distinct areas of the product · sized by days of work
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {topAreas.map(([area, count]) => (
              <span
                key={area}
                className="inline-flex items-center gap-1.5"
                title={`Active on ${count} day${count === 1 ? "" : "s"}`}
              >
                <FeatureChip area={area} />
                <span className="font-mono text-[11px] text-ink/40">×{count}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {months.slice(-3).reverse().map((m) => {
          const mLOC = m.total_insertions + m.total_deletions;
          return (
            <Link
              key={m.month}
              href={`/month/${m.month}`}
              className="rounded-lg border border-ink/10 p-4 hover:border-accent hover:shadow-sm transition"
            >
              <div className="text-xs font-mono text-ink/50">{m.month}</div>
              <div className="mt-1 text-2xl font-bold">{m.total_commits}</div>
              <div className="text-xs text-ink/60">commits · {m.active_days} active days</div>
              <div className="mt-2 text-xs font-mono">
                <span className="text-emerald-600">+{m.total_insertions.toLocaleString()}</span>
                {" / "}
                <span className="text-red-500">-{m.total_deletions.toLocaleString()}</span>
                <span className="ml-1 text-ink/40">({mLOC.toLocaleString()} LOC)</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {m.active_repos.slice(0, 4).map((r) => (
                  <span
                    key={r}
                    className="inline-block rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium"
                    style={repoTagStyle(r)}
                  >
                    {r}
                  </span>
                ))}
              </div>
            </Link>
          );
        })}
      </section>

      <section>
        <div className="flex items-center gap-4 mb-4">
          <h2 className="text-xl font-bold">Daily</h2>
          <div className="text-xs text-ink/50">Each month opens to reveal its days.</div>
        </div>

        <MonthAccordion
          groups={[...byMonth.entries()].map(([month, days]) => ({ month, days }))}
        />
      </section>
    </div>
  );
}

function Stat({
  label, value, hint, tone,
}: {
  label: string; value: string; hint: string;
  tone: "green" | "red" | "neutral";
}) {
  const color =
    tone === "green" ? "text-emerald-300" :
    tone === "red" ? "text-rose-300" : "text-paper";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-paper/50">{label}</div>
      <div className={`mt-1 text-2xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[10px] text-paper/40 font-mono">{hint}</div>
    </div>
  );
}
