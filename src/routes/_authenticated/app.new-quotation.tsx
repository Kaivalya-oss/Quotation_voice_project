import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  Download,
  FileText,
  Loader2,
  Mic,
  Save,
  Send,
  Sparkles,
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
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { extractCustomerData } from "@/lib/ai.functions";
import {
  calculateEmi,
  calculateQuotation,
  inr,
  minimumDownPayment,
  onRoadPrice,
  recommendVehicles,
  validateLoan,
} from "@/lib/finance";
import { buildQuotationPdf, downloadBlob, uploadQuotationPdf } from "@/lib/pdf";
import { buildWhatsAppMessage, sendWhatsApp } from "@/lib/whatsapp";
import { speechToText, startRecording, type Recorder } from "@/lib/speech";
import { useSettings } from "@/hooks/use-settings";
import { useAuth } from "@/hooks/use-auth";
import {
  adjustStock,
  createLead,
  createQuotation,
  listAccessories,
  listVehicles,
  logAudit,
  pushNotification,
  updateQuotation,
  upsertCustomer,
  type QuotationAccessory,
  type QuotationWithRelations,
} from "@/services/repository";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/new-quotation")({
  head: () => ({
    meta: [
      { title: "New Quotation — VoiceQuote AI" },
      {
        name: "description",
        content: "Record your voice and let AI build a complete two-wheeler quotation.",
      },
    ],
  }),
  component: NewQuotation,
});

const AI_STEPS = [
  "Listening…",
  "Transcribing…",
  "Extracting Details…",
  "Generating Quotation…",
  "Creating PDF…",
  "Sending WhatsApp…",
  "Saving to Database…",
];

interface FormState {
  customerName: string;
  phone: string;
  city: string;
  occupation: string;
  monthlyIncome: string;
  budget: string;
  vehicleId: string;
  downPayment: string;
  interestRate: string;
  tenureMonths: number;
  discount: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  customerName: "",
  phone: "",
  city: "",
  occupation: "",
  monthlyIncome: "",
  budget: "",
  vehicleId: "",
  downPayment: "",
  interestRate: "",
  tenureMonths: 36,
  discount: "",
  notes: "",
};

