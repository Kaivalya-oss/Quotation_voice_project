import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (localStorage.getItem("mock_auth") !== "true") {
      throw redirect({ to: "/login" });
    }
    return { user: { id: "mock-user-1" } };
  },
  component: AppShell,
});
