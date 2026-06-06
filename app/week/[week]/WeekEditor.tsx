"use client";
import { useState } from "react";
import type { Week } from "@/lib/types";

export default function WeekEditor({ initial }: { initial: Week }) {
  const [week, setWeek] = useState<Week>(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial.notes || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/week/${week.week}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patch: { notes: draft } }),
    });
    setWeek(await res.json());
    setEditing(false);
    setSaving(false);
  }

  return (
    <div className="rounded-lg border border-ink/10 p-5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-ink/60">Notes</h3>
      {editing ? (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="mt-2 w-full rounded-md border border-ink/15 px-2 py-1 min-h-[120px] text-sm"
            autoFocus
          />
          <div className="mt-2 flex gap-2">
            <button onClick={save} className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEditing(false)} className="btn">Cancel</button>
          </div>
        </>
      ) : (
        <div
          onClick={() => {
            setDraft(week.notes || "");
            setEditing(true);
          }}
          className={`mt-2 text-sm whitespace-pre-wrap cursor-text ${
            !week.notes ? "italic text-ink/40" : ""
          }`}
        >
          {week.notes || "Click to add notes for this week…"}
        </div>
      )}
    </div>
  );
}
