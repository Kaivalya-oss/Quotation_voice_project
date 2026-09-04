import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fetchCurrentUserContext } from "@/services/repository";
import type { AppRole } from "@/lib/validators";

export const authQueryKey = ["auth", "context"] as const;

export function useAuth() {
  return {
    isLoading: false,
    user: { id: "mock-user-1", email: "sales@dealership.com" },
    profile: { name: "Sales Executive" },
    roles: ["sales"],
    hasRole: () => true,
    hasAnyRole: () => true,
    isManager: true,
    canManageInventory: true,
    canManageFinance: true,
  };
}

export function useSignOut() {
  const navigate = useNavigate();
  return async () => {
    localStorage.removeItem("mock_auth");
    navigate({ to: "/login", replace: true });
  };
}
