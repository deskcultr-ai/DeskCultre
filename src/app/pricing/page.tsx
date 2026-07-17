import MarketingPage from "@/components/marketing-page";

export default function PricingPage() {
  return (
    <MarketingPage
      eyebrow="Pricing"
      title="Simple pricing for teams ready to bring work into one place."
      description="Start with the core workspace experience and scale into deeper operations as your team grows. Keep the page clear for buyers and useful for admins."
      highlights={["Free trial", "Team plans", "Admin controls", "Priority support"]}
      cards={[
        {
          title: "Starter",
          description: "A focused plan for smaller teams that need tasks, meetings, and workspace access in one clean hub.",
        },
        {
          title: "Team",
          description: "Expanded collaboration for departments managing attendance, approvals, reports, and recurring workflows.",
        },
        {
          title: "Business",
          description: "More control for larger organizations with advanced administration and operational visibility.",
        },
        {
          title: "Custom",
          description: "A tailored setup for companies with specific onboarding, permission, or reporting requirements.",
        },
      ]}
      ctaLabel="Start free"
    />
  );
}
