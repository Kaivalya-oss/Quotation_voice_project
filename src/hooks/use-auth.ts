import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { api, tokenStorage } from "@/lib/api";
import type { UserResponse } from "@/lib/auth-types";
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
        const currentUser = await api.get<UserResponse>("/api/v1/auth/me");
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

  const isManager = rawRoleName === "ADMIN" || rawRoleName === "DEALER_OWNER";
  const canManageInventory =
    rawRoleName === "ADMIN" ||
    rawRoleName === "DEALER_OWNER" ||
    rawRoleName === "INVENTORY_MANAGER";
  const canManageFinance =
    rawRoleName === "ADMIN" ||
    rawRoleName === "DEALER_OWNER" ||
    rawRoleName === "FINANCE_EXECUTIVE";

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
    refetch,
  };
}

export function useSignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return async () => {
    try {
      if (tokenStorage.getAccessToken()) {
        await api.post("/api/v1/auth/logout");
      }
    } catch {
      // Local logout must succeed even if backend logout throws
    } finally {
      tokenStorage.clear();
      queryClient.removeQueries({ queryKey: authQueryKey });
      navigate({ to: "/login", replace: true });
    }
  };
}
