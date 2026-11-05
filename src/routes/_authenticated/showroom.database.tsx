import { useRef, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldAlert } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { enumLabel } from "@/lib/lead-types";
import {
  MULTI_TENANT,
  checkDatabaseHealth,
  clearGateCache,
  connectDatabase,
  getSetupStatus,
  migrateDatabase,
  revokeDatabase,
  rotateDatabaseCredentials,
  testDatabase,
  type DatabaseProvider,
} from "@/lib/platform";

export const Route = createFileRoute("/_authenticated/showroom/database")({
  head: () => ({ meta: [{ title: "Showroom database — Voice Quote" }] }),
  beforeLoad: () => {
    if (!MULTI_TENANT) throw redirect({ to: "/dashboard" });
  },
  component: ShowroomDatabasePage,
});

const PROVIDERS: { value: DatabaseProvider; label: string; hint: string }[] = [
  {
    value: "SUPABASE",
    label: "Supabase",
    hint: "Use the direct connection host from Project Settings → Database.",
  },
  { value: "NEON", label: "Neon", hint: "Use the host from your project's connection details." },
  {
    value: "AWS_RDS",
    label: "AWS RDS",
    hint: "Use the instance endpoint, and paste the RDS CA bundle below.",
  },
  {
    value: "AZURE",
    label: "Azure Database",
    hint: "Use the server name, and paste the Azure CA certificate if required.",
  },
  {
    value: "OTHER",
    label: "Other PostgreSQL",
    hint: "Any PostgreSQL 13+ server reachable over TLS.",
  },
];

const EMPTY_FORM = { host: "", port: "5432", database: "", username: "", password: "", ca: "" };

function ShowroomDatabasePage() {
  const { hasRole } = useAuth();

  if (!hasRole("OWNER")) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-8 text-muted-foreground">
          <ShieldAlert className="size-5" /> Only the showroom Owner can manage the database
          connection.
        </CardContent>
      </Card>
    );
  }
  return <DatabaseSetup />;
}

