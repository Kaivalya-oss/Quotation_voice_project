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
import { ApiError } from "@/lib/api";
import { MULTI_TENANT, registerShowroom, storeSession } from "@/lib/platform";

export const Route = createFileRoute("/showroom/register")({
  head: () => ({ meta: [{ title: "Register showroom — Voice Quote" }] }),
  beforeLoad: () => {
    if (!MULTI_TENANT) throw redirect({ to: "/register" });
  },
  component: RegisterShowroomPage,
});

function RegisterShowroomPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    const data = new FormData(event.currentTarget);
    inFlight.current = true;
    setLoading(true);
    try {
      const tokens = await registerShowroom({
        showroom_name: String(data.get("showroom_name") ?? "").trim(),
        full_name: String(data.get("full_name") ?? "").trim(),
        email: String(data.get("email") ?? "").trim(),
        password: String(data.get("password") ?? ""),
      });
      storeSession(tokens);
      await queryClient.invalidateQueries({ queryKey: authQueryKey });
      toast.success("Showroom registered");
      navigate({ to: "/showroom/setup", replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not register the showroom.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Register your showroom"
      subtitle="Your showroom connects its own database next. Your data stays yours."
      footer={
        <>
          Already registered?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-2">
          <Label htmlFor="showroom_name">Showroom name</Label>
          <Input id="showroom_name" name="showroom_name" required minLength={2} maxLength={150} />
        </div>
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
          <Label htmlFor="email">Work email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
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
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="size-4 animate-spin" />}
          Register showroom
        </Button>
      </form>
    </AuthShell>
  );
}
