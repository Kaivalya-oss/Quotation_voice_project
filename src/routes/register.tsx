import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { APP_ROLES, ROLE_LABEL, signUpSchema, type AppRole } from "@/lib/validators";

const title = "Create account — VoiceQuote AI";
const description =
  "Create your VoiceQuote AI account and start generating quotations with your voice.";

const SELECTABLE_ROLES: AppRole[] = APP_ROLES.filter(
  (role) => role !== "admin" && role !== "dealer_owner",
);

export const Route = createFileRoute("/register")({
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
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<AppRole>("sales_executive");
  const [checkEmail, setCheckEmail] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const parsed = signUpSchema.safeParse({
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      phone: String(formData.get("phone") ?? "") || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check your details.");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          name: parsed.data.name,
          phone: parsed.data.phone ?? null,
          requested_role: role,
        },
      },
    });
    setLoading(false);

    if (error) {
      toast.error(
        error.message.toLowerCase().includes("already registered")
          ? "That email already has an account — sign in instead."
          : error.message,
      );
      return;
    }

    if (!data.session) {
      setCheckEmail(true);
      return;
    }

    toast.success("Workspace ready");
    navigate({ to: "/app", replace: true });
  };

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Set up your account and start quoting by voice."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {checkEmail ? (
        <div className="rounded-2xl border border-success/30 bg-success/10 p-5 text-sm">
          <p className="font-medium">Confirm your email</p>
          <p className="mt-1 text-muted-foreground">
            We sent a confirmation link to your inbox. Click it to activate your account, then sign
            in.
          </p>
          <Button asChild variant="outline" className="mt-4 rounded-full">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" name="name" required placeholder="Priya Nair" autoComplete="name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" placeholder="9820041122" autoComplete="tel" />
            </div>
          </div>
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
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as AppRole)}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SELECTABLE_ROLES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {ROLE_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Manager access is granted by an administrator after sign-up.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" className="w-full rounded-full" size="lg" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />} Create account
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