function DatabaseSetup() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({ queryKey: ["setup-status"], queryFn: getSetupStatus });
  const [provider, setProvider] = useState<DatabaseProvider>("OTHER");
  // Credentials live only in this component's state, and the password is cleared after use.
  const [form, setForm] = useState(EMPTY_FORM);
  const [rotatePassword, setRotatePassword] = useState("");
  const [testPassed, setTestPassed] = useState(false);
  const inFlight = useRef(false);

  const input = () => ({
    provider,
    host: form.host.trim(),
    port: Number(form.port),
    database: form.database.trim(),
    username: form.username.trim(),
    password: form.password,
    ca_certificate: form.ca.trim() || null,
  });

  const refresh = () => {
    clearGateCache();
    queryClient.invalidateQueries({ queryKey: ["setup-status"] });
  };

  const guarded =
    <T,>(action: () => Promise<T>) =>
    async () => {
      if (inFlight.current) throw new Error("Another action is still running.");
      inFlight.current = true;
      try {
        return await action();
      } finally {
        inFlight.current = false;
      }
    };

  const test = useMutation({
    mutationFn: guarded(() => testDatabase(input())),
    onSuccess: () => {
      setTestPassed(true);
      toast.success("Connection verified over TLS");
    },
    onError: (err: Error) => {
      setTestPassed(false);
      toast.error(err.message);
    },
  });
  const connect = useMutation({
    mutationFn: guarded(() => connectDatabase(input())),
    onSuccess: () => {
      setForm(EMPTY_FORM);
      setTestPassed(false);
      toast.success("Database connected");
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: refresh,
  });
  const migrate = useMutation({
    mutationFn: guarded(migrateDatabase),
    onSuccess: () => toast.success("Schema is up to date"),
    onError: (err: Error) => toast.error(err.message),
    onSettled: refresh,
  });
  const health = useMutation({
    mutationFn: guarded(checkDatabaseHealth),
    onSuccess: (r: { healthy: boolean; error_code: string | null }) =>
      r.healthy
        ? toast.success("Database is healthy")
        : toast.error("Health check failed. See the last problem above."),
    onError: (err: Error) => toast.error(err.message),
    onSettled: refresh,
  });
  const rotate = useMutation({
    mutationFn: guarded(() => rotateDatabaseCredentials(rotatePassword)),
    onSuccess: () => {
      setRotatePassword("");
      toast.success("Credentials rotated");
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: refresh,
  });
  const revoke = useMutation({
    mutationFn: guarded(revokeDatabase),
    onSuccess: () => toast.success("Connection revoked. Your data remains in your database."),
    onError: (err: Error) => toast.error(err.message),
    onSettled: refresh,
  });

  const conn = statusQuery.data?.connection;
  const connected = conn?.connection_status === "ACTIVE";
  const busy =
    test.isPending ||
    connect.isPending ||
    migrate.isPending ||
    health.isPending ||
    rotate.isPending ||
    revoke.isPending;
  const hint = PROVIDERS.find((p) => p.value === provider)?.hint;
  const complete =
    form.host && form.database && form.username && form.password && Number(form.port) >= 1024;
  const set =
    (key: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
      setTestPassed(false);
    };

  return (
    <div className="animate-fade-up space-y-6 max-w-3xl">
      <PageHeader
        title="Showroom database"
        description="Your showroom owns this PostgreSQL database and all customer data in it."
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Connection status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusQuery.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : statusQuery.isError ? (
            <p className="text-sm text-destructive">{(statusQuery.error as Error).message}</p>
          ) : (
            <>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <Badge variant={connected ? "default" : "secondary"}>
                      {enumLabel(conn?.connection_status ?? "PENDING")}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Provider</dt>
                  <dd>
                    {conn?.database_provider ? enumLabel(conn.database_provider) : "Not connected"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Schema version</dt>
                  <dd className="font-mono text-xs">{conn?.schema_version ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last health check</dt>
                  <dd>
                    {conn?.last_health_check
                      ? new Date(conn.last_health_check).toLocaleString("en-IN")
                      : "—"}
                  </dd>
                </div>
              </dl>
              {conn?.last_error_message && (
                <p className="text-sm text-destructive">Last problem: {conn.last_error_message}</p>
              )}
              {connected && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => health.mutate()}
                  >
                    {health.isPending && <Loader2 className="size-4 animate-spin" />}
                    Check health
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => migrate.mutate()}
                  >
                    {migrate.isPending && <Loader2 className="size-4 animate-spin" />}
                    Run migrations
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Disconnect VoiceQuote from this database? The showroom stops working until a database is connected again. Your data is not deleted.",
                        )
                      )
                        revoke.mutate();
                    }}
                  >
                    Revoke connection
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {connected && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Rotate password</CardTitle>
            <p className="text-sm text-muted-foreground">
              Change the password on your database first, then enter the new one here.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-2 grow">
              <Label htmlFor="rotate-password">New password</Label>
              <Input
                id="rotate-password"
                type="password"
                autoComplete="off"
                value={rotatePassword}
                onChange={(e) => setRotatePassword(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              disabled={busy || !rotatePassword}
              onClick={() => rotate.mutate()}
            >
              {rotate.isPending && <Loader2 className="size-4 animate-spin" />}
              Rotate
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {connected ? "Replace database" : "Connect your database"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Use an empty database and a restricted user, not a superuser. The password is sent once,
            over TLS, and is never shown again.
          </p>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              connect.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="db-provider">Provider</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as DatabaseProvider)}>
                <SelectTrigger id="db-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
              <div className="space-y-2">
                <Label htmlFor="db-host">Host</Label>
                <Input
                  id="db-host"
                  required
                  placeholder="db.example.com"
                  value={form.host}
                  onChange={set("host")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="db-port">Port</Label>
                <Input
                  id="db-port"
                  required
                  type="number"
                  min={1024}
                  max={65535}
                  value={form.port}
                  onChange={set("port")}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="db-name">Database</Label>
                <Input id="db-name" required value={form.database} onChange={set("database")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="db-user">User</Label>
                <Input
                  id="db-user"
                  required
                  autoComplete="off"
                  value={form.username}
                  onChange={set("username")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="db-password">Password</Label>
                <Input
                  id="db-password"
                  required
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={set("password")}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="db-ca">CA certificate (optional)</Label>
              <Textarea
                id="db-ca"
                rows={3}
                className="font-mono text-xs"
                placeholder="Only needed if your provider's certificate is not publicly trusted"
                value={form.ca}
                onChange={set("ca")}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy || !complete}
                onClick={() => test.mutate()}
              >
                {test.isPending && <Loader2 className="size-4 animate-spin" />}
                Test connection
              </Button>
              <Button type="submit" disabled={busy || !complete}>
                {connect.isPending && <Loader2 className="size-4 animate-spin" />}
                {connect.isPending
                  ? "Setting up the database…"
                  : connected
                    ? "Replace and verify"
                    : "Connect and set up"}
              </Button>
              {testPassed && <span className="text-sm text-success">Connection verified</span>}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
