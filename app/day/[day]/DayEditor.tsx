"use client";

import { useState, useMemo } from "react";
import type { Day, RepoDay } from "@/lib/types";
import { repoColor, repoTagStyle } from "@/lib/colors";
import { Accordion, AccordionItem } from "@/app/components/Accordion";
import FeatureChip from "@/app/components/FeatureChip";

export default function DayEditor({ initial }: { initial: Day }) {
  const [day, setDay] = useState<Day>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Master toggle: hide technical chip rows by default — managers see the
  // executive layer first; engineers can reveal everything with one click.
  const [showTech, setShowTech] = useState(false);

  // -------- editing API ----------------------------------------------------

  async function saveDayPatch(patch: Partial<Day>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/day/${day.day}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patch }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDay(await res.json());
    } catch (e: unknown) {
      setError(String((e as Error)?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function saveRepoPatch(repo: string, patch: Partial<RepoDay>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/day/${day.day}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repo, patch }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDay(await res.json());
    } catch (e: unknown) {
      setError(String((e as Error)?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function uploadScreenshot(file: File, scope: "day" | "repo-day", repo?: string) {
    const form = new FormData();
    form.set("file", file);
    form.set("scope", scope);
    form.set("key", day.day);
    if (repo) form.set("repo", repo);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text());
      const { path } = await res.json();
      if (scope === "day") {
        setDay({ ...day, screenshot: path });
      } else if (scope === "repo-day" && repo) {
        setDay({
          ...day,
          repos: day.repos.map((r) => (r.repo === repo ? { ...r, screenshot: path } : r)),
        });
      }
    } catch (e: unknown) {
      setError(String((e as Error)?.message || e));
    } finally {
      setSaving(false);
    }
  }

  // -------- impact derivation ---------------------------------------------

  const impact = useMemo(() => {
    let pages = 0, api = 0, components = 0, schemas = 0;
    let userFacing = false;
    for (const r of day.repos) {
      pages += r.code?.pages?.length ?? 0;
      api += r.code?.api?.length ?? 0;
      components += r.code?.components?.length ?? 0;
      schemas += (r.code?.schema?.length ?? 0) + (r.code?.tables?.length ?? 0);
      if ((r.code?.pages?.length ?? 0) > 0 || (r.code?.components?.length ?? 0) > 0) userFacing = true;
    }
    return { pages, api, components, schemas, userFacing };
  }, [day]);

  const allShots = [
    day.screenshot ? { key: "day", path: day.screenshot, label: "Hero" } : null,
    ...day.repos.filter((r) => r.screenshot).map((r) => ({ key: r.repo, path: r.screenshot!, label: r.repo })),
  ].filter(Boolean) as { key: string; path: string; label: string }[];

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-xs font-mono text-ink/40">{saving ? "saving…" : "saved"}</div>
        <label className="inline-flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={showTech}
            onChange={(e) => setShowTech(e.target.checked)}
            className="cursor-pointer"
          />
          <span className="text-ink/60">Show technical detail</span>
        </label>
      </div>

      {/* ============ EXECUTIVE LAYER ============ */}

      {/* Headline */}
      <section className="rounded-xl border border-ink/10 p-6 bg-white">
        <div className="text-[11px] uppercase tracking-wider text-ink/40 mb-1">
          What we shipped — {day.day}
        </div>
        <EditableText
          value={day.primary_headline}
          onSave={(v) => saveDayPatch({ primary_headline: v })}
          className="text-2xl font-bold leading-tight"
          placeholder="What was the big thing built today?"
        />

        {/* Feature areas (plain English) */}
        {(day.areas?.length ?? 0) > 0 && (
          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-wider text-ink/40 mb-2">
              Worked on
            </div>
            <div className="flex flex-wrap gap-1.5">
              {day.areas!.map((a) => <FeatureChip key={a} area={a} />)}
            </div>
          </div>
        )}

        {/* Impact callout */}
        <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-3">
          <Metric label="Code shipped" value={`+${day.total_insertions.toLocaleString()}`} sub="lines added" tone="green" />
          <Metric label="Refactored"  value={`-${day.total_deletions.toLocaleString()}`} sub="lines removed" tone="red" />
          <Metric label="Repos touched" value={String(day.repos.length)} sub={day.repos.length === 1 ? "project" : "projects"} />
          <Metric label="New API" value={String(impact.api)} sub={impact.api === 1 ? "endpoint" : "endpoints"} />
          <Metric label="New UI" value={String(impact.pages + impact.components)} sub="pages + components" tone={impact.userFacing ? "green" : "neutral"} />
        </div>
      </section>

      {/* Screenshots — front and center for non-technical audience */}
      {allShots.length > 0 && (
        <section>
          <div className="text-[11px] uppercase tracking-wider text-ink/40 mb-2">
            Screenshots
          </div>
          <div className={`grid gap-3 ${allShots.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
            {allShots.map((s) => (
              <figure key={s.key} className="rounded-xl border border-ink/10 overflow-hidden bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={shotSrc(s.path)}
                  alt={s.label}
                  className="w-full max-h-[480px] object-contain bg-paper-soft"
                />
                <figcaption className="px-3 py-2 text-xs font-mono text-ink/60 border-t border-ink/10">
                  {s.label}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* Hero screenshot upload (always visible — fills the empty slot above) */}
      <section className="rounded-xl border border-dashed border-ink/15 p-4">
        <div className="text-[11px] uppercase tracking-wider text-ink/40 mb-2">
          Day hero screenshot {day.screenshot ? "(replace)" : ""}
        </div>
        <Screenshot
          path={day.screenshot}
          onChange={(file) => uploadScreenshot(file, "day")}
          label="Drop a hero screenshot for the day"
          compact
        />
      </section>

      {/* Choices / decisions mined from commit bodies */}
      {(day.choices?.length ?? 0) > 0 && (
        <section className="rounded-xl border border-ink/10 p-5 bg-amber-50/40">
          <div className="text-[11px] uppercase tracking-wider text-amber-700/80 mb-2">
            Choices made
          </div>
          <ul className="space-y-2 text-sm">
            {day.choices!.map((c, i) => (
              <li key={i} className="leading-relaxed">{c}</li>
            ))}
          </ul>
        </section>
      )}

      {/* ============ PER-REPO DETAIL ACCORDION ============ */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink/60">
            Work by project ({day.repos.length})
          </h2>
          <div className="text-xs text-ink/40">Click a row to expand</div>
        </div>
        <Accordion>
          {day.repos.map((r, idx) => {
            const c = repoColor(r.repo);
            return (
              <AccordionItem
                key={r.repo}
                defaultOpen={idx === 0}
                accent={c.bg}
                header={
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="inline-block shrink-0 rounded border px-2 py-0.5 font-mono text-xs font-bold"
                      style={repoTagStyle(r.repo)}
                    >
                      {r.repo}
                    </span>
                    <span className="truncate text-sm">{r.headline}</span>
                  </div>
                }
                meta={
                  <span>
                    +<span className="text-emerald-600">{r.insertions.toLocaleString()}</span>
                    {" / "}
                    -<span className="text-red-500">{r.deletions.toLocaleString()}</span>
                  </span>
                }
              >
                {/* Feature areas for this repo */}
                {(r.areas?.length ?? 0) > 0 && (
                  <div className="mb-4">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-ink/40">
                      Areas
                    </label>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {r.areas!.map((a) => <FeatureChip key={a} area={a} size="sm" />)}
                    </div>
                  </div>
                )}

                {/* Headline */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-ink/40">
                    Headline
                  </label>
                  <EditableText
                    value={r.headline}
                    onSave={(v) => saveRepoPatch(r.repo, { headline: v })}
                    className="mt-1 text-base"
                  />
                </div>

                {/* Features (editable bullets) */}
                <div className="mt-4">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-ink/40">
                    What changed (editable)
                  </label>
                  <EditableList
                    items={r.features}
                    onSave={(items) => saveRepoPatch(r.repo, { features: items })}
                  />
                </div>

                {/* Screenshot */}
                <div className="mt-4">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-ink/40">
                    Screenshot
                  </label>
                  <Screenshot
                    path={r.screenshot}
                    onChange={(file) => uploadScreenshot(file, "repo-day", r.repo)}
                    label={`Attach a screenshot for ${r.repo}`}
                  />
                </div>

                {/* ============ TECHNICAL DETAIL (gated) ============ */}
                {showTech && r.code && Object.keys(r.code).length > 0 && (
                  <div className="mt-5 rounded-md border border-dashed border-ink/15 p-3 bg-ink/[0.02]">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-ink/40 mb-2">
                      Technical detail · from diff
                    </div>
                    <CodeFacetView code={r.code} />
                    {Object.keys(r.categories || {}).length > 0 && (
                      <div className="mt-3 text-[11px] text-ink/40 font-mono">
                        file areas: {Object.entries(r.categories).map(([k, v]) => `${k}:${v}`).join(", ")}
                      </div>
                    )}
                  </div>
                )}
              </AccordionItem>
            );
          })}
        </Accordion>
      </section>

      {/* Notes */}
      <section className="rounded-lg border border-ink/10 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-ink/60">Notes</h2>
        <EditableText
          value={day.notes}
          onSave={(v) => saveDayPatch({ notes: v })}
          className="mt-3 min-h-[100px] whitespace-pre-wrap"
          multiline
          placeholder="Long-form notes — context, follow-ups, decisions worth remembering…"
        />
      </section>
    </div>
  );
}

// ---------- helpers --------------------------------------------------------

function shotSrc(path: string): string {
  return `/api/${path.startsWith("screenshots/") ? "screenshot/" + path : "screenshot/screenshots/" + path}`;
}

function Metric({
  label, value, sub, tone = "neutral",
}: {
  label: string; value: string; sub: string; tone?: "green" | "red" | "neutral";
}) {
  const color = tone === "green" ? "text-emerald-700" : tone === "red" ? "text-rose-600" : "text-ink";
  return (
    <div className="rounded-lg border border-ink/10 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-ink/40">{label}</div>
      <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[10px] text-ink/40">{sub}</div>
    </div>
  );
}

// ---------- inline editable text -----------------------------------------

function EditableText({
  value, onSave, className, multiline, placeholder,
}: {
  value: string; onSave: (v: string) => void;
  className?: string; multiline?: boolean; placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setDraft(value); setEditing(true); }}
        className={`block w-full text-left ${className || ""} ${!value ? "text-ink/40 italic" : ""}`}
        title="Click to edit"
      >
        {value || placeholder || "—"}
      </button>
    );
  }
  const commit = () => { setEditing(false); if (draft !== value) onSave(draft); };
  if (multiline) {
    return (
      <textarea
        autoFocus value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        className={`w-full rounded-md border border-ink/15 px-2 py-1 ${className || ""}`}
      />
    );
  }
  return (
    <input
      autoFocus value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className={`w-full rounded-md border border-ink/15 px-2 py-1 ${className || ""}`}
    />
  );
}

function EditableList({ items, onSave }: { items: string[]; onSave: (v: string[]) => void; }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState((items || []).join("\n"));
  if (!editing) {
    return (
      <ul
        onClick={() => { setDraft((items || []).join("\n")); setEditing(true); }}
        className="mt-1 cursor-text list-disc pl-5 text-sm space-y-0.5"
        title="Click to edit"
      >
        {(items || []).length === 0 ? (
          <li className="text-ink/40 italic">No bullets yet — click to add</li>
        ) : (
          (items || []).map((f, i) => <li key={i}>{f}</li>)
        )}
      </ul>
    );
  }
  return (
    <textarea
      autoFocus value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.split("\n").map((l) => l.trim()).filter(Boolean);
        setEditing(false);
        if (JSON.stringify(next) !== JSON.stringify(items)) onSave(next);
      }}
      className="mt-1 w-full rounded-md border border-ink/15 px-2 py-1 min-h-[100px]"
      placeholder="One bullet per line"
    />
  );
}

function CodeFacetView({ code }: { code: NonNullable<RepoDay["code"]> }) {
  const rows: { label: string; items: string[] | undefined; color: string }[] = [
    { label: "Pages",      items: code.pages,      color: "#6366f1" },
    { label: "API",        items: code.api,        color: "#0ea5e9" },
    { label: "Components", items: code.components, color: "#10b981" },
    { label: "Hooks",      items: code.hooks,      color: "#f59e0b" },
    { label: "Widgets",    items: code.widgets,    color: "#ec4899" },
    { label: "Schema",     items: code.schema,     color: "#a855f7" },
    { label: "Tables",     items: code.tables,     color: "#a855f7" },
  ];
  const present = rows.filter((r) => r.items && r.items.length > 0);
  if (!present.length && !code.auth) {
    return <div className="text-sm italic text-ink/40 mt-1">no structured changes detected</div>;
  }
  return (
    <div className="mt-1 space-y-2 text-sm">
      {present.map((r) => (
        <div key={r.label} className="flex flex-wrap items-baseline gap-2">
          <span
            className="inline-block w-20 shrink-0 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: r.color }}
          >
            {r.label}
          </span>
          <span className="flex flex-wrap gap-1">
            {r.items!.map((it) => (
              <code key={it} className="rounded bg-ink/[0.04] px-1.5 py-0.5 text-[12px] font-mono">
                {it}
              </code>
            ))}
          </span>
        </div>
      ))}
      {code.auth && (
        <div className="text-xs">
          <span className="inline-block rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-red-700">
            Auth-related changes
          </span>
        </div>
      )}
    </div>
  );
}

function Screenshot({
  path, onChange, label, compact = false,
}: {
  path: string | null; onChange: (file: File) => void; label: string; compact?: boolean;
}) {
  return (
    <div className="mt-1">
      {path && !compact ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shotSrc(path)} alt="screenshot" className="max-h-[400px] rounded-md border border-ink/10" />
      ) : null}
      {!compact && !path && (
        <div className="rounded-md border border-dashed border-ink/20 px-3 py-6 text-center text-sm text-ink/50">
          {label}
        </div>
      )}
      <label className="mt-2 inline-flex items-center gap-2 cursor-pointer text-sm text-ink/70 hover:text-accent">
        <input
          type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange(f); }}
        />
        <span className="btn">📎 {path ? "Replace" : "Upload"}</span>
      </label>
    </div>
  );
}
