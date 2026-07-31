import { createFileRoute } from "@tanstack/react-router";
import { Check, Download, Package, ShieldCheck, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inr, quotations } from "@/lib/mock-data";

export const Route = createFileRoute("/_authenticated/app/admin")({
  head: () => ({
    meta: [
      { title: "Admin Panel — VoiceQuote AI" },
      { name: "description", content: "Manage users, roles, products, approvals and audit logs." },
    ],
  }),
  component: AdminPage,
});

const users = [
  { name: "Priya Nair", email: "priya@voicequote.ai", role: "admin", status: "Active" },
  { name: "Arjun Rao", email: "arjun@voicequote.ai", role: "executive", status: "Active" },
  { name: "Kabir Shah", email: "kabir@voicequote.ai", role: "executive", status: "Active" },
  { name: "Divya Menon", email: "divya@voicequote.ai", role: "viewer", status: "Invited" },
];

const products = [
  { sku: "IPX2", name: "Industrial Pump X2", price: 42000, gst: "18%" },
  { sku: "SF-40", name: "Steel Fittings (set of 40)", price: 8600, gst: "18%" },
  { sku: "CPP", name: "Control Panel Pro", price: 96500, gst: "18%" },
  { sku: "CB40", name: "Conveyor Belt 40m", price: 154000, gst: "12%" },
];

const logs = [
  { time: "08:41", actor: "Arjun Rao", action: "Generated QT-2040 from voice input" },
  { time: "08:12", actor: "System", action: "WhatsApp delivery confirmed for QT-2041" },
  { time: "07:55", actor: "Priya Nair", action: "Approved QT-2039 (₹4,12,000)" },
  { time: "Yesterday", actor: "Kabir Shah", action: "Updated GST rate for CB40 to 12%" },
];

function AdminPage() {
  const pending = quotations.filter((q) => q.status === "pending");

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Admin Panel"
        description="Governance for users, products, approvals and audit history."
        actions={
          <Badge variant="secondary" className="shrink-0 gap-1">
            <ShieldCheck className="size-3.5" /> Admin
          </Badge>
        }
      />

      <Tabs defaultValue="users">
        <TabsList className="flex-wrap">
          <TabsTrigger value="users">Users & roles</TabsTrigger>
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="logs">Logs & reports</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <Card className="rounded-2xl">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Team members</CardTitle>
              <Button size="sm" className="rounded-full" onClick={() => toast.success("Invite sent")}>
                <UserPlus className="size-4" /> Invite
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.email}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Select defaultValue={u.role}>
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Administrator</SelectItem>
                            <SelectItem value="executive">Sales Executive</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{u.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approvals" className="mt-4">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Quotations awaiting approval</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pending.map((q) => (
                <div
                  key={q.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {q.id} · {q.company}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {q.customer} · {inr(q.amount)} · by {q.executive}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" onClick={() => toast.success(`${q.id} approved`)}>
                      <Check className="size-4" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => toast(`${q.id} rejected`)}>
                      <X className="size-4" /> Reject
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="mt-4">
          <Card className="rounded-2xl">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Product catalogue</CardTitle>
              <Button size="sm" variant="outline" className="rounded-full">
                <Package className="size-4" /> Add product
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => (
                    <TableRow key={p.sku}>
                      <TableCell className="font-medium">{p.sku}</TableCell>
                      <TableCell>{p.name}</TableCell>
                      <TableCell className="text-right">{inr(p.price)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{p.gst}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card className="rounded-2xl">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Activity log</CardTitle>
              <Button size="sm" variant="outline" onClick={() => toast.success("Report exported")}>
                <Download className="size-4" /> Export report
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {logs.map((l) => (
                <div key={l.action} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-xl border border-border p-3">
                  <span className="shrink-0 text-xs text-muted-foreground">{l.time}</span>
                  <span className="min-w-0 text-sm">
                    <span className="font-medium">{l.actor}</span> — {l.action}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