function Waveform({ active, level }: { active: boolean; level: number }) {
  return (
    <div className="flex h-14 items-center justify-center gap-1.5" aria-hidden>
      {Array.from({ length: 28 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "w-1.5 rounded-full bg-primary/70 transition-[height] duration-100",
            active ? "animate-wave" : "h-2 opacity-40",
          )}
          style={
            active
              ? {
                  height: `${8 + level * 40 * (0.5 + ((i * 37) % 100) / 100)}px`,
                  animationDelay: `${(i % 9) * 80}ms`,
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}

function NewQuotation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { dealership, finance, quotation: quotationSettings } = useSettings();
  const { profile } = useAuth();
  const extract = useServerFn(extractCustomerData);

  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [step, setStep] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [selectedAccessories, setSelectedAccessories] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const [saved, setSaved] = useState<QuotationWithRelations | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const recorder = useRef<Recorder | null>(null);
  const levelTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const vehiclesQuery = useQuery({ queryKey: ["vehicles"], queryFn: () => listVehicles() });
  const accessoriesQuery = useQuery({ queryKey: ["accessories"], queryFn: listAccessories });

  const vehicles = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data]);
  const accessories = useMemo(() => accessoriesQuery.data ?? [], [accessoriesQuery.data]);

  useEffect(() => {
    setForm((f) =>
      f.interestRate
        ? f
        : {
            ...f,
            interestRate: String(finance.default_interest_rate),
            tenureMonths: finance.default_tenure_months,
          },
    );
  }, [finance.default_interest_rate, finance.default_tenure_months]);

  useEffect(
    () => () => {
      recorder.current?.cancel();
      if (levelTimer.current) clearInterval(levelTimer.current);
    },
    [],
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /* ---------------- Voice pipeline ---------------- */

  const beginRecording = async () => {
    try {
      setTranscript("");
      setStep(0);
      recorder.current = await startRecording();
      setRecording(true);
      levelTimer.current = setInterval(() => setLevel(recorder.current?.getLevel() ?? 0), 100);
    } catch {
      setStep(-1);
      toast.error("Microphone access is needed to record a quotation.");
    }
  };

  const finishRecording = async () => {
    const active = recorder.current;
    if (!active) return;
    recorder.current = null;
    setRecording(false);
    if (levelTimer.current) clearInterval(levelTimer.current);
    setLevel(0);

    try {
      setBusy(true);
      setStep(1);
      const audio = await active.stop();
      const text = await speechToText(audio);
      if (!text.trim()) throw new Error("Nothing was picked up — please record again.");
      setTranscript(text);

      setStep(2);
      const data = await extract({ data: { transcript: text } });
      applyExtraction(data);
      setStep(3);
      toast.success("Details extracted from your voice note");
    } catch (error) {
      setStep(-1);
      toast.error(error instanceof Error ? error.message : "Voice processing failed.");
    } finally {
      setBusy(false);
    }
  };

  const applyExtraction = (data: Awaited<ReturnType<typeof extractCustomerData>>) => {
    const match = data.model
      ? vehicles.find(
          (v) =>
            `${v.brand} ${v.model}`.toLowerCase().includes(data.model!.toLowerCase()) ||
            v.model.toLowerCase().includes(data.model!.toLowerCase()),
        )
      : undefined;

    setForm((f) => ({
      ...f,
      customerName: data.customerName ?? f.customerName,
      phone: data.phone ?? f.phone,
      city: data.city ?? f.city,
      occupation: data.occupation ?? f.occupation,
      monthlyIncome: data.monthlyIncome ? String(data.monthlyIncome) : f.monthlyIncome,
      budget: data.budget ? String(data.budget) : f.budget,
      vehicleId: match?.id ?? f.vehicleId,
      downPayment: data.downPayment ? String(data.downPayment) : f.downPayment,
      tenureMonths: data.loanTenureMonths ?? f.tenureMonths,
      notes: data.notes ?? f.notes,
    }));

    if (data.accessories.length && accessories.length) {
      const ids = accessories
        .filter((a) => data.accessories.some((name) => a.name.toLowerCase().includes(name.toLowerCase().split(" ")[0] ?? "")))
        .map((a) => a.id);
      if (ids.length) setSelectedAccessories(ids);
    }
  };

  /* ---------------- Live pricing ---------------- */

  const vehicle = vehicles.find((v) => v.id === form.vehicleId) ?? null;
  const chosenAccessories: QuotationAccessory[] = accessories
    .filter((a) => selectedAccessories.includes(a.id))
    .map((a) => ({ id: a.id, name: a.name, price: Number(a.price), quantity: 1 }));
  const accessoriesTotal = chosenAccessories.reduce((sum, a) => sum + a.price * a.quantity, 0);

  const pricing = calculateQuotation({
    exShowroom: Number(vehicle?.ex_showroom_price ?? 0),
    insurance: Number(vehicle?.insurance ?? 0),
    rto: Number(vehicle?.rto ?? 0),
    accessoriesTotal,
    discount: Number(form.discount) || 0,
    gstRate: finance.gst_rate,
  });

  const downPayment = Number(form.downPayment) || 0;
  const interestRate = Number(form.interestRate) || finance.default_interest_rate;
  const emi = calculateEmi({
    vehiclePrice: pricing.totalAmount,
    downPayment,
    interestRate,
    tenureMonths: form.tenureMonths,
  });

  const loanWarnings = vehicle
    ? validateLoan({
        onRoadPrice: pricing.totalAmount,
        downPayment,
        emi: emi.emi,
        monthlyIncome: Number(form.monthlyIncome) || 0,
        tenureMonths: form.tenureMonths,
        interestRate,
      })
    : [];

  const recommendations = useMemo(
    () =>
      recommendVehicles(vehicles, {
        budget: Number(form.budget) || null,
        downPayment: downPayment || null,
        monthlyIncome: Number(form.monthlyIncome) || null,
        tenureMonths: form.tenureMonths,
        interestRate,
      }),
    [vehicles, form.budget, downPayment, form.monthlyIncome, form.tenureMonths, interestRate],
  );

  const validUntil = new Date(
    Date.now() + quotationSettings.validity_days * 24 * 60 * 60 * 1000,
  ).toISOString();

  /* ---------------- Persistence ---------------- */

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.customerName.trim()) throw new Error("Customer name is required.");
      if (!/^[6-9]\d{9}$/.test(form.phone.trim()))
        throw new Error("Enter a valid 10-digit mobile number.");
      if (!vehicle) throw new Error("Select a vehicle before saving.");

      setStep(6);
      const customer = await upsertCustomer({
        name: form.customerName.trim(),
        phone: form.phone.trim(),
        city: form.city.trim() || null,
        occupation: form.occupation.trim() || null,
        monthly_income: Number(form.monthlyIncome) || null,
      });
      if (!customer) throw new Error("Could not save the customer record.");

      const record = await createQuotation({
        customer_id: customer.id,
        vehicle_id: vehicle.id,
        accessories: chosenAccessories as unknown as never,
        ex_showroom: pricing.exShowroom,
        accessories_total: pricing.accessoriesTotal,
        insurance: pricing.insurance,
        rto: pricing.rto,
        discount: pricing.discount,
        gst_rate: pricing.gstRate,
        gst_amount: pricing.gstAmount,
        subtotal: pricing.subtotal,
        total_amount: pricing.totalAmount,
        down_payment: downPayment,
        loan_amount: emi.loanAmount,
        interest_rate: interestRate,
        tenure_months: form.tenureMonths,
        emi: emi.emi,
        total_interest: emi.totalInterest,
        notes: form.notes || null,
        transcript: transcript || null,
        status: "draft",
        valid_until: validUntil.slice(0, 10),
      });

      await createLead({
        customer_id: customer.id,
        quotation_id: record.id,
        stage: "new",
        source: "voice_quotation",
        expected_value: pricing.totalAmount,
        assigned_to: profile?.id ?? null,
      });

      await logAudit("quotation.created", "quotations", record.id, {
        total: pricing.totalAmount,
      });
      await pushNotification({
        title: `Quotation ${record.quotation_number} created`,
        body: `${customer.name} · ${vehicle.brand} ${vehicle.model} · ${inr(pricing.totalAmount)}`,
      });

      return record;
    },
    onSuccess: (record) => {
      setSaved(record);
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(`Saved as ${record.quotation_number}`);
    },
    onError: (error: Error) => {
      setStep(3);
      toast.error(error.message);
    },
  });

  const buildPdf = async (record?: QuotationWithRelations | null) => {
    if (!vehicle) throw new Error("Select a vehicle first.");
    const number = record?.quotation_number ?? "QT-DRAFT";
    return buildQuotationPdf({
      quotationNumber: number,
      createdAt: record?.created_at ?? new Date().toISOString(),
      validUntil,
      dealership,
      customer: {
        name: form.customerName || "Customer",
        phone: form.phone,
        city: form.city || null,
      },
      vehicle: {
        brand: vehicle.brand,
        model: vehicle.model,
        variant: vehicle.variant,
        color: vehicle.color,
      },
      accessories: chosenAccessories,
      pricing: {
        exShowroom: pricing.exShowroom,
        insurance: pricing.insurance,
        rto: pricing.rto,
        accessoriesTotal: pricing.accessoriesTotal,
        gstAmount: pricing.gstAmount,
        discount: pricing.discount,
        totalAmount: pricing.totalAmount,
      },
      finance: {
        downPayment,
        loanAmount: emi.loanAmount,
        interestRate,
        tenureMonths: form.tenureMonths,
        emi: emi.emi,
        totalInterest: emi.totalInterest,
      },
      executive: profile?.name ?? "Sales team",
      terms: quotationSettings.terms,
      bookingLink: `${window.location.origin}/app/quotations`,
    });
  };

  const pdfMutation = useMutation({
    mutationFn: async (mode: "download" | "store") => {
      setStep(4);
      const record = saved ?? (await saveMutation.mutateAsync());
      const blob = await buildPdf(record);
      if (mode === "download") {
        downloadBlob(blob, `${record.quotation_number}.pdf`);
        return null;
      }
      const { url } = await uploadQuotationPdf(record.quotation_number, blob);
      await updateQuotation(record.id, { pdf_url: url });
      setPdfUrl(url);
      return url;
    },
    onSuccess: (url) => toast.success(url ? "PDF generated and stored" : "PDF downloaded"),
    onError: (error: Error) => toast.error(error.message),
  });

  const whatsappMutation = useMutation({
    mutationFn: async () => {
      const record = saved ?? (await saveMutation.mutateAsync());
      setStep(5);
      let link = pdfUrl ?? record.pdf_url;
      if (!link) {
        const blob = await buildPdf(record);
        const uploaded = await uploadQuotationPdf(record.quotation_number, blob);
        await updateQuotation(record.id, { pdf_url: uploaded.url });
        link = uploaded.url;
        setPdfUrl(uploaded.url);
      }
      const message = buildWhatsAppMessage({
        customerName: form.customerName,
        quotationNumber: record.quotation_number,
        vehicle: vehicle ? `${vehicle.brand} ${vehicle.model} ${vehicle.variant}` : "Vehicle",
        onRoadPrice: pricing.totalAmount,
        emi: emi.emi,
        tenureMonths: form.tenureMonths,
        pdfUrl: link,
        dealershipName: dealership.name,
        validUntil,
      });
      sendWhatsApp(form.phone, message);
      await updateQuotation(record.id, { status: "sent" });
      if (vehicle) await adjustStock(vehicle.id, 0);
      await logAudit("quotation.sent", "quotations", record.id, { channel: "whatsapp" });
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
    },
    onSuccess: () => toast.success("WhatsApp message ready to send"),
    onError: (error: Error) => toast.error(error.message),
  });

  const processing =
    busy || saveMutation.isPending || pdfMutation.isPending || whatsappMutation.isPending;

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="New Quotation"
        description="Speak naturally — AI captures every detail and builds the quotation."
        actions={
          saved ? (
            <Button
              variant="outline"
              className="rounded-full shrink-0"
              onClick={() => navigate({ to: "/app/quotations" })}
            >
              View all quotations
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-6 p-8">
            <div className="relative grid place-items-center">
              {recording && (
                <span className="absolute size-28 rounded-full bg-primary/30 animate-pulse-ring" />
              )}
              <button
                onClick={recording ? finishRecording : beginRecording}
                disabled={busy}
                aria-label={recording ? "Stop recording" : "Start recording"}
                className={cn(
                  "relative grid size-28 place-items-center rounded-full text-primary-foreground shadow-glow transition-transform hover:scale-105 disabled:opacity-70",
                  recording ? "bg-destructive" : "bg-primary",
                )}
              >
                {busy ? (
                  <Loader2 className="size-9 animate-spin" />
                ) : recording ? (
                  <Square className="size-9" />
                ) : (
                  <Mic className="size-10" />
                )}
              </button>
            </div>
            <p className="text-sm font-medium">
              {recording
                ? "Listening… tap to stop"
                : busy
                  ? "Processing your recording…"
                  : "Tap the microphone and describe the quotation"}
            </p>
            <Waveform active={recording} level={level} />
            <div className="w-full">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Transcription
              </Label>
              <Textarea
                rows={4}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Your speech will appear here — you can also type or paste a note…"
                className="mt-2 rounded-2xl bg-muted/40"
              />
              <Button
                variant="outline"
                size="sm"
                className="mt-3 rounded-full"
                disabled={!transcript.trim() || busy}
                onClick={async () => {
                  try {
                    setBusy(true);
                    setStep(2);
                    applyExtraction(await extract({ data: { transcript } }));
                    setStep(3);
                    toast.success("Details extracted");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Extraction failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Sparkles className="size-4" /> Re-run AI extraction
              </Button>
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
        <CardContent className="space-y-5">
          {busy && step === 2 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Customer Name" value={form.customerName} onChange={(v) => set("customerName", v)} />
              <Field label="Phone Number" value={form.phone} onChange={(v) => set("phone", v)} />
              <Field label="City" value={form.city} onChange={(v) => set("city", v)} />
              <Field label="Occupation" value={form.occupation} onChange={(v) => set("occupation", v)} />
              <Field label="Monthly Income (₹)" value={form.monthlyIncome} onChange={(v) => set("monthlyIncome", v)} />
              <Field label="Budget (₹)" value={form.budget} onChange={(v) => set("budget", v)} />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Vehicle</Label>
              <Select value={form.vehicleId} onValueChange={(v) => set("vehicleId", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.brand} {v.model} · {v.variant} ({inr(Number(v.ex_showroom_price))})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field label="Down Payment (₹)" value={form.downPayment} onChange={(v) => set("downPayment", v)} />
            <Field label="Interest Rate (% p.a.)" value={form.interestRate} onChange={(v) => set("interestRate", v)} />
            <Field label="Discount (₹)" value={form.discount} onChange={(v) => set("discount", v)} />
            <div className="space-y-2 sm:col-span-2">
              <Label>Loan tenure — {form.tenureMonths} months</Label>
              <Slider
                min={6}
                max={60}
                step={6}
                value={[form.tenureMonths]}
                onValueChange={([v]) => set("tenureMonths", v ?? 36)}
                className="pt-3"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Accessories</Label>
            <div className="flex flex-wrap gap-2">
              {accessories.map((a) => {
                const checked = selectedAccessories.includes(a.id);
                return (
                  <label
                    key={a.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                      checked ? "border-primary bg-primary/10 text-primary" : "border-border",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) =>
                        setSelectedAccessories((list) =>
                          next ? [...list, a.id] : list.filter((id) => id !== a.id),
                        )
                      }
                    />
                    {a.name} · {inr(Number(a.price))}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Additional terms, payment conditions…"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-2 rounded-2xl border border-border bg-muted/40 p-5 text-sm">
              {[
                ["Ex-showroom", pricing.exShowroom],
                ["Insurance", pricing.insurance],
                ["RTO & registration", pricing.rto],
                ["Accessories", pricing.accessoriesTotal],
                ["GST on accessories", pricing.gstAmount],
                ["Discount", -pricing.discount],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between text-muted-foreground">
                  <span>{label as string}</span>
                  <span>{inr(value as number)}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-border pt-2 text-base font-semibold">
                <span>On-road price</span>
                <span>{inr(pricing.totalAmount)}</span>
              </div>
            </div>

            <div className="grid gap-2 rounded-2xl border border-border bg-primary/5 p-5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Loan amount</span>
                <span>{inr(emi.loanAmount)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Total interest</span>
                <span>{inr(emi.totalInterest)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Minimum down payment</span>
                <span>
                  {inr(minimumDownPayment(pricing.totalAmount, finance.min_down_payment_percent))}
                </span>
              </div>
              <div className="mt-1 flex justify-between border-t border-border pt-2 text-base font-semibold">
                <span>Monthly EMI</span>
                <span>{inr(emi.emi)}</span>
              </div>
              {loanWarnings.map((warning) => (
                <p key={warning} className="text-xs text-destructive">
                  {warning}
                </p>
              ))}
            </div>
          </div>

          {recommendations.length > 0 && (
            <div className="space-y-3">
              <Label>AI recommended vehicles</Label>
              <div className="grid gap-3 md:grid-cols-3">
                {recommendations.map(({ vehicle: v, score, emi: monthly, reasons }) => (
                  <button
                    key={v.id}
                    onClick={() => set("vehicleId", v.id)}
                    className={cn(
                      "rounded-2xl border p-4 text-left transition-colors hover:border-primary",
                      form.vehicleId === v.id ? "border-primary bg-primary/5" : "border-border",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">
                        {v.brand} {v.model}
                      </p>
                      <Badge variant="secondary">{Math.round(score)}%</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {inr(onRoadPrice(v))} on-road · EMI {inr(monthly)}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">{reasons[0]}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              className="rounded-full"
              disabled={processing}
              onClick={() => {
                if (!vehicle) {
                  toast.error("Select a vehicle first.");
                  return;
                }
                setPreview(true);
              }}
            >
              <FileText className="size-4" /> Preview quotation
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={processing}
              onClick={() => pdfMutation.mutate("download")}
            >
              <Download className="size-4" /> Download PDF
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={processing}
              onClick={() => whatsappMutation.mutate()}
            >
              <Send className="size-4" /> Send to WhatsApp
            </Button>
            <Button
              variant="secondary"
              className="rounded-full"
              disabled={processing || !!saved}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {saved ? `Saved ${saved.quotation_number}` : "Save to Database"}
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
                <p className="font-display text-lg font-semibold">{dealership.name}</p>
                <p className="text-xs text-muted-foreground">
                  {dealership.gstin ? `GSTIN ${dealership.gstin} · ` : ""}
                  {dealership.address}
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">
                  {saved?.quotation_number ?? "Draft"}
                </p>
                <p>{new Date().toLocaleDateString("en-IN")}</p>
              </div>
            </div>
            <div className="grid gap-1 py-4">
              <p className="font-medium">{form.customerName || "Customer name"}</p>
              <p className="text-muted-foreground">{form.phone || "Phone"}</p>
              <p className="text-muted-foreground">{form.city}</p>
            </div>
            <table className="w-full border-t border-border text-left">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Item</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="py-2">
                    {vehicle ? `${vehicle.brand} ${vehicle.model} ${vehicle.variant}` : "Vehicle"}
                  </td>
                  <td className="py-2 text-right">{inr(pricing.exShowroom)}</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="py-2">Insurance + RTO</td>
                  <td className="py-2 text-right">{inr(pricing.insurance + pricing.rto)}</td>
                </tr>
                {chosenAccessories.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="py-2">{a.name}</td>
                    <td className="py-2 text-right">{inr(a.price * a.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex justify-between border-t border-border pt-3 font-semibold">
              <span>Total on-road</span>
              <span>{inr(pricing.totalAmount)}</span>
            </div>
            <p className="mt-2 flex justify-between text-muted-foreground">
              <span>EMI ({form.tenureMonths} months @ {interestRate}%)</span>
              <span>{inr(emi.emi)}/month</span>
            </p>
            <p className="mt-4 text-xs text-muted-foreground">{quotationSettings.terms}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              className="rounded-full"
              disabled={processing}
              onClick={() => pdfMutation.mutate("download")}
            >
              <Download className="size-4" /> Download PDF
            </Button>
            <Button
              className="rounded-full"
              disabled={processing}
              onClick={() => pdfMutation.mutate("store")}
            >
              <FileText className="size-4" /> Generate & store PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="—" />
    </div>
  );
}
