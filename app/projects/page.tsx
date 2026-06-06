import { readProjects } from "@/lib/vault";
import ProjectsList from "./ProjectsList";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await readProjects();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
        <p className="mt-1 text-sm text-ink/60">
          {projects.length} repos. Upload a current-state screenshot for each.
        </p>
      </header>
      <ProjectsList initial={projects} />
    </div>
  );
}
