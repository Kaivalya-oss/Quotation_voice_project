import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Mic, MoreHorizontal, Search, Send, Trash2 } from "lucide-react";
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
import { useAuth } from "@/hooks/use-auth";
import { useSettings } from "@/hooks/use-settings";
import { inr } from "@/lib/finance";
import { buildQuotationPdf, downloadBlob } from "@/lib/pdf";
import { buildWhatsAppMessage, sendWhatsApp } from "@/lib/whatsapp";
import {
  deleteQuotation,
  listQuotations,
  updateQuotation,
  type QuotationAccessory,
  type QuotationWithRelations,
} from "@/services/repository";
import { QUOTATION_STATUSES, type QuotationStatus } from "@/lib/validators";

const searchSchema = z.object({ q: z.string().optional() });

export const Route = createFileRoute("/_authenticated/quotations")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Quotations — VoiceQuote AI" },
      {
        name: "description",
        content: "Search, filter and share every quotation your dealership has created.",
      },
    ],
  }),
  component: QuotationsPage,
});

const PAGE_SIZE = 10;

const statusStyles: Record<QuotationStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/10 text-primary",
  accepted: "bg-success/15 text-success-foreground",
  rejected: "bg-destructive/10 text-destructive",
  expired: "bg-muted text-muted-foreground",
  converted: "bg-success/20 text-success-foreground",
};

const statusLabel = (s: QuotationStatus) => s.charAt(0).toUpperCase() + s.slice(1);

function QuotationsPage() {
  const { q } = Route.useSearch();
  const queryClient = useQueryClient();
  const { isManager } = useAuth();
  const { dealership, quotation: quotationSettings } = useSettings();
  const [query, setQuery] = useState(q ?? "");
  const [status, setStatus] = useState<QuotationStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["quotations", { query, status, page }],
    queryFn: () => listQuotations({ search: query, status, page, pageSize: PAGE_SIZE }),
  });

  const rows = listQuery.data?.rows ?? [];
  const count = listQuery.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["quotations"] });

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: QuotationStatus }) =>
      updateQuotation(id, { status: next }),
    onSuccess: () => {
      toast.success("Status updated");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteQuotation,
    onSuccess: () => {
      toast.success("Quotation deleted");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const buildPdf = async (row: QuotationWithRelations) => {
    const vehicleName = row.vehicle
      ? `${row.vehicle.brand} ${row.vehicle.model} ${row.vehicle.variant}`
      : "Vehicle";
    const blob = await buildQuotationPdf({
      quotationNumber: row.quotation_number,
      createdAt: row.created_at,
      validUntil: row.valid_until,
      dealership,
      customer: {
        name: row.customer?.name ?? "Customer",
        phone: row.customer?.phone ?? "",
        city: row.customer?.city ?? null,
      },
      vehicle: row.vehicle
        ? {
            brand: row.vehicle.brand,
            model: row.vehicle.model,
            variant: row.vehicle.variant,
            color: row.vehicle.color,
          }
        : null,
      accessories: (row.accessories as unknown as QuotationAccessory[]) ?? [],
      pricing: {
        exShowroom: Number(row.ex_showroom),
        insurance: Number(row.insurance),
        rto: Number(row.rto),
        accessoriesTotal: Number(row.accessories_total),
        gstAmount: Number(row.gst_amount),
        discount: Number(row.discount),
        totalAmount: Number(row.total_amount),
      },
      finance: {
        downPayment: Number(row.down_payment),
        loanAmount: Number(row.loan_amount),
        interestRate: Number(row.interest_rate),
        tenureMonths: row.tenure_months,
        emi: Number(row.emi),
        totalInterest: Number(row.total_interest),
      },
      executive: row.created_by_profile?.name ?? "Sales team",
      terms: quotationSettings.terms,
      bookingLink: `${window.location.origin}/app/quotations`,
    });
    return { blob, vehicleName };
  };

  const handleDownload = async (row: QuotationWithRelations) => {
    setBusyId(row.id);
    try {
      const { blob } = await buildPdf(row);
      downloadBlob(blob, `${row.quotation_number}.pdf`);
      toast.success("PDF downloaded");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleWhatsApp = async (row: QuotationWithRelations) => {
    if (!row.customer?.phone) {
      toast.error("This customer has no phone number.");
      return;
    }
    setBusyId(row.id);
    try {
      const { vehicleName } = await buildPdf(row);
      const message = buildWhatsAppMessage({
        customerName: row.customer.name,
        quotationNumber: row.quotation_number,
        vehicle: vehicleName,
        onRoadPrice: Number(row.total_amount),
        emi: Number(row.emi),
        tenureMonths: row.tenure_months,
        pdfUrl: row.pdf_url,
        dealershipName: dealership.name,
        validUntil: row.valid_until,
      });
      sendWhatsApp(row.customer.phone, message);
      if (row.status === "draft") statusMutation.mutate({ id: row.id, next: "sent" });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    if (rows.length === 0) return;
    const header = ["Quotation", "Customer", "Vehicle", "Date", "Status", "Amount"];
    const body = rows.map((row) => [
      row.quotation_number,
      row.customer?.name ?? "",
      row.vehicle ? `${row.vehicle.brand} ${row.vehicle.model}` : "",
      new Date(row.created_at).toLocaleDateString("en-IN"),
      row.status,
      String(row.total_amount),
    ]);
    const csv = [header, ...body].map((line) => line.map((c) => `"${c}"`).join(",")).join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv" }), "quotations.csv");
    toast.success("Export ready");
  };

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Quotations"
        description={`${count} quotation${count === 1 ? "" : "s"} found`}
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
                placeholder="Search by quotation number"
                className="pl-9"
              />
            </div>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v as QuotationStatus | "all");
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {QUOTATION_STATUSES.map((s) => (
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
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.quotation_number}</TableCell>
                      <TableCell>{row.customer?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.vehicle ? `${row.vehicle.brand} ${row.vehicle.model}` : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(row.created_at).toLocaleDateString("en-IN")}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusStyles[row.status]} variant="secondary">
                          {statusLabel(row.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {inr(Number(row.total_amount))}
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
                            {QUOTATION_STATUSES.filter((s) => s !== row.status).map((s) => (
                              <DropdownMenuItem
                                key={s}
                                onSelect={() => statusMutation.mutate({ id: row.id, next: s })}
                              >
                                Mark as {statusLabel(s)}
                              </DropdownMenuItem>
                            ))}
                            {isManager && (
                              <DropdownMenuItem
                                className="text-destructive"
                                onSelect={() => deleteMutation.mutate(row.id)}
                              >
                                <Trash2 className="size-4" /> Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                {!listQuery.isLoading && rows.length === 0 && (
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
