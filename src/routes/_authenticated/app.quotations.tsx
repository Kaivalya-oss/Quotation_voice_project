import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Eye, Mic, MoreHorizontal, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { inr, quotations, statusLabels, type QuotationStatus } from "@/lib/mock-data";

export const Route = createFileRoute("/app/quotations")({
  head: () => ({
    meta: [
      { title: "Quotations — VoiceQuote AI" },
      { name: "description", content: "Search, filter and export every quotation your team has created." },
    ],
  }),
  component: QuotationsPage,
});

const PAGE_SIZE = 6;

const statusStyles: Record<QuotationStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-warning/15 text-warning-foreground",
  sent: "bg-primary/10 text-primary",
  approved: "bg-success/15 text-success-foreground",
  rejected: "bg-destructive/10 text-destructive",
};

function QuotationsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () =>
      quotations.filter((q) => {
        const matchesQuery = `${q.id} ${q.customer} ${q.company}`
          .toLowerCase()
          .includes(query.toLowerCase());
        return matchesQuery && (status === "all" || q.status === status);
      }),
    [query, status],
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Quotations"
        description={`${filtered.length} quotations found`}
        actions={
          <Button asChild className="shrink-0 rounded-full">
            <Link to="/app/new-quotation">
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
                placeholder="Search by ID, customer or company"
                className="pl-9"
              />
            </div>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(statusLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => toast.success("Export started (CSV)")}>
              <Download className="size-4" /> Export
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quotation ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium">{q.id}</TableCell>
                    <TableCell>{q.customer}</TableCell>
                    <TableCell className="text-muted-foreground">{q.company}</TableCell>
                    <TableCell className="text-muted-foreground">{q.date}</TableCell>
                    <TableCell>
                      <Badge className={statusStyles[q.status]} variant="secondary">
                        {statusLabels[q.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{inr(q.amount)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${q.id}`}>
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => toast("Opening preview…")}>
                            <Eye className="size-4" /> View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toast.success("PDF downloaded")}>
                            <Download className="size-4" /> Download PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toast.success("Sent on WhatsApp")}>
                            <Send className="size-4" /> Send to WhatsApp
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
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
              Page {current} of {pages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={current === 1}
                onClick={() => setPage(current - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={current === pages}
                onClick={() => setPage(current + 1)}
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
