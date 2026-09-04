import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FileText,
  IndianRupee,
  Mic,
  Send,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { inr, monthlyQuotations, quotations, recentActivity } from "@/lib/mock-data";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — VoiceQuote AI" },
      { name: "description", content: "Track today's quotations, pipeline value and sales performance." },
    ],
  }),
  component: Dashboard,
});

const stats = [
  { label: "Today's Quotations", value: "12", icon: FileText, trend: "+3 vs yesterday" },
  { label: "Pending Quotations", value: "7", icon: Clock, trend: "2 awaiting approval" },
  { label: "Sent Quotations", value: "134", icon: Send, trend: "This month" },
  { label: "Total Revenue", value: inr(10620000), icon: IndianRupee, trend: "Closed this quarter" },
  { label: "Monthly Growth", value: "+19.4%", icon: TrendingUp, trend: "vs June" },
];

const tooltipStyle = {
  background: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: "0.75rem",
  fontSize: "12px",
  color: "var(--color-popover-foreground)",
};

function Dashboard() {
  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Good morning, Priya"
        description="Here's what's happening across your quotation pipeline today."
        actions={
          <Button asChild className="rounded-full shrink-0">
            <Link to="/quotations/new">
              <Mic className="size-4" /> New Quotation
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map(({ label, value, icon: Icon, trend }) => (
          <Card key={label} className="hover-lift rounded-2xl">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-muted-foreground">{label}</p>
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
              </div>
              <p className="mt-3 font-display text-2xl font-semibold">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{trend}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Quotations & revenue</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyQuotations} margin={{ left: -18, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="qGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-muted-foreground)" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-muted-foreground)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="quotations"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2.5}
                  fill="url(#qGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentActivity.map((a) => (
              <div key={a.id} className="flex gap-3">
                <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-accent/15 text-accent-foreground">
                  <CheckCircle2 className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm leading-snug">{a.text}</p>
                  <p className="text-xs text-muted-foreground">{a.time}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Revenue (₹ lakh)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyQuotations} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-muted-foreground)" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-muted-foreground)" />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-muted)" }} />
                <Bar dataKey="revenue" radius={[8, 8, 0, 0]} fill="var(--color-chart-2)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Latest quotations</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/quotations">
                View all <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {quotations.slice(0, 5).map((q) => (
              <div
                key={q.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border/70 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {q.id} · {q.company}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {q.customer} · {q.items} items
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge variant="secondary" className="capitalize">
                    {q.status}
                  </Badge>
                  <span className="text-sm font-semibold">{inr(q.amount)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
