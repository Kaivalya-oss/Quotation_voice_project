import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const title = "Create account — VoiceQuote AI";
const description = "Create your VoiceQuote AI account and start generating quotations with your voice.";

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

  // Placeholder registration — connect to your authentication provider here.
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast.success("Workspace created");
      navigate({ to: "/app" });
    }, 800);
  };

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Set up your company and invite your sales team."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" required placeholder="Priya Nair" autoComplete="name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company">Company</Label>
            <Input id="company" required placeholder="Aster Industries" autoComplete="organization" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" required placeholder="priya@company.com" autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <Select defaultValue="executive">
            <SelectTrigger id="role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="executive">Sales Executive</SelectItem>
              <SelectItem value="admin">Administrator</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" required placeholder="At least 8 characters" autoComplete="new-password" />
        </div>
        <Button type="submit" className="w-full rounded-full" size="lg" disabled={loading}>
          {loading && <Loader2 className="size-4 animate-spin" />} Create account
        </Button>
      </form>
    </AuthShell>
  );
}
