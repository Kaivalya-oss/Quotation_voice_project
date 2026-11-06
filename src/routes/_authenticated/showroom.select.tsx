import { useRef } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { authQueryKey } from "@/hooks/use-auth";
import { enumLabel } from "@/lib/lead-types";
import {
  MULTI_TENANT,
  TENANT_ROLE_LABEL,
  getMe,
  selectShowroom,
  storeSession,
} from "@/lib/platform";

export const Route = createFileRoute("/_authenticated/showroom/select")({
  head: () => ({ meta: [{ title: "Select showroom — Voice Quote" }] }),
  beforeLoad: () => {
    if (!MULTI_TENANT) throw redirect({ to: "/dashboard" });
  },
  component: SelectShowroomPage,
});

function SelectShowroomPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const meQuery = useQuery({ queryKey: ["platform-me"], queryFn: getMe });
  const inFlight = useRef(false);

  const afterSwitch = async (tokens: Parameters<typeof storeSession>[0]) => {
    storeSession(tokens);
    // Everything cached belongs to the previous showroom.
    queryClient.clear();
    await queryClient.invalidateQueries({ queryKey: authQueryKey });
    navigate({ to: "/dashboard", replace: true });
  };

  const select = useMutation({
    mutationFn: selectShowroom,
    onSuccess: afterSwitch,
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const run = (action: () => void) => {
    if (inFlight.current) return;
    inFlight.current = true;
    action();
  };

  const memberships = meQuery.data?.memberships ?? [];

  return (
    <div className="animate-fade-up space-y-6 max-w-2xl">
      <PageHeader title="Your showrooms" description="Choose which showroom to work in." />

      {meQuery.isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : meQuery.isError ? (
        <Card>
          <CardContent className="p-8 text-center text-destructive">
            {(meQuery.error as Error).message}
          </CardContent>
        </Card>
      ) : memberships.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            You are not a member of any showroom yet. Ask your showroom's Owner for an invitation.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {memberships.map((m) => {
            const active = meQuery.data?.active_tenant_id === m.tenant_id;
            return (
              <Card key={m.tenant_id} className="rounded-xl">
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-semibold">{m.showroom_name}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{TENANT_ROLE_LABEL[m.role]}</Badge>
                      <Badge variant="outline">{enumLabel(m.tenant_status)}</Badge>
                    </div>
                  </div>
                  {active ? (
                    <span className="flex items-center gap-1 text-sm font-medium text-primary">
                      <Check className="size-4" /> Current
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      disabled={select.isPending}
                      onClick={() => run(() => select.mutate(m.tenant_id))}
                    >
                      {select.isPending && select.variables === m.tenant_id && (
                        <Loader2 className="size-4 animate-spin" />
                      )}
                      Switch to this showroom
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
