import { useRef, useState } from "react";
import { Link, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authQueryKey } from "@/hooks/use-auth";
import { ApiError, tokenStorage } from "@/lib/api";
import { MULTI_TENANT, acceptInvitation, storeSession } from "@/lib/platform";

export const Route = createFileRoute("/showroom/invite")({
  head: () => ({ meta: [{ title: "Accept invitation — Voice Quote" }] }),
  ssr: false,
  beforeLoad: () => {
    if (!MULTI_TENANT) throw redirect({ to: "/login" });
  },
  component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // In the URL fragment, which browsers do not send to servers or put in Referer headers.
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "",
  );
  const signedIn = Boolean(tokenStorage.getAccessToken());
  const [loading, setLoading] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const inFlight = useRef(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    const data = new FormData(event.currentTarget);
    inFlight.current = true;
    setLoading(true);
    try {
      const tokens = await acceptInvitation(
        signedIn
          ? { token }
          : {
              token,
              full_name: String(data.get("full_name") ?? "").trim(),
              password: String(data.get("password") ?? ""),
            },
      );
      storeSession(tokens);
      await queryClient.invalidateQueries({ queryKey: authQueryKey });
      toast.success(`Welcome to ${tokens.active_tenant?.showroom_name ?? "the showroom"}`);
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setNeedsSignIn(true);
      toast.error(err instanceof ApiError ? err.message : "Could not accept this invitation.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthShell
        title="Invitation link incomplete"
        subtitle="Ask your showroom Owner for a new invitation link."
        footer={null}
      >
        <Link to="/login" className="text-sm font-medium text-primary hover:underline">
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Join your showroom"
      subtitle={
        signedIn
          ? "Accept this invitation with your current account."
          : "Create your account to join."
      }
      footer={null}
    >
      {needsSignIn ? (
        <p className="text-sm text-muted-foreground">
          This invitation belongs to an existing account.{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>{" "}
          with that account, then open this link again.
        </p>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          {!signedIn && (
            <>
              <div className="space-y-2">
                <Label htmlFor="full_name">Your name</Label>
                <Input
                  id="full_name"
                  name="full_name"
                  required
                  minLength={2}
                  maxLength={150}
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Choose a password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                />
              </div>
            </>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            Accept invitation
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
