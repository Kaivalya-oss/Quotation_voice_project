import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { ApiError, tokenStorage } from "@/lib/api";
import { MULTI_TENANT, cachedSetupStatus } from "@/lib/platform";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const token = tokenStorage.getAccessToken();
    if (!token) {
      throw redirect({ to: "/login" });
    }
    if (!MULTI_TENANT) return;
    // Pages that manage the showroom itself stay reachable while it is not yet operational.
    if (location.pathname.startsWith("/showroom/") || location.pathname === "/team") return;
    try {
      const status = await cachedSetupStatus();
      if (!status.operational) throw redirect({ to: "/showroom/setup" });
    } catch (err) {
      if (err instanceof ApiError && err.code === "NO_ACTIVE_SHOWROOM") {
        throw redirect({ to: "/showroom/select" });
      }
      if (err instanceof ApiError && err.status === 403) {
        // The membership was removed: choose another showroom.
        throw redirect({ to: "/showroom/select" });
      }
      throw err;
    }
  },
  component: AppShell,
});
