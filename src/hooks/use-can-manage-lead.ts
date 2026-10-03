import { useAuth } from "@/hooks/use-auth";
import type { LeadResponse } from "@/lib/lead-types";

/** True when the current user may change this lead (assignee, unassigned lead, or manager). */
export function useCanManageLead(
  lead: Pick<LeadResponse, "assigned_salesperson_id"> | null | undefined,
) {
  const { user, isManager } = useAuth();
  if (!lead || !user) return false;
  return (
    isManager || lead.assigned_salesperson_id == null || lead.assigned_salesperson_id === user.id
  );
}
