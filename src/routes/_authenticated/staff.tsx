import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldAlert, UserCheck, UserX } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import type { UserResponse } from "@/lib/auth-types";
import { enumLabel } from "@/lib/lead-types";
import { activateUser, changeUserRole, deactivateUser, listUsers } from "@/services/repository";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({ meta: [{ title: "Staff — QuoteSpeak" }] }),
  component: StaffPage,
});

const ROLES = ["SALES_EXECUTIVE", "FINANCE_EXECUTIVE", "INVENTORY_MANAGER", "DEALER_OWNER", "ADMIN"] as const;

type Filter = "pending" | "active" | "all";

function StaffPage() {
  const { user, isManager, hasRole } = useAuth();
  const isAdmin = hasRole("ADMIN");
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("pending");
  const busy = useRef(new Set<number>());

  const usersQuery = useQuery({
    queryKey: ["users", filter],
    queryFn: () => listUsers({ isActive: filter === "all" ? undefined : filter === "active" }),
    enabled: isManager,
  });

  const action = useMutation({
    mutationFn: async (v: { id: number; kind: "activate" | "deactivate" | "role"; role?: string }) => {
      if (v.kind === "activate") return activateUser(v.id);
      if (v.kind === "deactivate") return deactivateUser(v.id);
      return changeUserRole(v.id, v.role!);
    },
    onSuccess: (u, v) => {
      toast.success(
        v.kind === "activate"
          ? `${u.full_name} can now sign in`
          : v.kind === "deactivate"
            ? `${u.full_name} has been deactivated`
            : `${u.full_name} is now ${enumLabel(u.role.name)}`,
      );
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: (_d, _e, v) => {
      busy.current.delete(v.id);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const run = (v: { id: number; kind: "activate" | "deactivate" | "role"; role?: string }) => {
    if (busy.current.has(v.id)) return;
    busy.current.add(v.id);
    action.mutate(v);
  };

  if (!isManager) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-8 text-muted-foreground">
          <ShieldAlert className="size-5" /> Only managers can manage staff accounts.
        </CardContent>
      </Card>
    );
  }

  const users = usersQuery.data?.items ?? [];

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Staff"
        description="Approve new sign-ups and manage who can access the sales workspace."
      />
      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="pending">Pending / inactive</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {usersQuery.isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : usersQuery.isError ? (
        <Card>
          <CardContent className="p-8 text-center text-destructive">
            {(usersQuery.error as Error).message}
          </CardContent>
        </Card>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            {filter === "pending" ? "No accounts are waiting for approval." : "No accounts."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <StaffRow
              key={u.id}
              u={u}
              isSelf={u.id === user?.id}
              isAdmin={isAdmin}
              pending={action.isPending && action.variables?.id === u.id}
              onAction={run}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StaffRow({
  u,
  isSelf,
  isAdmin,
  pending,
  onAction,
}: {
  u: UserResponse;
  isSelf: boolean;
  isAdmin: boolean;
  pending: boolean;
  onAction: (v: { id: number; kind: "activate" | "deactivate" | "role"; role?: string }) => void;
}) {
  const neverSignedIn = !u.last_login_at;
  return (
    <Card className="rounded-xl">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="space-y-1">
          <p className="font-semibold">
            {u.full_name} {isSelf && <span className="text-sm font-normal text-muted-foreground">(you)</span>}
          </p>
          <p className="text-sm text-muted-foreground">
            {u.email}
            {u.phone ? ` · ${u.phone}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{enumLabel(u.role.name)}</Badge>
            {u.is_active ? (
              <Badge className="bg-success/15 text-success" variant="secondary">
                Active
              </Badge>
            ) : (
              <Badge className="bg-amber-500/15 text-amber-700" variant="secondary">
                {neverSignedIn ? "Awaiting approval" : "Deactivated"}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              Joined {new Date(u.created_at).toLocaleDateString("en-IN")}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && !isSelf && (
            <Select value={u.role.name} onValueChange={(role) => onAction({ id: u.id, kind: "role", role })}>
              <SelectTrigger className="w-48" aria-label={`Role for ${u.full_name}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {enumLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!isSelf &&
            (u.is_active ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-destructive"
                disabled={pending}
                onClick={() => onAction({ id: u.id, kind: "deactivate" })}
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <UserX className="size-4" />}
                Deactivate
              </Button>
            ) : (
              <Button size="sm" className="gap-1" disabled={pending} onClick={() => onAction({ id: u.id, kind: "activate" })}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />}
                {neverSignedIn ? "Approve" : "Re-activate"}
              </Button>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
