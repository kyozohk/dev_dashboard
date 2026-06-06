"use client";
import { useState } from "react";
import type { Project } from "@/lib/types";
import { repoTagStyle } from "@/lib/colors";

export default function ProjectsList({ initial }: { initial: Project[] }) {
  const [projects, setProjects] = useState<Project[]>(initial);

  async function upload(repo: string, file: File) {
    const form = new FormData();
    form.set("file", file);
    form.set("scope", "project");
    form.set("key", repo);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    if (!res.ok) {
      alert("upload failed: " + (await res.text()));
      return;
    }
    const { path } = await res.json();
    setProjects((ps) =>
      ps.map((p) =>
        p.repo === repo ? { ...p, screenshot: path, screenshot_status: "captured" } : p
      )
    );
  }

  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((p) => (
        <li
          key={p.repo}
          className="rounded-lg border border-ink/10 p-4 flex flex-col gap-2"
        >
          <div className="flex items-center gap-2">
            <span
              className="inline-block rounded border px-2 py-0.5 font-mono text-xs font-bold"
              style={repoTagStyle(p.repo)}
            >
              {p.repo}
            </span>
            <span className="text-[11px] text-ink/40 font-mono">{p.stack}</span>
          </div>
          <div className="text-xs text-ink/50 font-mono">
            {p.first_day} → {p.last_day} · {p.total_commits}c
          </div>
          <div className="text-xs font-mono">
            <span className="text-emerald-600">+{p.total_insertions.toLocaleString()}</span>
            {" / "}
            <span className="text-red-500">-{p.total_deletions.toLocaleString()}</span>
            <span className="ml-1 text-ink/40">
              ({(p.total_insertions + p.total_deletions).toLocaleString()} LOC)
            </span>
          </div>

          {p.screenshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/screenshot/${p.screenshot}`}
              alt={p.repo}
              className="mt-1 max-h-[200px] w-full object-contain rounded-md border border-ink/10 bg-paper-soft"
            />
          ) : (
            <div className="mt-1 grid place-items-center h-[160px] rounded-md border border-dashed border-ink/15 text-xs text-ink/40">
              no screenshot
            </div>
          )}

          <label className="inline-block">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(p.repo, f);
              }}
            />
            <span className="btn cursor-pointer text-xs">📎 {p.screenshot ? "Replace" : "Upload"}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
