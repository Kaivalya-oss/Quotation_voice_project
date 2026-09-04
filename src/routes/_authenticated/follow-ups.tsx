import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/follow-ups")({
  head: () => ({ meta: [{ title: "Follow-ups — QuoteSpeak" }] }),
  component: FollowUpsPage,
});

function FollowUpsPage() {
  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Follow-ups" description="Daily tasks and customer check-ins." />
      <Card>
        <CardContent className="p-12 text-center text-muted-foreground">
          You are all caught up! No pending follow-ups.
        </CardContent>
      </Card>
    </div>
  );
}
