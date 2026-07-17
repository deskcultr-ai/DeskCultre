import MarketingPage from "@/components/marketing-page";

export default function SolutionsPage() {
  return (
    <MarketingPage
      eyebrow="Solutions"
      title="Built for modern teams that need clarity without extra overhead."
      description="DeskCulture supports growing organizations, operations teams, project leads, and HR admins who need one reliable place to coordinate work and people."
      highlights={["Growing teams", "HR operations", "Project leads", "Department heads"]}
      cards={[
        {
          title: "For operations",
          description: "Centralize requests, status checks, and daily coordination in a workspace everyone can scan quickly.",
        },
        {
          title: "For managers",
          description: "See what is moving, what is waiting, and where a team needs support before work gets stuck.",
        },
        {
          title: "For HR teams",
          description: "Handle attendance visibility, account setup, and approval processes with fewer manual follow-ups.",
        },
        {
          title: "For employees",
          description: "Make everyday work easier with clear tasks, fewer context switches, and simple collaboration.",
        },
      ]}
    />
  );
}
