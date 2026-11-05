import { useRef, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, ShieldAlert, UserPlus, UserX } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { enumLabel } from "@/lib/lead-types";
import {
  MULTI_TENANT,
  TENANT_ROLES,
  TENANT_ROLE_LABEL,
  deactivateMember,
  inviteMember,
  listMembers,
  updateMemberRole,
  type TenantRole,
} from "@/lib/platform";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [{ title: "Team — Voice Quote" }] }),
  beforeLoad: () => {
    if (!MULTI_TENANT) throw redirect({ to: "/dashboard" });
  },
  component: TeamPage,
});

function TeamPage() {
  const { user, hasRole, isManager } = useAuth();
  const isOwner = hasRole("OWNER");
  const queryClient = useQueryClient();
  const membersQuery = useQuery({ queryKey: ["team"], queryFn: listMembers, enabled: isManager });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TenantRole>("SALESPERSON");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const busy = useRef(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["team"] });

  const invite = useMutation({
    mutationFn: () => inviteMember(email.trim(), role),
    onSuccess: (res) => {
      // In the fragment, so the token does not reach server logs. Shown once; only a hash is stored.
      setInviteLink(`${window.location.origin}/showroom/invite#token=${res.invitation_token}`);
      setEmail("");
      toast.success("Invitation created");
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => {
      busy.current = false;
      refresh();
    },
  });
  const changeRole = useMutation({
    mutationFn: (v: { id: string; role: TenantRole }) => updateMemberRole(v.id, v.role),
    onSuccess: () => toast.success("Role updated"),
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => {
      busy.current = false;
      refresh();
    },
  });
  const deactivate = useMutation({
    mutationFn: deactivateMember,
    onSuccess: () => toast.success("Member deactivated"),
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => {
      busy.current = false;
      refresh();
    },
  });
  const run = (action: () => void) => {
    if (busy.current) return;
    busy.current = true;
    action();
  };

  if (!isManager) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-8 text-muted-foreground">
          <ShieldAlert className="size-5" /> Only Owners and Heads of Sales can view the team.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="animate-fade-up space-y-6 max-w-3xl">
      <PageHeader title="Team" description="Who can use this showroom, and in what role." />

      {isOwner && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Invite an employee</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => invite.mutate());
              }}
            >
              <div className="space-y-2 grow">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as TenantRole)}>
                  <SelectTrigger id="invite-role" className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TENANT_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {TENANT_ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="gap-2" disabled={invite.isPending}>
                {invite.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <UserPlus className="size-4" />
                )}
                Create invitation
              </Button>
            </form>
            {inviteLink && (
              <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="text-sm font-medium">
                  Send this link to them yourself. It works once and cannot be shown again.
                </p>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={inviteLink}
                    aria-label="Invitation link"
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1"
                    onClick={async () => {
                      await navigator.clipboard.writeText(inviteLink);
                      toast.success("Link copied");
                    }}
                  >
                    <Copy className="size-4" /> Copy
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {membersQuery.isLoading ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : membersQuery.isError ? (
        <Card>
          <CardContent className="p-8 text-center text-destructive">
            {(membersQuery.error as Error).message}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(membersQuery.data ?? []).map((m) => {
            const deactivated = m.status === "DEACTIVATED";
            return (
              <Card key={m.membership_id} className="rounded-xl">
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-semibold">
                      {m.full_name ?? m.email}
                      {m.email === user?.email && (
                        <span className="font-normal text-muted-foreground"> (you)</span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">{m.email}</p>
                    <Badge variant={m.status === "ACTIVE" ? "secondary" : "outline"}>
                      {enumLabel(m.status)}
                    </Badge>
                  </div>
                  {isOwner && !deactivated ? (
                    <div className="flex items-center gap-2">
                      <Select
                        value={m.role}
                        onValueChange={(v) =>
                          run(() =>
                            changeRole.mutate({ id: m.membership_id, role: v as TenantRole }),
                          )
                        }
                      >
                        <SelectTrigger className="w-40" aria-label={`Role of ${m.email}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TENANT_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {TENANT_ROLE_LABEL[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Deactivate ${m.email}`}
                        disabled={deactivate.isPending}
                        onClick={() => {
                          if (window.confirm(`Remove ${m.email} from this showroom?`))
                            run(() => deactivate.mutate(m.membership_id));
                        }}
                      >
                        <UserX className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <Badge variant="outline">{TENANT_ROLE_LABEL[m.role]}</Badge>
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
