import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/hooks/use-theme";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — VoiceQuote AI" },
      { name: "description", content: "Company, GST, template, WhatsApp and AI configuration." },
    ],
  }),
  component: SettingsPage,
});

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof Input>) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  );
}

function SettingsPage() {
  const { dark, toggle } = useTheme();

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Settings"
        description="Configure your company profile, integrations and preferences."
        actions={
          <Button className="shrink-0 rounded-full" onClick={() => toast.success("Settings saved")}>
            Save changes
          </Button>
        }
      />

      <Tabs defaultValue="company">
        <TabsList className="flex-wrap">
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="template">Template</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="mt-4">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Company & GST details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name" defaultValue="VoiceQuote AI Pvt. Ltd." />
              <Field label="GSTIN" defaultValue="27AABCV1234F1Z5" />
              <Field label="Registered address" defaultValue="Andheri East, Mumbai 400069" />
              <Field label="Default GST rate" defaultValue="18%" />
              <Field label="Support email" type="email" defaultValue="sales@voicequote.ai" />
              <Field label="Support phone" defaultValue="+91 22 4000 1200" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="template" className="mt-4">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Quotation template</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Quotation prefix" defaultValue="QT-" />
                <div className="space-y-2">
                  <Label htmlFor="validity">Default validity</Label>
                  <Select defaultValue="15">
                    <SelectTrigger id="validity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="15">15 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="terms">Terms & conditions</Label>
                <Textarea
                  id="terms"
                  rows={4}
                  defaultValue="Prices are exclusive of freight. Payment within 30 days of invoice. Delivery subject to stock availability."
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="mt-4 space-y-4">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">WhatsApp Business API</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Business phone number" defaultValue="+91 90000 12345" />
              <Field label="Template name" defaultValue="quotation_delivery_v2" />
              <Field label="API endpoint" placeholder="https://graph.facebook.com/v20.0/…" />
              <Field label="Access token" type="password" placeholder="Connect later" />
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">AI & speech settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="lang">Recognition language</Label>
                  <Select defaultValue="en-IN">
                    <SelectTrigger id="lang">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en-IN">English (India)</SelectItem>
                      <SelectItem value="hi-IN">Hindi</SelectItem>
                      <SelectItem value="mr-IN">Marathi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Field label="Extraction confidence threshold" defaultValue="0.75" />
              </div>
              <Separator />
              {[
                ["Auto-confirm high confidence fields", true],
                ["Ask before sending on WhatsApp", true],
                ["Store raw voice recordings", false],
              ].map(([label, checked]) => (
                <div key={label as string} className="flex items-center justify-between gap-4">
                  <span className="text-sm">{label as string}</span>
                  <Switch defaultChecked={checked as boolean} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="mt-4">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Notifications & appearance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                "Email me when a quotation is approved",
                "Push alerts for pending approvals",
                "Weekly performance digest",
              ].map((label) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <span className="text-sm">{label}</span>
                  <Switch defaultChecked />
                </div>
              ))}
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm">Dark mode</span>
                <Switch checked={dark} onCheckedChange={toggle} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
