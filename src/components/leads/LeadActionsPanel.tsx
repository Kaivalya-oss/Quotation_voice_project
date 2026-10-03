import { useRef, useState } from "react";
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
import { LeadStageActions } from "@/components/leads/LeadStageActions";
import { useCanManageLead } from "@/hooks/use-can-manage-lead";
import { createFollowUp, getLead, listFollowUps } from "@/services/repository";
import {
  FOLLOWUP_TYPES,
  enumLabel,
  leadStatusStyles,
  type FollowupType,
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
 * Stage changes are offered by LeadStageActions (only valid next stages; the backend
 * state machine stays authoritative).
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
  const canManage = useCanManageLead(lead);

  // Follow-up scheduling
  const [fuType, setFuType] = useState<FollowupType>("CALL");
  const [fuAt, setFuAt] = useState(defaultFollowupSlot);
  const [fuNotes, setFuNotes] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const fuInFlight = useRef(false);

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
      setSuggestion(null);
      queryClient.invalidateQueries({ queryKey: ["followups"] });
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => {
      fuInFlight.current = false;
    },
  });

  const scheduleFollowup = () => {
    if (fuInFlight.current || !fuAt) return;
    fuInFlight.current = true;
    followupMutation.mutate();
  };

  const onTransitioned = (_lead: unknown, toStatus: LeadStatus) => {
    if (toStatus === "TEST_RIDE") {
      setFuType("VISIT");
      setFuNotes("Test ride at showroom");
      setSuggestion("Schedule the test ride visit below.");
    }
  };

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
        {lead.assigned_salesperson && (
          <span className="text-sm text-muted-foreground">
            · {lead.assigned_salesperson.full_name}
          </span>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Record customer response */}
        <div className="space-y-3 rounded-xl border p-4">
          <h4 className="font-medium flex items-center gap-2">
            <MessageSquareText className="size-4" /> Record customer response
          </h4>
          <p className="text-sm text-muted-foreground">
            Choose what happened. Only the stages allowed from {enumLabel(lead.status)} are shown.
          </p>
          <LeadStageActions lead={lead} onTransitioned={onTransitioned} />
        </div>

        {/* Schedule follow-up */}
        <div className="space-y-3 rounded-xl border p-4">
          <h4 className="font-medium flex items-center gap-2">
            <CalendarClock className="size-4" /> Schedule follow-up
          </h4>
          {suggestion && <p className="text-sm text-primary">{suggestion}</p>}
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
            disabled={!canManage || !fuAt || followupMutation.isPending}
            onClick={scheduleFollowup}
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
