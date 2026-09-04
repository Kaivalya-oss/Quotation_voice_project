import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/finance")({
  head: () => ({ meta: [{ title: "Finance/EMI — QuoteSpeak" }] }),
  component: FinancePage,
});

function FinancePage() {
  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Finance & EMI" description="Finance applications and EMI calculations." />
      <Card>
        <CardContent className="p-12 text-center text-muted-foreground">
          Finance module and Loan Approval System will go here.
        </CardContent>
      </Card>
    </div>
  );
}
