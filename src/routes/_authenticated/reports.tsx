import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { downloadBlob } from "@/lib/pdf";
import { downloadDailyExport } from "@/services/repository";
import { inr, monthlyQuotations, topExecutives, topProducts } from "@/lib/mock-data";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Analytics — Voice Quote" },
      { name: "description", content: "Sales growth, revenue, top products and conversion analytics." },
    ],
  }),
  component: AnalyticsPage,
});

const tooltipStyle = {
  background: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: "0.75rem",
  fontSize: "12px",
  color: "var(--color-popover-foreground)",
};

const pieColors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function AnalyticsPage() {
  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Analytics" description="Performance across quotations, revenue and teams." />

      <DailyUpdateCard />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Monthly quotations</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyQuotations} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-muted-foreground)" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-muted-foreground)" />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-muted)" }} />
                <Bar dataKey="quotations" radius={[8, 8, 0, 0]} fill="var(--color-chart-1)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Sales growth & revenue (₹ crore)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyQuotations} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-muted-foreground)" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-muted-foreground)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="revenue" stroke="var(--color-chart-2)" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="conversion" stroke="var(--color-chart-3)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Top products</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={topProducts} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>
                  {topProducts.map((_, i) => (
                    <Cell key={i} fill={pieColors[i % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Top sales executives</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {topExecutives.map((e) => (
              <div key={e.name} className="space-y-2">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-sm">
                  <span className="truncate font-medium">{e.name}</span>
                  <span className="shrink-0 text-muted-foreground">{inr(e.revenue)}</span>
                </div>
                <Progress value={e.conversion} />
                <p className="text-xs text-muted-foreground">
                  {e.quotations} quotations · {e.conversion}% conversion rate
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Today's date in Indian time as YYYY-MM-DD (the backend's day boundary). */
function todayIst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function DailyUpdateCard() {
  const { canSell, isManager } = useAuth();
  const [day, setDay] = useState(todayIst);
  const [busy, setBusy] = useState<"xlsx" | "csv" | null>(null);
  const inFlight = useRef(false);

  // The export is for management (everyone's records) and salespeople (their own)
  if (!canSell) return null;

  const download = async (format: "xlsx" | "csv") => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(format);
    try {
      const blob = await downloadDailyExport(format, day);
      downloadBlob(blob, `daily-update-${day}.${format}`);
    } catch (err) {
      toast.error((err as Error).message || "Download failed");
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const isToday = day === todayIst();

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{isToday ? "Today's update" : "Daily update"}</CardTitle>
        <p className="text-sm text-muted-foreground">
          New customers, lead stage changes, quotations, follow-ups and test rides for the day
          {isManager ? " — for all staff." : " — your own records."}
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="export-day">Day</Label>
          <Input
            id="export-day"
            type="date"
            value={day}
            max={todayIst()}
            onChange={(e) => setDay(e.target.value || todayIst())}
            className="w-44"
          />
        </div>
        <Button className="gap-2" disabled={busy !== null} onClick={() => download("xlsx")}>
          {busy === "xlsx" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="size-4" />
          )}
          Download Excel
        </Button>
        <Button
          variant="outline"
          className="gap-2"
          disabled={busy !== null}
          onClick={() => download("csv")}
        >
          {busy === "csv" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
          Download CSV
        </Button>
      </CardContent>
    </Card>
  );
}
