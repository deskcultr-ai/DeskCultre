import MarketingPage from "@/components/marketing-page";

export default function FeaturesPage() {
  return (
    <MarketingPage
      eyebrow="DeskCulture Features"
      title="One workspace for tasks, meetings, people, and progress."
      description="Give every team a calm operating layer where daily work, attendance, approvals, reports, and collaboration stay connected from the first check-in to the final review."
      highlights={["Task planning", "Meeting flow", "Attendance tracking", "Team reports"]}
      cards={[
        {
          title: "Task boards",
          description: "Plan assignments, set owners, and track progress without splitting work across scattered tools.",
        },
        {
          title: "Meetings",
          description: "Keep schedules, decisions, and follow-ups close to the work they affect.",
        },
        {
          title: "Attendance",
          description: "Manage daily presence, requests, and accountability with a simple team-first workflow.",
        },
        {
          title: "Reports",
          description: "Turn team activity into readable insights for managers, admins, and department leads.",
        },
      ]}
    />
  );
}
