import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { enumLabel } from "@/lib/lead-types";
import { MULTI_TENANT, getSetupStatus } from "@/lib/platform";

export const Route = createFileRoute("/_authenticated/showroom/setup")({
  head: () => ({ meta: [{ title: "Showroom setup — Voice Quote" }] }),
  beforeLoad: () => {
    if (!MULTI_TENANT) throw redirect({ to: "/dashboard" });
  },
  component: ShowroomSetupPage,
});

function Step({ done, title, detail }: { done: boolean; title: string; detail: string }) {
  return (
    <li className="flex items-start gap-3">
      {done ? (
        <CheckCircle2 className="size-5 shrink-0 text-success" />
      ) : (
        <Circle className="size-5 shrink-0 text-muted-foreground" />
      )}
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
    </li>
  );
}

function ShowroomSetupPage() {
  const query = useQuery({ queryKey: ["setup-status"], queryFn: getSetupStatus });
  const s = query.data;

  return (
    <div className="animate-fade-up space-y-6 max-w-2xl">
      <PageHeader
        title="Showroom setup"
        description={s?.showroom_name ?? "Getting your showroom ready."}
      />
      {query.isLoading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : query.isError || !s ? (
        <Card>
          <CardContent className="p-8 text-center text-destructive">
            {(query.error as Error)?.message}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6 space-y-6">
            <ul className="space-y-4">
              <Step
                done
                title="Showroom registered"
                detail={`Status: ${enumLabel(s.tenant_status)}`}
              />
              <Step
                done={s.operational}
                title="Showroom database connected"
                detail={`Status: ${enumLabel(s.connection_status)}`}
              />
            </ul>
            {s.operational ? (
              <Button asChild>
                <Link to="/dashboard">Go to dashboard</Link>
              </Button>
            ) : s.next_step === "CONNECT_DATABASE" ? (
              <Button asChild>
                <Link to="/showroom/database">Connect your database</Link>
              </Button>
            ) : s.next_step === "CONTACT_SUPPORT" ? (
              <p className="text-sm text-muted-foreground">
                This showroom is suspended. Contact VoiceQuote support.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your showroom Owner needs to connect the database before you can start.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
