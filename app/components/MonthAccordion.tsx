"use client";

import Link from "next/link";
import type { Day } from "@/lib/types";
import { repoTagStyle } from "@/lib/colors";
import { Accordion, AccordionItem } from "./Accordion";
import FeatureChip from "./FeatureChip";

export default function MonthAccordion({ groups }: { groups: { month: string; days: Day[] }[] }) {
  return (
    <Accordion>
      {groups.map(({ month, days }, idx) => {
        const monthCommits = days.reduce((s, d) => s + d.total_commits, 0);
        const monthAdded = days.reduce((s, d) => s + d.total_insertions, 0);
        const monthRemoved = days.reduce((s, d) => s + d.total_deletions, 0);
        return (
          <AccordionItem
            key={month}
            defaultOpen={idx === 0}
            header={
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-bold">{month}</span>
                <Link
                  href={`/month/${month}`}
                  className="text-xs text-ink/40 hover:text-accent"
                  onClick={(e) => e.stopPropagation()}
                >
                  open ↗
                </Link>
              </div>
            }
            meta={
              <span>
                {days.length}d · {monthCommits}c ·{" "}
                <span className="text-emerald-600">+{monthAdded.toLocaleString()}</span>
                {" / "}
                <span className="text-red-500">-{monthRemoved.toLocaleString()}</span>
              </span>
            }
          >
            <ul className="space-y-2">
              {days.map((d) => (
                <li key={d.day}>
                  <Link
                    href={`/day/${d.day}`}
                    className="block rounded-md border border-ink/10 p-3 hover:border-accent transition"
                  >
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-mono text-ink/70">{d.day}</span>
                      <span className="text-xs text-ink/50">{d.weekday}</span>
                      <span className="ml-auto font-mono text-xs text-ink/50">
                        {d.total_commits}c · +{d.total_insertions}/-{d.total_deletions}
                      </span>
                    </div>
                    <div className="mt-1.5 line-clamp-2 text-sm font-medium">{d.primary_headline || "—"}</div>
                    {d.areas && d.areas.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {d.areas.slice(0, 6).map((a) => (
                          <FeatureChip key={a} area={a} size="sm" />
                        ))}
                        {d.areas.length > 6 && (
                          <span className="text-[10px] text-ink/40 self-center">+{d.areas.length - 6} more</span>
                        )}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="text-[10px] uppercase tracking-wider text-ink/40 self-center mr-1">
                        repos
                      </span>
                      {d.repos.slice(0, 5).map((r) => (
                        <span
                          key={r.repo}
                          className="inline-block rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium"
                          style={repoTagStyle(r.repo)}
                        >
                          {r.repo}
                        </span>
                      ))}
                      {d.repos.length > 5 && (
                        <span className="tag">+{d.repos.length - 5}</span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
