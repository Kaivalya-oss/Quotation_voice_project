import { useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, CheckCircle2, Loader2, Star } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import {
  bookTestRide,
  cancelTestRide,
  completeTestRide,
  confirmTestRide,
  listLeads,
  listTestRides,
  listVehicles,
} from "@/services/repository";
import { enumLabel, type LeadResponse } from "@/lib/lead-types";
import {
  ACTIVE_RIDE_STATUSES,
  testRideStatusStyles,
  type TestRideResponse,
} from "@/lib/test-ride-types";

export const Route = createFileRoute("/_authenticated/test-rides")({
  head: () => ({ meta: [{ title: "Test Rides — QuoteSpeak" }] }),
  component: TestRidesPage,
});

type RideTab = "upcoming" | "COMPLETED" | "CANCELLED" | "all";

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

/** Value for <input type="datetime-local"> in the browser's local time. */
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nextFullHour() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

function TestRidesPage() {
  const queryClient = useQueryClient();
  const { user, isManager, canSell } = useAuth();
  const [tab, setTab] = useState<RideTab>("upcoming");
  const [bookingLead, setBookingLead] = useState<LeadResponse | null>(null);
  const [completingRide, setCompletingRide] = useState<TestRideResponse | null>(null);
  const inFlight = useRef(new Set<number>());

  const ridesQuery = useQuery({
    queryKey: ["test-rides"],
    queryFn: () => listTestRides({ status: "all", pageSize: 100 }),
  });
  const leadsQuery = useQuery({
    queryKey: ["leads", { status: "TEST_RIDE" }],
    queryFn: () => listLeads({ status: "TEST_RIDE", pageSize: 100 }),
  });

  const rides = ridesQuery.data?.items ?? [];
  // A lead moved to "Test ride" needs a slot until a ride exists for that customer + vehicle
  const covered = new Set(
    rides
      .filter((r) => ACTIVE_RIDE_STATUSES.has(r.status))
      .map((r) => `${r.customer_id}:${r.variant_id}`),
  );
  const awaiting = (leadsQuery.data?.items ?? []).filter(
    (l) => !covered.has(`${l.customer_id}:${l.interested_variant_id ?? ""}`),
  );

  const shown = rides
    .filter((r) =>
      tab === "all"
        ? true
        : tab === "upcoming"
          ? r.status === "REQUESTED" || r.status === "CONFIRMED"
          : r.status === tab,
    )
    .sort((a, b) =>
      tab === "upcoming"
        ? a.scheduled_at.localeCompare(b.scheduled_at)
        : b.scheduled_at.localeCompare(a.scheduled_at),
    );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["test-rides"] });
    queryClient.invalidateQueries({ queryKey: ["leads"] });
  };

  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "confirm" | "cancel" }) =>
      action === "confirm"
        ? confirmTestRide(id)
        : cancelTestRide(id, "Cancelled from test rides page"),
    onSuccess: (_d, { action }) =>
      toast.success(action === "confirm" ? "Test ride confirmed" : "Test ride cancelled"),
    onError: (err: Error) => toast.error(err.message),
    onSettled: (_d, _e, { id }) => {
      inFlight.current.delete(id);
      refresh();
    },
  });

  const act = (id: number, action: "confirm" | "cancel") => {
    // Synchronous guard: a double click must not send two requests before React re-renders.
    if (inFlight.current.has(id)) return;
    if (action === "cancel" && !window.confirm("Cancel this test ride?")) return;
    inFlight.current.add(id);
    actionMutation.mutate({ id, action });
  };

  const now = new Date();
  const todayCount = rides.filter(
    (r) =>
      (r.status === "REQUESTED" || r.status === "CONFIRMED") &&
      isSameDay(new Date(r.scheduled_at), now),
  ).length;

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Test Rides"
        description={
          todayCount > 0
            ? `${todayCount} test ride${todayCount === 1 ? "" : "s"} scheduled today.`
            : "Book, confirm and complete customer test rides."
        }
      />

      {/* Leads moved to the Test ride stage that still need a slot */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Waiting for a slot
            {awaiting.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {awaiting.length}
              </Badge>
            )}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Customers whose lead is in the <strong>Test ride</strong> stage but have no ride booked
            yet.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {leadsQuery.isLoading || ridesQuery.isLoading ? (
            <Skeleton className="h-14 w-full rounded-lg" />
          ) : leadsQuery.isError ? (
            <p className="text-sm text-destructive">{(leadsQuery.error as Error).message}</p>
          ) : awaiting.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody is waiting. Move a lead to “Test ride” on the Leads page and it will appear
              here.
            </p>
          ) : (
            awaiting.map((lead) => (
              <div
                key={lead.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="space-y-0.5">
                  <p className="font-medium">
                    {lead.customer?.full_name ?? `Customer #${lead.customer_id}`}
                    {lead.customer?.phone && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {lead.customer.phone}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {lead.interested_variant?.name ?? "No vehicle chosen"} · Lead #{lead.id}
                    {isManager && lead.assigned_salesperson
                      ? ` · ${lead.assigned_salesperson.full_name}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    to="/leads"
                    search={{ lead: lead.id }}
                    className="text-xs text-primary hover:underline"
                  >
                    Open lead
                  </Link>
                  {canSell && (
                    <Button size="sm" className="gap-1" onClick={() => setBookingLead(lead)}>
                      <CalendarPlus className="size-4" />
                      Book slot
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as RideTab)}>
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="COMPLETED">Completed</TabsTrigger>
          <TabsTrigger value="CANCELLED">Cancelled</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {ridesQuery.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : ridesQuery.isError ? (
        <Card>
          <CardContent className="p-8 text-center text-destructive">
            {(ridesQuery.error as Error).message}
          </CardContent>
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            {tab === "upcoming" ? "No upcoming test rides." : "No test rides here."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => {
            const when = new Date(r.scheduled_at);
            const open = r.status === "REQUESTED" || r.status === "CONFIRMED";
            const overdue = open && when.getTime() + r.duration_minutes * 60_000 < now.getTime();
            const canChange = isManager || r.sales_executive_id === user?.id;
            const busy = actionMutation.isPending && actionMutation.variables?.id === r.id;
            return (
              <Card key={r.id} className="rounded-xl">
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-sm font-medium ${overdue ? "text-destructive" : ""}`}>
                        {when.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                        {" · "}
                        {r.duration_minutes} min
                        {overdue ? " · overdue" : ""}
                      </span>
                      {open && isSameDay(when, now) && <Badge>Today</Badge>}
                      <Badge variant="secondary" className={testRideStatusStyles[r.status] ?? ""}>
                        {enumLabel(r.status)}
                      </Badge>
                    </div>
                    <p className="font-semibold">
                      {r.customer?.full_name ?? `Customer #${r.customer_id}`}
                      {r.customer?.phone && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {r.customer.phone}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {r.variant?.name ?? `Vehicle #${r.variant_id}`}
                      {r.driving_license_number ? ` · DL ${r.driving_license_number}` : ""}
                      {isManager && r.sales_executive ? ` · ${r.sales_executive.full_name}` : ""}
                    </p>
                    {r.feedback_rating != null && (
                      <p
                        className="flex items-center gap-0.5 text-sm"
                        aria-label={`Rated ${r.feedback_rating} of 5`}
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={`size-4 ${n <= (r.feedback_rating ?? 0) ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                          />
                        ))}
                      </p>
                    )}
                    {r.notes && <p className="text-sm whitespace-pre-line">{r.notes}</p>}
                  </div>
                  {open && canChange && (
                    <div className="flex flex-col items-end gap-2">
                      {r.status === "REQUESTED" && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => act(r.id, "confirm")}
                        >
                          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                          Confirm
                        </Button>
                      )}
                      <Button size="sm" className="gap-1" onClick={() => setCompletingRide(r)}>
                        <CheckCircle2 className="size-4" />
                        Ride done
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground"
                        disabled={busy}
                        onClick={() => act(r.id, "cancel")}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <BookRideDialog lead={bookingLead} onClose={() => setBookingLead(null)} onBooked={refresh} />
      <CompleteRideDialog
        ride={completingRide}
        onClose={() => setCompletingRide(null)}
        onDone={refresh}
      />
    </div>
  );
}

function BookRideDialog({
  lead,
  onClose,
  onBooked,
}: {
  lead: LeadResponse | null;
  onClose: () => void;
  onBooked: () => void;
}) {
  const [variantId, setVariantId] = useState<number | null>(null);
  const [when, setWhen] = useState(() => toLocalInput(nextFullHour()));
  const [duration, setDuration] = useState(30);
  const [license, setLicense] = useState("");
  const [notes, setNotes] = useState("");
  const [openFor, setOpenFor] = useState<number | null>(null);
  const submitting = useRef(false);

  // Reset the form each time it opens for a different lead
  if (lead && openFor !== lead.id) {
    setOpenFor(lead.id);
    setVariantId(lead.interested_variant_id ?? null);
    setWhen(toLocalInput(nextFullHour()));
    setDuration(30);
    setLicense("");
    setNotes("");
  }

  const vehiclesQuery = useQuery({
    queryKey: ["vehicles", { status: "ACTIVE", pageSize: 100 }],
    queryFn: () => listVehicles({ status: "ACTIVE", pageSize: 100 }),
    enabled: lead !== null,
  });

  const mutation = useMutation({
    mutationFn: () =>
      bookTestRide({
        customer_id: lead!.customer_id,
        variant_id: variantId!,
        scheduled_at: new Date(when).toISOString(),
        duration_minutes: duration,
        driving_license_number: license.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      toast.success("Test ride booked");
      onBooked();
      setOpenFor(null);
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => {
      submitting.current = false;
    },
  });

  const inPast = new Date(when).getTime() < Date.now();
  const canSubmit = variantId !== null && when !== "" && !inPast && !mutation.isPending;

  const submit = () => {
    if (!canSubmit || submitting.current) return;
    submitting.current = true;
    mutation.mutate();
  };

  return (
    <Dialog
      open={lead !== null}
      onOpenChange={(o) => {
        if (!o) {
          setOpenFor(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book test ride</DialogTitle>
          <DialogDescription>
            {lead?.customer?.full_name ?? "Customer"}
            {lead?.customer?.phone ? ` · ${lead.customer.phone}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Vehicle</Label>
            <Select
              value={variantId ? String(variantId) : ""}
              onValueChange={(v) => setVariantId(Number(v))}
            >
              <SelectTrigger aria-label="Test ride vehicle">
                <SelectValue
                  placeholder={vehiclesQuery.isLoading ? "Loading…" : "Select vehicle"}
                />
              </SelectTrigger>
              <SelectContent>
                {(vehiclesQuery.data?.items ?? []).map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ride-when">Date &amp; time</Label>
              <Input
                id="ride-when"
                type="datetime-local"
                value={when}
                min={toLocalInput(new Date())}
                onChange={(e) => setWhen(e.target.value)}
              />
              {inPast && <p className="text-xs text-destructive">Pick a time in the future.</p>}
            </div>
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                <SelectTrigger aria-label="Test ride duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[15, 30, 45, 60].map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m} minutes
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ride-dl">Driving licence no. (optional)</Label>
            <Input
              id="ride-dl"
              value={license}
              maxLength={50}
              placeholder="e.g. MH12 20110012345"
              onChange={(e) => setLicense(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ride-notes">Notes (optional)</Label>
            <Textarea
              id="ride-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Book ride
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteRideDialog({
  ride,
  onClose,
  onDone,
}: {
  ride: TestRideResponse | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState("");
  const [openFor, setOpenFor] = useState<number | null>(null);
  const submitting = useRef(false);

  if (ride && openFor !== ride.id) {
    setOpenFor(ride.id);
    setRating(0);
    setNotes("");
  }

  const mutation = useMutation({
    mutationFn: () => completeTestRide(ride!.id, rating, notes.trim() || null),
    onSuccess: () => {
      toast.success("Test ride completed");
      onDone();
      setOpenFor(null);
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => {
      submitting.current = false;
    },
  });

  const submit = () => {
    if (rating < 1 || submitting.current) return;
    submitting.current = true;
    mutation.mutate();
  };

  return (
    <Dialog
      open={ride !== null}
      onOpenChange={(o) => {
        if (!o) {
          setOpenFor(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How did the ride go?</DialogTitle>
          <DialogDescription>
            {ride?.customer?.full_name ?? "Customer"} · {ride?.variant?.name ?? "vehicle"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Customer rating</Label>
            <div className="flex gap-1" role="radiogroup" aria-label="Customer rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  onClick={() => setRating(n)}
                  className="rounded p-1 hover:bg-muted"
                >
                  <Star
                    className={`size-6 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                  />
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ride-feedback">Feedback (optional)</Label>
            <Textarea
              id="ride-feedback"
              rows={3}
              placeholder="What did the customer like or dislike?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Next, move the lead to Negotiation (or Lost) from the Leads page.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button disabled={rating < 1 || mutation.isPending} onClick={submit}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Mark completed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
