import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { CalendarClock, FileText, Loader2, Phone, Search, UserRound } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LeadActionsPanel } from "@/components/leads/LeadActionsPanel";
import { useAuth } from "@/hooks/use-auth";
import { inr } from "@/lib/finance";
import {
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  enumLabel,
  leadStatusStyles,
  type LeadPriority,
  type LeadResponse,
  type LeadSource,
  type LeadStatus,
} from "@/lib/lead-types";
import { getLead, listLeads, listQuotations, listUsers, updateLead } from "@/services/repository";

const searchSchema = z.object({ lead: z.coerce.number().int().positive().optional() });

export const Route = createFileRoute("/_authenticated/leads")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Leads — QuoteSpeak" }] }),
  component: LeadsPage,
});

const ALL = "all";
const priorityStyles: Record<string, string> = {
  URGENT: "bg-destructive/10 text-destructive",
  HIGH: "bg-orange-500/15 text-orange-700",
  MEDIUM: "bg-muted text-foreground",
  LOW: "bg-muted text-muted-foreground",
};

function LeadsPage() {
  const { lead: leadParam } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user, isManager } = useAuth();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<LeadStatus | typeof ALL>(ALL);
  const [priority, setPriority] = useState<LeadPriority | typeof ALL>(ALL);
  const [source, setSource] = useState<LeadSource | typeof ALL>(ALL);
  const [salesperson, setSalesperson] = useState<string>(ALL);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const leadsQuery = useQuery({
    queryKey: ["leads", { debouncedSearch, status, priority, source, salesperson }],
    queryFn: () =>
      listLeads({
        search: debouncedSearch || undefined,
        status: status === ALL ? undefined : status,
        priority: priority === ALL ? undefined : priority,
        source: source === ALL ? undefined : source,
        assignedSalespersonId: salesperson === ALL ? undefined : Number(salesperson),
        pageSize: 100,
      }),
  });
  const leads = useMemo(() => leadsQuery.data?.items ?? [], [leadsQuery.data]);

  // Staff directory (management only). Salespeople only ever see their own leads.
  const { data: staff } = useQuery({
    queryKey: ["users", "active-sales-staff"],
    queryFn: () => listUsers({ isActive: true }),
    enabled: isManager,
    staleTime: 60_000,
  });
  const salespeople = useMemo<[number, string][]>(
    () =>
      (staff?.items ?? [])
        .filter((u) => ["SALES_EXECUTIVE", "DEALER_OWNER", "ADMIN"].includes(u.role.name))
        .map((u) => [u.id, u.id === user?.id ? `${u.full_name} (me)` : u.full_name]),
    [staff, user],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);

  const openLead = (id: number | undefined) => navigate({ search: id ? { lead: id } : {} });

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Leads"
        description="Every prospective buyer and where they are in the sales pipeline."
      />

      <Card className="rounded-2xl">
        <CardContent className="grid gap-3 p-4 md:grid-cols-6">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search customer, phone or notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search leads"
            />
          </div>
          <FilterSelect
            label="Status"
            value={status}
            onChange={(v) => setStatus(v as LeadStatus | typeof ALL)}
            options={LEAD_STATUSES.map((s) => [s, enumLabel(s)])}
          />
          <FilterSelect
            label="Priority"
            value={priority}
            onChange={(v) => setPriority(v as LeadPriority | typeof ALL)}
            options={LEAD_PRIORITIES.map((s) => [s, enumLabel(s)])}
          />
          <FilterSelect
            label="Source"
            value={source}
            onChange={(v) => setSource(v as LeadSource | typeof ALL)}
            options={LEAD_SOURCES.map((s) => [s, enumLabel(s)])}
          />
          {isManager ? (
            <FilterSelect
              label="Salesperson"
              value={salesperson}
              onChange={setSalesperson}
              options={salespeople.map(([id, name]) => [String(id), name])}
            />
          ) : (
            <p className="self-center text-xs text-muted-foreground">Showing your leads</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 text-sm">
        {LEAD_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(status === s ? ALL : s)}
            className={`rounded-full border px-3 py-1 transition-colors ${
              status === s ? "border-primary bg-primary/10" : "hover:bg-muted"
            }`}
          >
            {enumLabel(s)} <span className="text-muted-foreground">{counts[s] ?? 0}</span>
          </button>
        ))}
        <span className="ml-auto self-center text-muted-foreground">
          {leadsQuery.data ? `${leadsQuery.data.total} lead(s)` : ""}
        </span>
      </div>

      {leadsQuery.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : leadsQuery.isError ? (
        <Card>
          <CardContent className="p-8 text-center text-destructive">
            {(leadsQuery.error as Error).message}
          </CardContent>
        </Card>
      ) : leads.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            No leads match these filters.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {leads.map((l) => (
            <LeadRow key={l.id} lead={l} onOpen={() => openLead(l.id)} />
          ))}
        </div>
      )}

      <Sheet open={!!leadParam} onOpenChange={(open) => !open && openLead(undefined)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          {leadParam && <LeadDetail leadId={leadParam} salespeople={salespeople} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All {label.toLowerCase()}</SelectItem>
        {options.map(([v, text]) => (
          <SelectItem key={v} value={v}>
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LeadRow({ lead, onOpen }: { lead: LeadResponse; onOpen: () => void }) {
  const next = lead.next_followup_date ? new Date(lead.next_followup_date) : null;
  const overdue =
    next !== null && next.getTime() < Date.now() && !["PURCHASED", "LOST"].includes(lead.status);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-semibold">
            {lead.customer?.full_name ?? `Customer #${lead.customer_id}`}
            <span className="ml-2 text-sm font-normal text-muted-foreground">Lead #{lead.id}</span>
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {lead.customer?.phone && (
              <span className="flex items-center gap-1">
                <Phone className="size-3.5" /> {lead.customer.phone}
              </span>
            )}
            <span>{lead.interested_variant?.name ?? "No vehicle selected"}</span>
            <span className="flex items-center gap-1">
              <UserRound className="size-3.5" />{" "}
              {lead.assigned_salesperson?.full_name ?? "Unassigned"}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className={priorityStyles[lead.priority] ?? ""}>
            {enumLabel(lead.priority)}
          </Badge>
          <Badge variant="secondary" className={leadStatusStyles[lead.status] ?? ""}>
            {enumLabel(lead.status)}
          </Badge>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
        <span className={`flex items-center gap-1 ${overdue ? "text-destructive" : ""}`}>
          <CalendarClock className="size-3.5" />
          {next
            ? `Next follow-up ${next.toLocaleString("en-IN")}${overdue ? " · overdue" : ""}`
            : "No follow-up scheduled"}
        </span>
        <span>Created {new Date(lead.created_at).toLocaleDateString("en-IN")}</span>
        <span>{enumLabel(lead.source)}</span>
      </div>
    </button>
  );
}

function LeadDetail({ leadId, salespeople }: { leadId: number; salespeople: [number, string][] }) {
  const queryClient = useQueryClient();
  const { isManager } = useAuth();
  const leadQuery = useQuery({ queryKey: ["lead", leadId], queryFn: () => getLead(leadId) });
  const lead = leadQuery.data;

  const quotesQuery = useQuery({
    queryKey: ["quotations", { customerId: lead?.customer_id }],
    queryFn: () => listQuotations({ customerId: lead!.customer_id, pageSize: 20 }),
    enabled: !!lead,
  });

  const [assignee, setAssignee] = useState<string>("");
  const reassign = useMutation({
    mutationFn: (id: number) => updateLead(leadId, { assigned_salesperson_id: id }),
    onSuccess: () => {
      toast.success("Lead reassigned");
      queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setAssignee("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (leadQuery.isLoading) {
    return (
      <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading lead…
      </p>
    );
  }
  if (!lead)
    return <p className="p-6 text-sm text-destructive">Lead #{leadId} could not be loaded.</p>;

  const c = lead.customer;
  return (
    <div className="space-y-6">
      <SheetHeader>
        <SheetTitle>{c?.full_name ?? `Lead #${lead.id}`}</SheetTitle>
      </SheetHeader>

      <section className="space-y-1 rounded-xl border p-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Customer #{lead.customer_id}
        </p>
        {c && (
          <>
            <p>
              {c.phone}
              {c.email ? ` · ${c.email}` : ""}
            </p>
            {(c.address || c.city) && (
              <p className="text-muted-foreground">
                {[c.address, c.city].filter(Boolean).join(", ")}
              </p>
            )}
          </>
        )}
        <Link to="/customers" className="text-xs text-primary hover:underline">
          Open customers
        </Link>
      </section>

      <LeadActionsPanel leadId={lead.id} />

      {isManager && (
        <section className="space-y-2 rounded-xl border p-4">
          <Label>Reassign salesperson</Label>
          <div className="flex gap-2">
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger>
                <SelectValue placeholder={lead.assigned_salesperson?.full_name ?? "Unassigned"} />
              </SelectTrigger>
              <SelectContent>
                {salespeople
                  .filter(([id]) => id !== lead.assigned_salesperson_id)
                  .map(([id, name]) => (
                    <SelectItem key={id} value={String(id)}>
                      {name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              disabled={!assignee || reassign.isPending}
              onClick={() => !reassign.isPending && reassign.mutate(Number(assignee))}
            >
              {reassign.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Reassign
            </Button>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h4 className="flex items-center gap-2 text-sm font-medium">
          <FileText className="size-4" /> Quotation history for this customer
        </h4>
        {quotesQuery.isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : (quotesQuery.data?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No quotations yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border text-sm">
            {quotesQuery.data!.items.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <Link
                  to="/quotations"
                  search={{ q: q.quotation_number }}
                  className="font-medium text-primary hover:underline"
                >
                  {q.quotation_number}
                </Link>
                <span className="text-muted-foreground">{q.variant?.name}</span>
                <span>{inr(Number(q.final_price))}</span>
                <Badge variant="outline">{enumLabel(q.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
