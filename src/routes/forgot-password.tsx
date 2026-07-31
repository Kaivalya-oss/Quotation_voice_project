import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Loader2, MailCheck } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const title = "Reset password — VoiceQuote AI";
const description = "Recover access to your VoiceQuote AI account with a secure password reset link.";

export const Route = createFileRoute("/forgot-password")({
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
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  // Placeholder reset flow — connect to your authentication provider here.
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 700);
  };

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="We'll email you a secure link to set a new one."
      footer={
        <>
          Remembered it?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="rounded-2xl border border-success/30 bg-success/10 p-5 text-sm">
          <MailCheck className="size-5 text-success" />
          <p className="mt-3 font-medium">Reset link sent</p>
          <p className="mt-1 text-muted-foreground">
            Check your inbox and follow the link to choose a new password.
          </p>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" type="email" required placeholder="priya@company.com" autoComplete="email" />
          </div>
          <Button type="submit" className="w-full rounded-full" size="lg" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin" />} Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
