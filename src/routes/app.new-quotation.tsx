import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  Download,
  FileText,
  Loader2,
  Mic,
  Save,
  Send,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { inr } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/new-quotation")({
  head: () => ({
    meta: [
      { title: "New Quotation — VoiceQuote AI" },
      { name: "description", content: "Record your voice and let AI build a complete quotation." },
    ],
  }),
  component: NewQuotation,
});

const DEMO_TRANSCRIPT =
  "Create a quotation for Rahul Mehta from Aster Industries, phone nine eight two zero zero four one one two two. He needs twelve industrial pump X2 units at forty two thousand rupees each, five percent discount, eighteen percent GST, delivery in three weeks, payment thirty days credit.";

const AI_STEPS = [
  "Listening…",
  "Transcribing…",
  "Extracting Details…",
  "Generating Quotation…",
  "Creating PDF…",
  "Sending WhatsApp…",
  "Saving to Database…",
];

interface Extracted {
  customer: string;
  company: string;
  phone: string;
  product: string;
  quantity: string;
  price: string;
  discount: string;
  gst: string;
  delivery: string;
  notes: string;
}

const EMPTY: Extracted = {
  customer: "",
  company: "",
  phone: "",
  product: "",
  quantity: "",
  price: "",
  discount: "",
  gst: "",
  delivery: "",
  notes: "",
};

const EXTRACTED: Extracted = {
  customer: "Rahul Mehta",
  company: "Aster Industries",
  phone: "+91 98200 41122",
  product: "Industrial Pump X2",
  quantity: "12",
  price: "42000",
  discount: "5",
  gst: "18",
  delivery: "3 weeks",
  notes: "Payment terms: 30 days credit. Installation support included.",
};

const FIELDS: { key: keyof Extracted; label: string }[] = [
  { key: "customer", label: "Customer Name" },
  { key: "company", label: "Company Name" },
  { key: "phone", label: "Phone Number" },
  { key: "product", label: "Product Name" },
  { key: "quantity", label: "Quantity" },
  { key: "price", label: "Unit Price (₹)" },
  { key: "discount", label: "Discount (%)" },
  { key: "gst", label: "GST (%)" },
  { key: "delivery", label: "Delivery Time" },
];

function Waveform({ active }: { active: boolean }) {
  return (
    <div className="flex h-14 items-center justify-center gap-1.5" aria-hidden>
      {Array.from({ length: 28 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "w-1.5 rounded-full bg-primary/70",
            active ? "h-12 animate-wave" : "h-2 opacity-40",
          )}
          style={active ? { animationDelay: `${(i % 9) * 80}ms` } : undefined}
        />
      ))}
    </div>
  );
}

