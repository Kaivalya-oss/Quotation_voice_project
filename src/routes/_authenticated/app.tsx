import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Workspace — VoiceQuote AI" },
      { name: "description", content: "Manage voice-generated quotations, customers and analytics." },
    ],
  }),
  component: AppShell,
});
