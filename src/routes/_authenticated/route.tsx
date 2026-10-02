import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { tokenStorage } from "@/lib/api";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const token = tokenStorage.getAccessToken();
    if (!token) {
      throw redirect({ to: "/login" });
    }
  },
  component: AppShell,
});