function NewQuotation() {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [step, setStep] = useState(-1);
  const [data, setData] = useState<Extracted>(EMPTY);
  const [extracting, setExtracting] = useState(false);
  const [preview, setPreview] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Placeholder: replace with a Speech-to-Text integration (Web Speech API / provider).
  const startRecording = () => {
    setRecording(true);
    setStep(0);
    setTranscript("");
    setData(EMPTY);
    const words = DEMO_TRANSCRIPT.split(" ");
    words.forEach((w, i) => {
      timers.current.push(
        setTimeout(() => setTranscript((t) => (t ? `${t} ${w}` : w)), i * 110),
      );
    });
    timers.current.push(setTimeout(() => stopRecording(), words.length * 110 + 400));
  };

  // Placeholder: replace with an AI extraction call.
  const stopRecording = () => {
    setRecording(false);
    setStep(1);
    setExtracting(true);
    timers.current.push(setTimeout(() => setStep(2), 700));
    timers.current.push(
      setTimeout(() => {
        setData(EXTRACTED);
        setExtracting(false);
        setStep(3);
        toast.success("Details extracted from your voice note");
      }, 1600),
    );
  };

  const qty = Number(data.quantity) || 0;
  const price = Number(data.price) || 0;
  const subtotal = qty * price;
  const discountValue = (subtotal * (Number(data.discount) || 0)) / 100;
  const taxable = subtotal - discountValue;
  const gstValue = (taxable * (Number(data.gst) || 0)) / 100;
  const total = taxable + gstValue;

  const update = (key: keyof Extracted, value: string) =>
    setData((d) => ({ ...d, [key]: value }));

  const runStep = (index: number, message: string) => {
    setStep(index);
    timers.current.push(setTimeout(() => toast.success(message), 900));
  };

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="New Quotation"
        description="Speak naturally — AI captures every detail and builds the quotation."
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-6 p-8">
            <div className="relative grid place-items-center">
              {recording && (
                <span className="absolute size-28 rounded-full bg-primary/30 animate-pulse-ring" />
              )}
              <button
                onClick={recording ? stopRecording : startRecording}
                aria-label={recording ? "Stop recording" : "Start recording"}
                className={cn(
                  "relative grid size-28 place-items-center rounded-full text-primary-foreground shadow-glow transition-transform hover:scale-105",
                  recording ? "bg-destructive" : "bg-primary",
                )}
              >
                {recording ? <Square className="size-9" /> : <Mic className="size-10" />}
              </button>
            </div>
            <p className="text-sm font-medium">
              {recording ? "Listening… tap to stop" : "Tap the microphone and describe the quotation"}
            </p>
            <Waveform active={recording} />
            <div className="w-full">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Live transcription
              </Label>
              <div className="mt-2 min-h-28 rounded-2xl border border-border bg-muted/40 p-4 text-sm leading-relaxed">
                {transcript || (
                  <span className="text-muted-foreground">
                    Your speech will appear here in real time…
                  </span>
                )}
                {recording && <span className="ml-0.5 animate-pulse">▍</span>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">AI assistant</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {AI_STEPS.map((label, i) => {
              const done = step > i;
              const active = step === i;
              return (
                <div key={label} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full border text-xs",
                      done && "border-success bg-success/15 text-success",
                      active && "border-primary bg-primary/10 text-primary",
                      !done && !active && "border-border text-muted-foreground",
                    )}
                  >
                    {done ? (
                      <Check className="size-3.5" />
                    ) : active ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-sm",
                      active ? "font-medium text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">AI extracted information</CardTitle>
          <Badge variant="secondary">Editable</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {extracting ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-2">
                  <Label htmlFor={f.key}>{f.label}</Label>
                  <Input
                    id={f.key}
                    value={data[f.key]}
                    onChange={(e) => update(f.key, e.target.value)}
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={3}
              value={data.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Additional terms, payment conditions…"
            />
          </div>

          <div className="grid gap-2 rounded-2xl border border-border bg-muted/40 p-5 text-sm sm:max-w-sm">
            {[
              ["Subtotal", subtotal],
              ["Discount", -discountValue],
              ["GST", gstValue],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between text-muted-foreground">
                <span>{label as string}</span>
                <span>{inr(value as number)}</span>
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t border-border pt-2 text-base font-semibold">
              <span>Total</span>
              <span>{inr(total)}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button className="rounded-full" onClick={() => { runStep(4, "PDF generated"); setPreview(true); }}>
              <FileText className="size-4" /> Generate PDF
            </Button>
            <Button variant="outline" className="rounded-full" onClick={() => toast.success("PDF downloaded")}>
              <Download className="size-4" /> Download PDF
            </Button>
            <Button variant="outline" className="rounded-full" onClick={() => runStep(5, "Sent to WhatsApp")}>
              <Send className="size-4" /> Send to WhatsApp
            </Button>
            <Button variant="secondary" className="rounded-full" onClick={() => runStep(6, "Saved to database")}>
              <Save className="size-4" /> Save to Database
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Quotation preview</DialogTitle>
          </DialogHeader>
          <div className="rounded-2xl border border-border bg-card p-6 text-sm">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div>
                <p className="font-display text-lg font-semibold">VoiceQuote AI Pvt. Ltd.</p>
                <p className="text-xs text-muted-foreground">GSTIN 27AABCV1234F1Z5 · Mumbai</p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">QT-2042</p>
                <p>31 Jul 2026</p>
              </div>
            </div>
            <div className="grid gap-1 py-4">
              <p className="font-medium">{data.customer || "Customer name"}</p>
              <p className="text-muted-foreground">{data.company || "Company"}</p>
              <p className="text-muted-foreground">{data.phone || "Phone"}</p>
            </div>
            <table className="w-full border-t border-border text-left">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Item</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Rate</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="py-2">{data.product || "Product"}</td>
                  <td className="py-2 text-right">{qty}</td>
                  <td className="py-2 text-right">{inr(price)}</td>
                  <td className="py-2 text-right">{inr(subtotal)}</td>
                </tr>
              </tbody>
            </table>
            <div className="mt-4 flex justify-between border-t border-border pt-3 font-semibold">
              <span>Total payable</span>
              <span>{inr(total)}</span>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Delivery: {data.delivery || "—"} · {data.notes || "—"}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
