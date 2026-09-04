import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Mail, MapPin, Phone, Search, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { customers, inr, quotations } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Customers — VoiceQuote AI" },
      { name: "description", content: "Customer profiles, contact details and full quotation history." },
    ],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(customers[0]!.id);

  const list = useMemo(
    () =>
      customers.filter((c) =>
        `${c.name} ${c.company} ${c.city}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );
  const selected = customers.find((c) => c.id === selectedId) ?? customers[0]!;
  const history = quotations.filter((q) => q.customer === selected.name);

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Customers"
        description="Every customer, contact and quotation in one place."
        actions={
          <Button className="shrink-0 rounded-full">
            <UserPlus className="size-4" /> Add customer
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card className="rounded-2xl">
          <CardContent className="space-y-3 p-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search customers"
                className="pl-9"
              />
            </div>
            <div className="space-y-2">
              {list.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                    c.id === selected.id
                      ? "border-primary/40 bg-primary/5"
                      : "border-border hover:bg-muted/60",
                  )}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {c.name.charAt(0)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.company}</span>
                  </span>
                  <Badge variant="secondary" className="shrink-0">
                    {c.quotations}
                  </Badge>
                </button>
              ))}
              {list.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">No customers found.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">{selected.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { icon: Building2, value: selected.company },
                  { icon: Phone, value: selected.phone },
                  { icon: Mail, value: selected.email },
                  { icon: MapPin, value: selected.city },
                ].map(({ icon: Icon, value }) => (
                  <div key={value} className="flex min-w-0 items-center gap-3 rounded-xl border border-border p-3">
                    <Icon className="size-4 shrink-0 text-primary" />
                    <span className="truncate text-sm">{value}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/50 p-4">
                  <p className="text-xs text-muted-foreground">Quotations</p>
                  <p className="font-display text-xl font-semibold">{selected.quotations}</p>
                </div>
                <div className="rounded-xl bg-muted/50 p-4">
                  <p className="text-xs text-muted-foreground">Lifetime value</p>
                  <p className="font-display text-xl font-semibold">{inr(selected.totalValue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Previous quotations</CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No quotations recorded yet for this customer.
                </p>
              ) : (
                <Accordion type="single" collapsible>
                  {history.map((q) => (
                    <AccordionItem key={q.id} value={q.id}>
                      <AccordionTrigger className="text-sm">
                        <span className="flex w-full items-center justify-between gap-3 pr-3">
                          <span className="truncate">
                            {q.id} · {q.date}
                          </span>
                          <span className="font-semibold">{inr(q.amount)}</span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground">
                        {q.items} line items · status {q.status} · prepared by {q.executive}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
