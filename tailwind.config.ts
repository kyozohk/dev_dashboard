import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        ink: { DEFAULT: "#0f0f10", soft: "#1a1a1d", line: "#26262b" },
        paper: { DEFAULT: "#fafafa", soft: "#f0f0f0" },
        accent: { DEFAULT: "#ff6a3d", muted: "#3d5aff" },
      },
    },
  },
  plugins: [],
} satisfies Config;
