"use client";

import { useState, useId } from "react";
import type { ReactNode } from "react";

/**
 * Minimal accessible accordion — no external dependency.
 *
 * Usage:
 *   <Accordion defaultOpen>
 *     <AccordionItem header={...}>
 *       <body…>
 *     </AccordionItem>
 *   </Accordion>
 *
 * Each <AccordionItem> manages its own open state, so multiple can be open at
 * once (true accordion-as-a-list pattern, not radio-style single-open).
 */
export function Accordion({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

export function AccordionItem({
  header,
  children,
  defaultOpen = false,
  meta,
  accent,
}: {
  header: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  /** right-side meta string (commit count, dates, etc.) */
  meta?: ReactNode;
  /** colored accent strip on the left (matches the repo color) */
  accent?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <div
      className="rounded-lg border border-ink/10 bg-white overflow-hidden"
      style={accent ? { borderLeft: `4px solid ${accent}` } : undefined}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink/[0.03] transition"
      >
        <span
          aria-hidden
          className={`inline-block w-2 transition-transform ${open ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        <div className="flex-1 min-w-0">{header}</div>
        {meta && <div className="text-xs text-ink/50 font-mono">{meta}</div>}
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="border-t border-ink/10 px-4 py-4 bg-paper-soft/30"
      >
        {children}
      </div>
    </div>
  );
}
