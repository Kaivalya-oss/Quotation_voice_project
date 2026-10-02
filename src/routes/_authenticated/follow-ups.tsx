import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { completeFollowUp, getLead, listFollowUps } from "@/services/repository";
import { enumLabel, leadStatusStyles, type FollowupStatus } from "@/lib/lead-types";

export const Route = createFileRoute("/_authenticated/follow-ups")({
  head: () => ({ meta: [{ title: "Follow-ups — QuoteSpeak" }] }),
  component: FollowUpsPage,
});

function FollowUpsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<FollowupStatus | "all">("SCHEDULED");

  const listQuery = useQuery({
    queryKey: ["followups", { status }],
    queryFn: () => listFollowUps({ status, pageSize: 100 }),
  });
  const items = [...(listQuery.data?.items ?? [])].sort((a, b) =>
    a.scheduled_at.localeCompare(b.scheduled_at),
  );

  // Follow-ups only carry lead_id; resolve each lead once for the customer name and stage
  const leadIds = [...new Set(items.map((f) => f.lead_id))];
  const leadQueries = useQueries({
    queries: leadIds.map((id) => ({ queryKey: ["lead", id], queryFn: () => getLead(id) })),
  });
  const leadsById = new Map(
    leadQueries.flatMap((q) => (q.data ? [[q.data.id, q.data] as const] : [])),
  );

  const completeMutation = useMutation({
    mutationFn: (id: number) => completeFollowUp(id),
    onSuccess: () => {
      toast.success("Follow-up marked complete");
      queryClient.invalidateQueries({ queryKey: ["followups"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const now = Date.now();

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Follow-ups" description="Daily tasks and customer check-ins." />

      <Tabs value={status} onValueChange={(v) => setStatus(v as FollowupStatus | "all")}>
        <TabsList>
          <TabsTrigger value="SCHEDULED">Scheduled</TabsTrigger>
          <TabsTrigger value="COMPLETED">Completed</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {listQuery.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : listQuery.isError ? (
        <Card>
          <CardContent className="p-8 text-center text-destructive">
            {(listQuery.error as Error).message}
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            {status === "SCHEDULED"
              ? "You are all caught up! No pending follow-ups."
              : "No follow-ups."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((f) => {
            const lead = leadsById.get(f.lead_id);
            const overdue = f.status === "SCHEDULED" && new Date(f.scheduled_at).getTime() < now;
            return (
              <Card key={f.id} className="rounded-xl">
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{enumLabel(f.type)}</Badge>
                      <span className={`text-sm font-medium ${overdue ? "text-destructive" : ""}`}>
                        {new Date(f.scheduled_at).toLocaleString("en-IN")}
                        {overdue ? " · overdue" : ""}
                      </span>
                      <Badge variant="secondary">{enumLabel(f.status)}</Badge>
                    </div>
                    <p className="font-semibold">
                      {lead?.customer?.full_name ?? `Lead #${f.lead_id}`}
                      {lead?.customer?.phone ? (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {lead.customer.phone}
                        </span>
                      ) : null}
                    </p>
                    <div className="text-sm text-muted-foreground">
                      Lead #{f.lead_id}
                      {lead && (
                        <>
                          {" · "}
                          <Badge
                            variant="secondary"
                            className={leadStatusStyles[lead.status] ?? ""}
                          >
                            {enumLabel(lead.status)}
                          </Badge>
                          {lead.interested_variant ? ` · ${lead.interested_variant.name}` : ""}
                        </>
                      )}
                    </div>
                    {f.notes && <p className="text-sm">{f.notes}</p>}
                  </div>
                  {f.status === "SCHEDULED" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={completeMutation.isPending}
                      onClick={() => completeMutation.mutate(f.id)}
                    >
                      {completeMutation.isPending && completeMutation.variables === f.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-4" />
                      )}
                      Mark done
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
