import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fetchCurrentUserContext } from "@/services/repository";
import type { AppRole } from "@/lib/validators";

export const authQueryKey = ["auth", "context"] as const;

export function useAuth() {
  const { data, isLoading } = useQuery({
    queryKey: authQueryKey,
    queryFn: fetchCurrentUserContext,
    staleTime: 60_000,
  });

  const roles = data?.roles ?? [];

  return {
    isLoading,
    user: data?.user ?? null,
    profile: data?.profile ?? null,
    roles,
    hasRole: (role: AppRole) => roles.includes(role),
    hasAnyRole: (list: AppRole[]) => list.some((r) => roles.includes(r)),
    isManager: roles.includes("admin") || roles.includes("dealer_owner"),
    canManageInventory:
      roles.includes("admin") ||
      roles.includes("dealer_owner") ||
      roles.includes("inventory_manager"),
    canManageFinance:
      roles.includes("admin") ||
      roles.includes("dealer_owner") ||
      roles.includes("finance_executive"),
  };
}

export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };
}
