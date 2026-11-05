import { useRef, useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { authQueryKey } from "@/hooks/use-auth";
import { enumLabel } from "@/lib/lead-types";
import {
  MULTI_TENANT,
  TENANT_ROLE_LABEL,
  createShowroom,
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
  const [name, setName] = useState("");
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
  const create = useMutation({
    mutationFn: createShowroom,
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
            You are not a member of any showroom yet. Ask an Owner for an invitation, or register
            one below.
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Register another showroom</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => create.mutate(name.trim()));
            }}
          >
            <div className="space-y-2 grow">
              <Label htmlFor="new-showroom">Showroom name</Label>
              <Input
                id="new-showroom"
                required
                minLength={2}
                maxLength={150}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" disabled={create.isPending}>
              {create.isPending && <Loader2 className="size-4 animate-spin" />}
              Register
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
