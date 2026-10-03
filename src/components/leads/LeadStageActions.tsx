import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCanManageLead } from "@/hooks/use-can-manage-lead";
import { ApiError } from "@/lib/api";
import {
  LEAD_ACTION_DEFAULT_REASON,
  LEAD_NEXT_STATUSES,
  enumLabel,
  type LeadResponse,
  type LeadStatus,
} from "@/lib/lead-types";
import { transitionLeadStatus } from "@/services/repository";

interface Props {
  lead: LeadResponse;
  /** Smaller buttons for list rows (follow-ups, leads list). */
  compact?: boolean;
  onTransitioned?: (lead: LeadResponse, toStatus: LeadStatus) => void;
}

/**
 * Offers only the stage changes the backend state machine allows from the lead's current
 * status. Each move is confirmed, sends `from_status` so a stale screen gets a clear 409
 * instead of an unintended transition, and is guarded against double submission.
 */
export function LeadStageActions({ lead, compact = false, onTransitioned }: Props) {
  const queryClient = useQueryClient();
  const canManage = useCanManageLead(lead);
  const [target, setTarget] = useState<LeadStatus | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const options = LEAD_NEXT_STATUSES[lead.status] ?? [];

  const mutation = useMutation({
    mutationFn: (toStatus: LeadStatus) =>
      transitionLeadStatus(lead.id, {
        to_status: toStatus,
        from_status: lead.status,
        reason: reason.trim() || LEAD_ACTION_DEFAULT_REASON[toStatus] || null,
      }),
    onSuccess: (updated, toStatus) => {
      toast.success(`Lead #${lead.id} moved to ${enumLabel(toStatus)}`);
      setTarget(null);
      setReason("");
      setError(null);
      onTransitioned?.(updated, toStatus);
    },
    onError: (err: Error) => {
      const message =
        err instanceof ApiError && err.code === "LEAD_STATE_CHANGED"
          ? `${err.message}`
          : err.message || "Could not update the lead.";
      setError(message);
      toast.error(message);
    },
    onSettled: () => {
      inFlight.current = false;
      queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["followups"] });
    },
  });

  const confirm = () => {
    if (!target || inFlight.current) return;
    inFlight.current = true;
    mutation.mutate(target);
  };

  if (!canManage) {
    return (
      <p
        className={`flex items-center gap-1 text-muted-foreground ${compact ? "text-xs" : "text-sm"}`}
      >
        <Lock className="size-3.5" /> Assigned to{" "}
        {lead.assigned_salesperson?.full_name ?? "another salesperson"}
      </p>
    );
  }

  if (options.length === 0) {
    return (
      <p className={`text-muted-foreground ${compact ? "text-xs" : "text-sm"}`}>
        {enumLabel(lead.status)} is a final stage.
      </p>
    );
  }

  if (target) {
    return (
      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <p className="text-sm font-medium">
          Move lead #{lead.id} from {enumLabel(lead.status)} to {enumLabel(target)}?
        </p>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={LEAD_ACTION_DEFAULT_REASON[target] ?? "Reason (optional)"}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirm();
            }
          }}
          aria-label="Reason for stage change"
        />
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button size="sm" onClick={confirm} disabled={mutation.isPending} className="gap-1">
            {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
            Confirm
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={mutation.isPending}
            onClick={() => {
              setTarget(null);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((status) => (
        <Button
          key={status}
          size="sm"
          variant={status === "LOST" ? "outline" : "secondary"}
          className={`gap-1 ${compact ? "h-7 px-2 text-xs" : ""} ${status === "LOST" ? "text-destructive" : ""}`}
          onClick={() => {
            setTarget(status);
            setReason("");
            setError(null);
          }}
        >
          {status !== "LOST" && <ArrowRight className="size-3.5" />}
          {status === "LOST" ? "Mark lost" : `Move to ${enumLabel(status)}`}
        </Button>
      ))}
    </div>
  );
}
