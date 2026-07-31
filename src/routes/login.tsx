import { useEffect, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { signInSchema } from "@/lib/validators";

const title = "Sign in — VoiceQuote AI";
const description =
  "Sign in to your VoiceQuote AI workspace to create and manage voice-generated quotations.";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const parsed = signInSchema.safeParse({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check your details.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);

    if (error) {
      toast.error(
        error.message.toLowerCase().includes("invalid")
          ? "Incorrect email or password."
          : error.message,
      );
      return;
    }

    await queryClient.invalidateQueries();
    toast.success("Welcome back");
    navigate({ to: "/app", replace: true });
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your sales workspace."
      footer={
        <>
          New to VoiceQuote AI?{" "}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            placeholder="priya@company.com"
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox id="remember" defaultChecked /> Remember me
          </label>
          <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full rounded-full" size="lg" disabled={loading}>
          {loading && <Loader2 className="size-4 animate-spin" />} Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
