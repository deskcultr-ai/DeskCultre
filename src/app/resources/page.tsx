import MarketingPage from "@/components/marketing-page";

export default function ResourcesPage() {
  return (
    <MarketingPage
      eyebrow="Resources"
      title="Guides and playbooks for running a cleaner workspace."
      description="Use DeskCulture resources to shape better team rituals, improve visibility, and create workflows that make work easier to trust."
      highlights={["Setup guides", "Team playbooks", "Admin checklists", "Workflow templates"]}
      cards={[
        {
          title: "Getting started",
          description: "A practical setup path for teams moving tasks, attendance, and meetings into DeskCulture.",
        },
        {
          title: "Manager playbooks",
          description: "Lightweight rituals for weekly planning, progress reviews, and team accountability.",
        },
        {
          title: "Admin checklists",
          description: "Simple guidance for roles, registrations, permissions, and organizational settings.",
        },
        {
          title: "Best practices",
          description: "Patterns for keeping collaboration structured without making teams feel boxed in.",
        },
      ]}
      ctaLabel="Go back to workspace"
    />
  );
}
