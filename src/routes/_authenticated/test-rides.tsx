import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/test-rides")({
  head: () => ({ meta: [{ title: "Test Rides — QuoteSpeak" }] }),
  component: TestRidesPage,
});

function TestRidesPage() {
  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Test Rides" description="Scheduled and completed test rides." />
      <Card>
        <CardContent className="p-12 text-center text-muted-foreground">
          No test rides scheduled today.
        </CardContent>
      </Card>
    </div>
  );
}
