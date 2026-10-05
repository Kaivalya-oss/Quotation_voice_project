import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Mic, MoreHorizontal, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { inr } from "@/lib/finance";
import { downloadBlob } from "@/lib/pdf";
import {
  listQuotations,
  updateQuotationStatus,
  downloadQuotationPdf,
  sendQuotationWhatsApp,
} from "@/services/repository";
import type {
  QuotationResponse,
  BackendQuotationStatus,
} from "@/lib/quotation-types";
import { QUOTATION_STATUS_TRANSITIONS, isRealWhatsAppDelivery } from "@/lib/quotation-types";

const searchSchema = z.object({ q: z.string().optional() });

export const Route = createFileRoute("/_authenticated/quotations/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Quotations — Voice Quote" },
      {
        name: "description",
        content: "Search, filter and share every quotation your dealership has created.",
      },
    ],
  }),
  component: QuotationsPage,
});

const PAGE_SIZE = 10;

const BACKEND_STATUSES: BackendQuotationStatus[] = [
  "DRAFT",
  "GENERATED",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
];

const statusStyles: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  GENERATED: "bg-primary/10 text-primary",
  SENT: "bg-blue-500/10 text-blue-600",
  ACCEPTED: "bg-success/15 text-success",
  REJECTED: "bg-destructive/10 text-destructive",
  EXPIRED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-destructive/10 text-destructive",
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/10 text-blue-600",
  accepted: "bg-success/15 text-success",
  rejected: "bg-destructive/10 text-destructive",
  expired: "bg-muted text-muted-foreground",
};

const statusLabel = (s: string) => {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, " ");
};

function QuotationsPage() {
  const { q } = Route.useSearch();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState(q ?? "");
  const [status, setStatus] = useState<BackendQuotationStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<number | null>(null);

  const listQuery = useQuery({
    queryKey: ["quotations", { query, status, page }],
    queryFn: () => listQuotations({ search: query, status, page, pageSize: PAGE_SIZE }),
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const pages = Math.max(1, listQuery.data?.pages ?? 1);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["quotations"] });

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: number; next: BackendQuotationStatus }) =>
      updateQuotationStatus(id, { status: next }),
    onSuccess: () => {
      toast.success("Status updated");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleDownload = async (row: QuotationResponse) => {
    setBusyId(row.id);
    try {
      const blob = await downloadQuotationPdf(row.id);
      downloadBlob(blob, `${row.quotation_number}.pdf`);
      toast.success("PDF downloaded");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleWhatsApp = async (row: QuotationResponse) => {
    if (!row.customer?.phone) {
      toast.error("This customer has no phone number.");
      return;
    }
    setBusyId(row.id);
    try {
      const res = await sendQuotationWhatsApp(row.id);
      if (isRealWhatsAppDelivery(res)) {
        toast.success(`Quotation sent to ${row.customer.full_name}'s WhatsApp.`);
      } else {
        toast.warning(
          `WhatsApp NOT delivered — backend is in simulation mode (${res.delivery?.status ?? "unknown"}). ${res.delivery?.note ?? ""}`,
        );
      }
      invalidate();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    if (items.length === 0) return;
    const header = ["Quotation", "Customer", "Vehicle", "Date", "Status", "Amount"];
    const body = items.map((row) => [
      row.quotation_number,
      row.customer?.full_name ?? "",
      row.variant?.name ?? "",
      new Date(row.created_at).toLocaleDateString("en-IN"),
      row.status,
      String(row.final_price),
    ]);
    const csv = [header, ...body].map((line) => line.map((c) => `"${c}"`).join(",")).join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv" }), "quotations.csv");
    toast.success("Export ready");
  };

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Quotations"
        description={`${total} quotation${total === 1 ? "" : "s"} found`}
        actions={
          <Button asChild className="shrink-0 rounded-full">
            <Link to="/quotations/new">
              <Mic className="size-4" /> New
            </Link>
          </Button>
        }
      />

      <Card className="rounded-2xl">
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by quote number, customer, or vehicle"
                className="pl-9"
              />
            </div>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v as BackendQuotationStatus | "all");
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {BACKEND_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" /> Export
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quotation</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">On-road</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQuery.isLoading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!listQuery.isLoading &&
                  items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.quotation_number}</TableCell>
                      <TableCell>
                        <div className="font-medium">{row.customer?.full_name ?? "—"}</div>
                        {row.customer?.phone && (
                          <div className="text-xs text-muted-foreground">{row.customer.phone}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.variant?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(row.created_at).toLocaleDateString("en-IN")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={statusStyles[row.status] ?? "bg-muted text-muted-foreground"}
                          variant="secondary"
                        >
                          {statusLabel(row.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {inr(Number(row.final_price))}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={busyId === row.id}
                              aria-label={`Actions for ${row.quotation_number}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => void handleDownload(row)}>
                              <Download className="size-4" /> Download PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => void handleWhatsApp(row)}>
                              <Send className="size-4" /> Send on WhatsApp
                            </DropdownMenuItem>
                            {(QUOTATION_STATUS_TRANSITIONS[row.status] ?? []).map((s) => (
                              <DropdownMenuItem
                                key={s}
                                onSelect={() => statusMutation.mutate({ id: row.id, next: s })}
                              >
                                Mark as {statusLabel(s)}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                {!listQuery.isLoading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      No quotations match your filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Page {page} of {pages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
