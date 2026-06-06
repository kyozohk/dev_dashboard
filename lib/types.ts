export type CodeFacets = {
  pages?: string[];
  api?: string[];
  components?: string[];
  hooks?: string[];
  widgets?: string[];
  functions?: string[];
  classes?: string[];
  schema?: string[];
  tables?: string[];
  auth?: boolean;
};

export type RepoDay = {
  repo: string;
  stack: string;
  commits: number;
  insertions: number;
  deletions: number;
  headline: string;
  features: string[];
  categories: Record<string, number>;
  code?: CodeFacets;
  areas?: string[];        // plain-English feature areas
  choices?: string[];      // mined from commit message bodies
  commit_hashes: string[];
  screenshot: string | null;
};

export type Day = {
  day: string;
  weekday: string;
  iso_week: string;
  month: string;
  year: string;
  total_commits: number;
  total_insertions: number;
  total_deletions: number;
  primary_repo: string | null;
  primary_stack: string | null;
  primary_headline: string;
  areas?: string[];
  choices?: string[];
  repos: RepoDay[];
  summary: string;
  screenshot: string | null;
  notes: string;
};

export type Week = {
  week: string;
  days: string[];
  start: string;
  end: string;
  total_commits: number;
  total_insertions: number;
  total_deletions: number;
  active_repos: string[];
  areas?: string[];
  highlights: { repo: string; headline: string }[];
  notes: string;
};

export type Month = {
  month: string;
  days: string[];
  active_days: number;
  total_commits: number;
  total_insertions: number;
  total_deletions: number;
  active_repos: string[];
  areas?: string[];
  highlights: { repo: string; headline: string }[];
  notes: string;
};

export type Project = {
  repo: string;
  stack: string;
  first_day: string;
  last_day: string;
  total_commits: number;
  total_insertions: number;
  total_deletions: number;
  screenshot: string | null;
  screenshot_status: "pending" | "captured" | "failed";
  run_command: string;
  notes: string;
};
