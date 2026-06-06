import type { CSSProperties } from "react";

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/** Soft, light-tinted background per area name — easier on the eye for long lists. */
export function areaStyle(area: string): CSSProperties {
  const hue = djb2(area) % 360;
  return {
    backgroundColor: `hsl(${hue} 75% 95%)`,
    color: `hsl(${hue} 55% 28%)`,
    borderColor: `hsl(${hue} 60% 78%)`,
  };
}

export default function FeatureChip({ area, size = "md" }: { area: string; size?: "sm" | "md" }) {
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span
      className={`inline-block rounded-full border font-medium ${pad}`}
      style={areaStyle(area)}
    >
      {area}
    </span>
  );
}
