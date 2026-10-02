import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, History, Loader2, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createFollowUp,
  getLead,
  listFollowUps,
  transitionLeadStatus,
} from "@/services/repository";
import {
  FOLLOWUP_TYPES,
  LEAD_STATUSES,
  enumLabel,
  leadStatusStyles,
  type FollowupType,
  type LeadResponse,
  type LeadStatus,
} from "@/lib/lead-types";

/** Default follow-up slot: tomorrow 10:00 local time, formatted for <input type="datetime-local"> */
function defaultFollowupSlot(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Records customer responses against a lead and schedules follow-ups.
 * Status changes go through POST /leads/{id}/status; the backend state machine decides
 * which transitions are valid and its error message is shown as-is when one is rejected.
 */
export function LeadActionsPanel({ leadId }: { leadId: number }) {
  const queryClient = useQueryClient();

  const leadQuery = useQuery({
    queryKey: ["lead", leadId],
    queryFn: () => getLead(leadId),
  });
  const followupsQuery = useQuery({
    queryKey: ["followups", { leadId }],
    queryFn: () => listFollowUps({ leadId, pageSize: 20 }),
  });

  const lead = leadQuery.data;

  // Response / status transition
  const [toStatus, setToStatus] = useState<LeadStatus | "">("");
  const [reason, setReason] = useState("");
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const transitionMutation = useMutation({
    mutationFn: () =>
      transitionLeadStatus(leadId, {
        to_status: toStatus as LeadStatus,
        reason: reason.trim() || null,
      }),
    onSuccess: (updated: LeadResponse) => {
      // The transition response can carry a stale status_history (backend returns the
      // session-cached collection), so refetch the lead rather than trusting the payload.
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`Lead moved to ${enumLabel(updated.status)}`);
      setToStatus("");
      setReason("");
      setTransitionError(null);
    },
    onError: (err: Error) => setTransitionError(err.message),
  });

  // Follow-up scheduling
  const [fuType, setFuType] = useState<FollowupType>("CALL");
  const [fuAt, setFuAt] = useState(defaultFollowupSlot);
  const [fuNotes, setFuNotes] = useState("");

  const followupMutation = useMutation({
    mutationFn: () =>
      createFollowUp({
        lead_id: leadId,
        type: fuType,
        scheduled_at: new Date(fuAt).toISOString(),
        notes: fuNotes.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Follow-up scheduled");
      setFuNotes("");
      queryClient.invalidateQueries({ queryKey: ["followups"] });
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (leadQuery.isLoading) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Loading lead…
      </p>
    );
  }
  if (!lead) {
    return <p className="text-sm text-destructive">Could not load lead #{leadId}.</p>;
  }

  const history = [...lead.status_history].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const followups = followupsQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Lead #{lead.id}</span>
        <Badge className={leadStatusStyles[lead.status] ?? ""} variant="secondary">
          {enumLabel(lead.status)}
        </Badge>
        <Badge variant="outline">{enumLabel(lead.source)}</Badge>
        <Badge variant="outline">{enumLabel(lead.priority)} priority</Badge>
        {lead.interested_variant && (
          <span className="text-sm text-muted-foreground">
            Interested in {lead.interested_variant.name}
          </span>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Record customer response */}
        <div className="space-y-3 rounded-xl border p-4">
          <h4 className="font-medium flex items-center gap-2">
            <MessageSquareText className="size-4" /> Record customer response
          </h4>
          <div className="space-y-2">
            <Label>Move lead to</Label>
            <Select value={toStatus} onValueChange={(v) => setToStatus(v as LeadStatus)}>
              <SelectTrigger>
                <SelectValue placeholder="Select next stage" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.filter((s) => s !== lead.status).map((s) => (
                  <SelectItem key={s} value={s}>
                    {enumLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>What did the customer say?</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Called back, wants a test ride on Saturday"
            />
          </div>
          {transitionError && (
            <p className="text-sm text-destructive" role="alert">
              {transitionError}
            </p>
          )}
          <Button
            className="w-full"
            disabled={!toStatus || transitionMutation.isPending}
            onClick={() => transitionMutation.mutate()}
          >
            {transitionMutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
            Update stage
          </Button>
          <p className="text-xs text-muted-foreground">
            Allowed stage changes are enforced by the server's sales pipeline rules.
          </p>
        </div>

        {/* Schedule follow-up */}
        <div className="space-y-3 rounded-xl border p-4">
          <h4 className="font-medium flex items-center gap-2">
            <CalendarClock className="size-4" /> Schedule follow-up
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={fuType} onValueChange={(v) => setFuType(v as FollowupType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOLLOWUP_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {enumLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>When</Label>
              <Input type="datetime-local" value={fuAt} onChange={(e) => setFuAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={fuNotes}
              onChange={(e) => setFuNotes(e.target.value)}
              placeholder="e.g. Customer will decide tomorrow"
            />
          </div>
          <Button
            variant="secondary"
            className="w-full"
            disabled={!fuAt || followupMutation.isPending}
            onClick={() => followupMutation.mutate()}
          >
            {followupMutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
            Schedule follow-up
          </Button>
          {followups.length > 0 && (
            <ul className="space-y-1 pt-2 border-t text-sm">
              {followups.map((f) => (
                <li key={f.id} className="flex justify-between gap-2">
                  <span>
                    {enumLabel(f.type)} · {new Date(f.scheduled_at).toLocaleString("en-IN")}
                  </span>
                  <Badge variant="outline">{enumLabel(f.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Status history */}
      <div className="space-y-2">
        <h4 className="font-medium flex items-center gap-2 text-sm">
          <History className="size-4" /> Stage history
        </h4>
        <ol className="space-y-1 text-sm text-muted-foreground">
          {history.map((h) => (
            <li key={h.id}>
              <span className="text-foreground">
                {h.from_status === "NONE" ? "Created" : enumLabel(h.from_status)} →{" "}
                {enumLabel(h.to_status)}
              </span>{" "}
              · {new Date(h.created_at).toLocaleString("en-IN")}
              {h.reason ? ` — “${h.reason}”` : ""}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
