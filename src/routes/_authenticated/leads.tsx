import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Leads — QuoteSpeak" }] }),
  component: LeadsPage,
});

function LeadsPage() {
  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Leads" description="Manage your prospective buyers." />
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        {['New', 'Contacted', 'Interested', 'Won'].map((stage) => (
          <Card key={stage} className="bg-muted/50 shadow-none border-dashed">
            <div className="p-4 border-b font-medium bg-muted/50 rounded-t-xl">{stage}</div>
            <CardContent className="p-4 min-h-[300px]">
              <div className="text-sm text-muted-foreground text-center mt-8">No leads</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
