import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Kyozo Timeline",
  description: "Daily / weekly / monthly development timeline across all Kyozo repos.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper text-ink">
        <header className="border-b border-ink/10">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="font-mono text-sm font-bold tracking-tight">
              ◇ kyozo·timeline
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/" className="hover:text-accent">Timeline</Link>
              <Link href="/projects" className="hover:text-accent">Projects</Link>
              <a
                href="obsidian://open?vault=Obsidian&file=Kyozo%2F11%20Tech%20%2B%20Dev%2F11%20Tech%20%2B%20Dev"
                className="hover:text-accent"
                title="Open in Obsidian"
              >
                Open in Obsidian ↗
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        <footer className="border-t border-ink/10 mt-16">
          <div className="mx-auto max-w-6xl px-6 py-4 text-xs text-ink/50">
            Source of truth: <span className="font-mono">~/Desktop/Obsidian/Kyozo/11 Tech + Dev/</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
