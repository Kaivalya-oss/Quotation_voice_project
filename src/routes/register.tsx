import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpSchema } from "@/lib/validators";
import { api, ApiError, tokenStorage } from "@/lib/api";
import type { TokenResponse, UserResponse } from "@/lib/auth-types";
import { authQueryKey } from "@/hooks/use-auth";

const title = "Create account — Voice Quote";
const description =
  "Create your Voice Quote account and start generating quotations with your voice.";

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
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

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
    try {
      const response = await api.post<UserResponse | TokenResponse>(
        "/api/v1/auth/register",
        {
          email: parsed.data.email,
          password: parsed.data.password,
          full_name: parsed.data.name,
          phone: parsed.data.phone ?? null,
          // Self-registration always creates a Sales Executive; other roles are assigned by an administrator.
        },
        { skipAuth: true },
      );

      // If backend returns tokens, set session and navigate
      if ("access_token" in response && response.access_token) {
        tokenStorage.setSession(response);
        await queryClient.invalidateQueries({ queryKey: authQueryKey });
        toast.success("Workspace ready");
        navigate({ to: "/dashboard", replace: true });
        return;
      }

      // Backend returns UserResponse on registration (201 Created)
      toast.success("Account created. A manager must approve it before you can sign in.");
      setRegistered(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (
          err.code === "USER_ALREADY_EXISTS" ||
          err.message.toLowerCase().includes("already exists")
        ) {
          toast.error("That email already has an account — sign in instead.");
        } else {
          toast.error(err.message);
        }
      } else {
        toast.error("Failed to create account. Please try again.");
      }
    } finally {
      setLoading(false);
    }
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
      {registered ? (
        <div className="rounded-2xl border border-success/30 bg-success/10 p-5 text-sm">
          <p className="font-medium text-foreground">Account created — awaiting approval</p>
          <p className="mt-1 text-muted-foreground">
            A manager needs to approve your account before you can sign in. You will be able to
            sign in with these credentials once it has been activated.
          </p>
          <Button asChild className="mt-4 rounded-full" size="lg">
            <Link to="/login">Sign in now</Link>
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
          <p className="rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">
            New accounts are created as <strong>Sales Executive</strong>. Finance, inventory and
            manager access is granted by an administrator.
          </p>
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
