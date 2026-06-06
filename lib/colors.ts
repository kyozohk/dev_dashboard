/**
 * Stable per-repo color. Same repo name always yields the same color, repos
 * spread evenly across the hue circle so different repos look visually distinct.
 *
 * Returned values are CSS strings (not Tailwind classes) so they can be applied
 * inline regardless of Tailwind's safelist.
 */

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

export function repoColor(repo: string): { bg: string; fg: string; border: string; hue: number } {
  // strip the old/ prefix so an "old/foo" and "foo" share a colour family.
  const base = repo.replace(/^old\//, "");
  const hue = djb2(base) % 360;
  // slightly desaturated and dark enough for white text contrast
  const bg = `hsl(${hue} 55% 32%)`;
  const fg = `hsl(${hue} 80% 96%)`;
  const border = `hsl(${hue} 55% 24%)`;
  return { bg, fg, border, hue };
}

import type { CSSProperties } from "react";

export function repoTagStyle(repo: string): CSSProperties {
  const c = repoColor(repo);
  return {
    backgroundColor: c.bg,
    color: c.fg,
    borderColor: c.border,
  };
}
