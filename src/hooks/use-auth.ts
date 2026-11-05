import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { api, tokenStorage } from "@/lib/api";
import type { UserResponse } from "@/lib/auth-types";
import { MULTI_TENANT, clearGateCache, getMe, toAppUser } from "@/lib/platform";
import type { AppRole } from "@/lib/validators";

export const authQueryKey = ["auth"] as const;

export function useAuth() {
  const token = tokenStorage.getAccessToken();

  const {
    data: user,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<UserResponse | null>({
    queryKey: authQueryKey,
    queryFn: async () => {
      const accessToken = tokenStorage.getAccessToken();
      if (!accessToken) return null;
      try {
        const currentUser = MULTI_TENANT
          ? await getMe().then((me) => toAppUser(me.user, me.active_role))
          : await api.get<UserResponse>("/api/v1/auth/me");
        tokenStorage.setUser(currentUser);
        return currentUser;
      } catch (err) {
        tokenStorage.clear();
        throw err;
      }
    },
    initialData: () => tokenStorage.getUser() ?? undefined,
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const rawRoleName = user?.role?.name?.toUpperCase() ?? "";
  const normalizedRole = user?.role?.name?.toLowerCase() as AppRole | undefined;
  const roles: AppRole[] = normalizedRole ? [normalizedRole] : [];

  // OWNER, HEAD_OF_SALES and SALESPERSON are the multi-tenant showroom roles; they mirror the backend's groups.
  const isOwnerOrHead = rawRoleName === "OWNER" || rawRoleName === "HEAD_OF_SALES";
  const isManager = rawRoleName === "ADMIN" || rawRoleName === "DEALER_OWNER" || isOwnerOrHead;
  const canManageInventory =
    rawRoleName === "ADMIN" ||
    rawRoleName === "DEALER_OWNER" ||
    rawRoleName === "INVENTORY_MANAGER" ||
    isOwnerOrHead;
  // Mirrors the backend's SALES_ROLES: only these roles may create customers and quotations.
  const canSell =
    rawRoleName === "ADMIN" ||
    rawRoleName === "DEALER_OWNER" ||
    rawRoleName === "SALES_EXECUTIVE" ||
    rawRoleName === "SALESPERSON" ||
    isOwnerOrHead;
  const canManageFinance =
    rawRoleName === "ADMIN" ||
    rawRoleName === "DEALER_OWNER" ||
    rawRoleName === "FINANCE_EXECUTIVE" ||
    isOwnerOrHead;

  const hasRole = (targetRole: string) => {
    return rawRoleName.toLowerCase() === targetRole.toLowerCase();
  };

  const hasAnyRole = (targetRoles: string[]) => {
    return targetRoles.some((r) => r.toLowerCase() === rawRoleName.toLowerCase());
  };

  return {
    isLoading,
    isError,
    error,
    user: user ?? null,
    profile: {
      name: user?.full_name ?? "",
    },
    roles,
    roleName: user?.role?.name ?? null,
    hasRole,
    hasAnyRole,
    isManager,
    canManageInventory,
    canManageFinance,
    canSell,
    refetch,
  };
}

export function useSignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return async () => {
    try {
      if (tokenStorage.getAccessToken() && !MULTI_TENANT) {
        await api.post("/api/v1/auth/logout");
      }
    } catch {
      // Local logout must succeed even if backend logout throws
    } finally {
      tokenStorage.clear();
      clearGateCache();
      // Nothing cached for one showroom may survive into the next session.
      if (MULTI_TENANT) queryClient.clear();
      queryClient.removeQueries({ queryKey: authQueryKey });
      navigate({ to: "/login", replace: true });
    }
  };
}
