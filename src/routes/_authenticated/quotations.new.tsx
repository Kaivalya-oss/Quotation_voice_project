import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mic,
  Plus,
  Send,
  Trash2,
  TriangleAlert,
  UserCheck,
} from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LeadActionsPanel } from "@/components/leads/LeadActionsPanel";
import { ApiError } from "@/lib/api";
import { inr } from "@/lib/finance";
import { downloadBlob } from "@/lib/pdf";
import {
  createCustomer,
  createLead,
  getLead,
  createQuotation,
  downloadQuotationPdf,
  findCustomerByPhone,
  listApplicableOffers,
  listLeads,
  listVehicleAccessories,
  listVehicleBrands,
  listVehicleModels,
  listVehicles,
  normalizePhone,
  sendQuotationWhatsApp,
} from "@/services/repository";
import type { CustomerResponse } from "@/lib/customer-types";
import type { VariantResponse } from "@/lib/vehicle-types";
import {
  MAX_INTEREST_RATE,
  isRealWhatsAppDelivery,
  type QuotationItemCreate,
  type QuotationResponse,
  type WhatsAppDispatchResponse,
} from "@/lib/quotation-types";
import {
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  enumLabel,
  type LeadPriority,
  type LeadResponse,
  type LeadSource,
} from "@/lib/lead-types";

export const Route = createFileRoute("/_authenticated/quotations/new")({
  head: () => ({ meta: [{ title: "New Quotation — Voice Quote" }] }),
  component: NewQuotationPage,
});

const STEPS = ["Customer", "Vehicle interest", "Quotation", "Review"] as const;

/** Leads in these stages are closed; a new enquiry should open a fresh lead */
const CLOSED_LEAD_STATUSES = new Set(["PURCHASED", "LOST"]);

interface CustomerForm {
  full_name: string;
  phone: string;
  address: string;
  city: string;
  email: string;
}

interface CustomItemDraft {
  item_name: string;
  unit_price: string;
  quantity: string;
}

interface IntakeResult {
  quotation: QuotationResponse;
  customer: CustomerResponse;
  customerCreated: boolean;
  /** Null when the customer's open lead for this vehicle belongs to another salesperson. */
  lead: LeadResponse | null;
  leadCreated: boolean;
  /** Set when the open lead exists but is handled by someone else. */
  leadOwnedElsewhere?: boolean;
}

const num = (v: string | number | null | undefined) => Number(v ?? 0) || 0;

/** Minimal Web Speech API surface used for voice capture (not in TS DOM lib) */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  start: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function NewQuotationPage() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<IntakeResult | null>(null);

  // ---- Step 1: customer ----
  const [form, setForm] = useState<CustomerForm>({
    full_name: "",
    phone: "",
    address: "",
    city: "",
    email: "",
  });
  const [existingCustomer, setExistingCustomer] = useState<CustomerResponse | null>(null);
  const [isListening, setIsListening] = useState(false);

  // Debounce the phone so we only hit the backend once the salesperson stops typing
  const normalizedPhone = normalizePhone(form.phone);
  const [debouncedPhone, setDebouncedPhone] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedPhone(normalizedPhone), 350);
    return () => clearTimeout(t);
  }, [normalizedPhone]);

  const phoneLookup = useQuery({
    queryKey: ["customer-by-phone", debouncedPhone],
    queryFn: () => findCustomerByPhone(debouncedPhone),
    enabled: debouncedPhone.length === 10 && !existingCustomer,
  });
  const phoneMatch = !existingCustomer ? (phoneLookup.data ?? null) : null;

  // ---- Step 2: vehicle interest + lead context ----
  const [brandId, setBrandId] = useState<number | null>(null);
  const [modelId, setModelId] = useState<number | null>(null);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [source, setSource] = useState<LeadSource>("WALK_IN");
  const [priority, setPriority] = useState<LeadPriority>("MEDIUM");

  const brandsQuery = useQuery({ queryKey: ["catalog-brands"], queryFn: listVehicleBrands });
  const modelsQuery = useQuery({
    queryKey: ["catalog-models", brandId],
    queryFn: () => listVehicleModels(brandId ?? undefined),
    enabled: brandId !== null,
  });
  const variantsQuery = useQuery({
    queryKey: ["catalog-variants", modelId],
    queryFn: () => listVehicles({ modelId: modelId ?? undefined, status: "ACTIVE", pageSize: 100 }),
    enabled: modelId !== null,
  });
  const variants = variantsQuery.data?.items ?? [];
  const selectedVariant: VariantResponse | null = variants.find((v) => v.id === variantId) ?? null;
  const selectedBrand = brandsQuery.data?.find((b) => b.id === brandId) ?? null;
  const selectedModel = modelsQuery.data?.find((m) => m.id === modelId) ?? null;

  // ---- Step 3: quotation options ----
  const [accessoryIds, setAccessoryIds] = useState<number[]>([]);
  const [customItems, setCustomItems] = useState<CustomItemDraft[]>([]);
  const [offerId, setOfferId] = useState<number | null>(null);
  const [downPayment, setDownPayment] = useState("0");
  const [loanTenure, setLoanTenure] = useState(36);
  const [interestRate, setInterestRate] = useState("9.5");
  const [notes, setNotes] = useState("");

  const accessoriesQuery = useQuery({
    queryKey: ["catalog-accessories"],
    queryFn: listVehicleAccessories,
  });
  const offersQuery = useQuery({
    queryKey: ["applicable-offers", brandId, modelId, variantId],
    queryFn: () =>
      listApplicableOffers({
        brandId: brandId ?? undefined,
        modelId: modelId ?? undefined,
        variantId: variantId ?? undefined,
      }),
    enabled: variantId !== null,
  });
  const accessories = (accessoriesQuery.data ?? []).filter((a) => a.is_active);
  const offers = offersQuery.data ?? [];
  const selectedOffer = offers.find((o) => o.id === offerId) ?? null;

  // Drop an offer that no longer applies after the vehicle changes
  useEffect(() => {
    if (offerId !== null && offersQuery.data && !offersQuery.data.some((o) => o.id === offerId)) {
      setOfferId(null);
    }
  }, [offersQuery.data, offerId]);

  const validCustomItems: QuotationItemCreate[] = customItems
    .filter((c) => c.item_name.trim() && num(c.unit_price) > 0)
    .map((c) => ({
      item_name: c.item_name.trim(),
      item_type: "CUSTOM",
      unit_price: num(c.unit_price),
      quantity: Math.max(1, Math.floor(num(c.quantity)) || 1),
    }));

  // ---- Voice input (fills the customer form; salesperson still verifies) ----
  const handleVoiceInput = () => {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const SpeechRecognition = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition is not supported in this browser. Please type manually.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      toast.error("Voice input error");
      setIsListening(false);
    };
    recognition.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript ?? "";
      const phoneMatchRe = text.match(/(?:\+91|91)?[-\s]?(\d[\d\s]{8,}\d)/);
      const phone = phoneMatchRe?.[1]?.replace(/\s/g, "") ?? "";
      let name = text;
      let city = "";
      if (phoneMatchRe?.index !== undefined) {
        name = text.substring(0, phoneMatchRe.index);
        city = text
          .substring(phoneMatchRe.index + phoneMatchRe[0].length)
          .replace(/\b(from|in|at)\b/gi, "")
          .trim();
      }
      name = name.replace(/(my )?name is/gi, "").trim();
      setForm((f) => ({
        ...f,
        full_name: name || f.full_name,
        phone: phone || f.phone,
        city: city || f.city,
      }));
      toast.success("Voice input captured. Please verify the details.");
    };
    recognition.start();
  };

  // ---- Step validation ----
  const validateStep = (s: number): string | null => {
    if (s === 0) {
      if (existingCustomer) return null;
      if (normalizedPhone.length !== 10) return "Enter a valid 10-digit phone number.";
      if (phoneLookup.isFetching || debouncedPhone !== normalizedPhone)
        return "Checking for an existing customer…";
      if (phoneMatch)
        return "A customer with this phone already exists. Use the existing customer or change the number.";
      if (form.full_name.trim().length < 2) return "Customer name is required.";
      if (!form.address.trim()) return "Address is required.";
      if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim()))
        return "Email address looks invalid.";
    }
    if (s === 1 && !selectedVariant)
      return "Select the brand, model and variant the customer wants.";
    if (s === 2) {
      if (num(downPayment) < 0) return "Down payment cannot be negative.";
      if (num(interestRate) < 0) return "Interest rate cannot be negative.";
      if (num(interestRate) > MAX_INTEREST_RATE)
        return `Interest rate cannot exceed ${MAX_INTEREST_RATE}% p.a.`;
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep(step);
    if (err) {
      toast.error(err);
      return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  // ---- Double-submit protection ----
  // A ref (not state) so a second click in the same tick is rejected before React re-renders.
  const submitInFlight = useRef(false);
  // One key per intake attempt, reused for every retry so the backend can return the original
  // quotation instead of creating a duplicate. A new key is issued when the request changes.
  const intakeKey = useRef<string | null>(null);
  // Customer created by an earlier (failed) attempt of this same intake.
  const createdCustomerId = useRef<number | null>(null);
  const requestFingerprint = JSON.stringify([
    existingCustomer?.id ?? normalizedPhone,
    variantId,
    accessoryIds,
    customItems,
    offerId,
    downPayment,
    loanTenure,
    interestRate,
    notes,
  ]);
  useEffect(() => {
    intakeKey.current = null;
  }, [requestFingerprint]);

  // ---- Submit: customer → lead → quotation, all persisted by the backend ----
  const submitMutation = useMutation({
    mutationFn: async (): Promise<IntakeResult> => {
      if (!selectedVariant) throw new Error("Vehicle variant is required.");

      // 1. Customer: reuse the detected one, otherwise create
      let customer = existingCustomer;
      let customerCreated = false;
      if (!customer) {
        try {
          customer = await createCustomer({
            full_name: form.full_name.trim(),
            phone: normalizedPhone,
            address: form.address.trim() || null,
            city: form.city.trim() || null,
            email: form.email.trim() || null,
          });
          customerCreated = true;
          createdCustomerId.current = customer.id;
        } catch (err) {
          // Someone registered the same phone in the meantime — use that record, never a duplicate
          if (err instanceof ApiError && err.code === "CUSTOMER_PHONE_EXISTS") {
            customer = await findCustomerByPhone(normalizedPhone);
          }
          if (!customer) throw err;
        }
        setExistingCustomer(customer);
      } else if (createdCustomerId.current === customer.id) {
        customerCreated = true;
      }

      // 2. Lead: associate with an open lead for the same vehicle, otherwise open a new one (status NEW)
      const openLeads = await listLeads({ customerId: customer.id, pageSize: 100 });
      let lead =
        openLeads.items.find(
          (l) =>
            !CLOSED_LEAD_STATUSES.has(l.status) && l.interested_variant_id === selectedVariant.id,
        ) ?? null;
      let leadCreated = false;
      let leadOwnedElsewhere = false;
      if (!lead) {
        try {
          lead = await createLead({
            customer_id: customer.id,
            interested_variant_id: selectedVariant.id,
            source,
            priority,
            notes: notes.trim() || `Quotation requested for ${selectedVariant.name}`,
          });
          leadCreated = true;
        } catch (err) {
          // The backend allows one open lead per customer + vehicle and tells us which one exists.
          const existingLeadId =
            err instanceof ApiError && err.code === "LEAD_ALREADY_OPEN"
              ? (err.details as { lead_id?: number } | undefined)?.lead_id
              : undefined;
          if (!existingLeadId) throw err;
          try {
            lead = await getLead(existingLeadId);
          } catch (lookupErr) {
            // Another salesperson handles this customer's lead for the vehicle; reads are
            // scoped, so we cannot open it. The quotation is still created for this salesperson.
            if (lookupErr instanceof ApiError && lookupErr.status === 404) {
              leadOwnedElsewhere = true;
            } else {
              throw lookupErr;
            }
          }
        }
      }

      // 3. Quotation: backend owns number, pricing, discount, EMI, expiry and PDF
      intakeKey.current ??= crypto.randomUUID();
      const quotation = await createQuotation(
        {
          customer_id: customer.id,
          variant_id: selectedVariant.id,
          accessory_ids: accessoryIds,
          custom_items: validCustomItems,
          offer_id: offerId,
          down_payment: num(downPayment),
          loan_tenure: loanTenure,
          interest_rate: num(interestRate),
          notes: notes.trim() || null,
        },
        intakeKey.current,
      );

      return { quotation, customer, customerCreated, lead, leadCreated, leadOwnedElsewhere };
    },
    onSuccess: (res) => {
      setResult(res);
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(`Quotation ${res.quotation.quotation_number} created`);
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create quotation."),
    onSettled: () => {
      submitInFlight.current = false;
    },
  });

  const submitQuotation = () => {
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    submitMutation.mutate();
  };

  const resetAll = () => {
    intakeKey.current = null;
    createdCustomerId.current = null;
    setResult(null);
    setStep(0);
    setForm({ full_name: "", phone: "", address: "", city: "", email: "" });
    setExistingCustomer(null);
    setBrandId(null);
    setModelId(null);
    setVariantId(null);
    setSource("WALK_IN");
    setPriority("MEDIUM");
    setAccessoryIds([]);
    setCustomItems([]);
    setOfferId(null);
    setDownPayment("0");
    setLoanTenure(36);
    setInterestRate("9.5");
    setNotes("");
  };

  if (result) {
    return <IntakeResultView result={result} onNew={resetAll} />;
  }

  const customerSummary = existingCustomer ?? {
    full_name: form.full_name,
    phone: normalizedPhone,
    address: form.address,
    city: form.city,
    email: form.email,
  };

  return (
    <div className="animate-fade-up max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="New Quotation"
        description="Capture the customer, what they want, and send them a quotation. A sales lead is opened automatically."
      />

      {/* Step indicator */}
      <div className="flex justify-between items-center bg-card p-4 rounded-2xl border shadow-sm">
        {STEPS.map((title, i) => (
          <div key={title} className="flex items-center gap-2">
            <span
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                step === i
                  ? "bg-primary text-primary-foreground shadow"
                  : step > i
                    ? "bg-success text-success-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i + 1}
            </span>
            <span className="hidden sm:inline text-sm font-medium">{title}</span>
          </div>
        ))}
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          {/* STEP 1 — CUSTOMER */}
          {step === 0 && (
            <div className="space-y-6 animate-fade-up">
              <div className="flex justify-between items-center gap-4">
                <h2 className="text-xl font-semibold">1. Customer</h2>
                {!existingCustomer && (
                  <Button
                    type="button"
                    variant={isListening ? "destructive" : "secondary"}
                    onClick={handleVoiceInput}
                    className="gap-2 rounded-full"
                  >
                    <Mic className={`w-4 h-4 ${isListening ? "animate-pulse" : ""}`} />
                    {isListening ? "Listening…" : "Voice input"}
                  </Button>
                )}
              </div>

              {existingCustomer ? (
                <div className="rounded-xl border border-success/40 bg-success/5 p-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-success flex items-center gap-1">
                      <UserCheck className="size-4" /> Existing customer #{existingCustomer.id}
                    </p>
                    <p className="font-semibold text-lg mt-1">{existingCustomer.full_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {existingCustomer.phone}
                      {existingCustomer.city ? ` · ${existingCustomer.city}` : ""}
                    </p>
                    {existingCustomer.address && (
                      <p className="text-sm text-muted-foreground">{existingCustomer.address}</p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setExistingCustomer(null)}>
                    Change
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone number *</Label>
                      <Input
                        id="phone"
                        inputMode="tel"
                        autoFocus
                        value={form.phone}
                        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                        placeholder="10-digit mobile number"
                      />
                      {phoneLookup.isFetching && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Loader2 className="size-3 animate-spin" /> Checking existing customers…
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="full_name">Full name *</Label>
                      <Input
                        id="full_name"
                        value={form.full_name}
                        onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                        placeholder="e.g. Rahul Sharma"
                      />
                    </div>
                  </div>

                  {phoneMatch && (
                    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold">Customer already exists</p>
                        <p className="font-medium mt-1">{phoneMatch.full_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {phoneMatch.phone}
                          {phoneMatch.city ? ` · ${phoneMatch.city}` : ""}
                        </p>
                      </div>
                      <Button onClick={() => setExistingCustomer(phoneMatch)} className="gap-2">
                        <UserCheck className="size-4" /> Use this customer
                      </Button>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="address">Address *</Label>
                    <Textarea
                      id="address"
                      rows={2}
                      value={form.address}
                      onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                      placeholder="House / street / area"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={form.city}
                        onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                        placeholder="e.g. Mumbai"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email (optional)</Label>
                      <Input
                        id="email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* STEP 2 — VEHICLE INTEREST */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-up">
              <h2 className="text-xl font-semibold">2. Vehicle interest</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Brand</Label>
                  <Select
                    value={brandId ? String(brandId) : ""}
                    onValueChange={(v) => {
                      setBrandId(Number(v));
                      setModelId(null);
                      setVariantId(null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={brandsQuery.isLoading ? "Loading…" : "Select brand"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(brandsQuery.data ?? [])
                        .filter((b) => b.is_active)
                        .map((b) => (
                          <SelectItem key={b.id} value={String(b.id)}>
                            {b.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select
                    value={modelId ? String(modelId) : ""}
                    onValueChange={(v) => {
                      setModelId(Number(v));
                      setVariantId(null);
                    }}
                    disabled={!brandId}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={modelsQuery.isLoading ? "Loading…" : "Select model"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(modelsQuery.data ?? [])
                        .filter((m) => m.is_active)
                        .map((m) => (
                          <SelectItem key={m.id} value={String(m.id)}>
                            {m.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Variant</Label>
                  <Select
                    value={variantId ? String(variantId) : ""}
                    onValueChange={(v) => setVariantId(Number(v))}
                    disabled={!modelId}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={variantsQuery.isLoading ? "Loading…" : "Select variant"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {variants.map((v) => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {modelId && !variantsQuery.isLoading && variants.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No active variants for this model.
                    </p>
                  )}
                </div>
              </div>

              {selectedVariant && (
                <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-semibold">
                        {selectedBrand?.name} {selectedModel?.name} — {selectedVariant.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {enumLabel(selectedVariant.fuel_type)} ·{" "}
                        {enumLabel(selectedVariant.transmission)}
                        {selectedVariant.engine_cc ? ` · ${selectedVariant.engine_cc} cc` : ""}
                      </p>
                    </div>
                    <Badge variant="outline">{selectedVariant.code}</Badge>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                    <PriceCell label="Ex-showroom" value={selectedVariant.ex_showroom_price} />
                    <PriceCell label="Insurance" value={selectedVariant.insurance_price} />
                    <PriceCell label="RTO" value={selectedVariant.rto_price} />
                    <PriceCell label="List on-road" value={selectedVariant.on_road_price} strong />
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t">
                <div className="space-y-2">
                  <Label>How did the customer come in?</Label>
                  <Select value={source} onValueChange={(v) => setSource(v as LeadSource)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_SOURCES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {enumLabel(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Lead priority</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as LeadPriority)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {enumLabel(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3 — QUOTATION OPTIONS */}
          {step === 2 && (
            <div className="space-y-6 animate-fade-up">
              <h2 className="text-xl font-semibold">3. Quotation</h2>

              <div className="space-y-3">
                <Label className="text-base font-medium">Accessories</Label>
                {accessories.length === 0 && (
                  <p className="text-sm text-muted-foreground">No accessories in the catalog.</p>
                )}
                <div className="grid sm:grid-cols-2 gap-3 max-h-56 overflow-y-auto p-1">
                  {accessories.map((acc) => {
                    const checked = accessoryIds.includes(acc.id);
                    return (
                      <label
                        key={acc.id}
                        className={`flex items-center justify-between p-3 border rounded-xl cursor-pointer transition-colors ${
                          checked ? "border-primary bg-primary/5" : "hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() =>
                              setAccessoryIds((prev) =>
                                prev.includes(acc.id)
                                  ? prev.filter((id) => id !== acc.id)
                                  : [...prev, acc.id],
                              )
                            }
                          />
                          <span className="text-sm font-medium">{acc.name}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">{inr(num(acc.price))}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Custom items</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() =>
                      setCustomItems((c) => [
                        ...c,
                        { item_name: "", unit_price: "", quantity: "1" },
                      ])
                    }
                  >
                    <Plus className="size-4" /> Add item
                  </Button>
                </div>
                {customItems.map((item, i) => (
                  <div key={i} className="grid grid-cols-[1fr_120px_80px_auto] gap-2 items-center">
                    <Input
                      placeholder="Item name"
                      value={item.item_name}
                      onChange={(e) =>
                        setCustomItems((c) =>
                          c.map((x, j) => (j === i ? { ...x, item_name: e.target.value } : x)),
                        )
                      }
                    />
                    <Input
                      type="number"
                      min={0}
                      placeholder="Price ₹"
                      value={item.unit_price}
                      onChange={(e) =>
                        setCustomItems((c) =>
                          c.map((x, j) => (j === i ? { ...x, unit_price: e.target.value } : x)),
                        )
                      }
                    />
                    <Input
                      type="number"
                      min={1}
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) =>
                        setCustomItems((c) =>
                          c.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)),
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove item"
                      onClick={() => setCustomItems((c) => c.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <Label className="text-base font-medium">Offer</Label>
                <Select
                  value={offerId ? String(offerId) : "none"}
                  onValueChange={(v) => setOfferId(v === "none" ? null : Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No offer</SelectItem>
                    {offers.map((o) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        {o.title} (
                        {o.discount_type === "PERCENTAGE"
                          ? `${num(o.discount_value)}% off ex-showroom`
                          : `${inr(num(o.discount_value))} off`}
                        )
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3 pt-2 border-t">
                <Label className="text-base font-medium">Finance</Label>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="down_payment">Down payment (₹)</Label>
                    <Input
                      id="down_payment"
                      type="number"
                      min={0}
                      value={downPayment}
                      onChange={(e) => setDownPayment(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="loan_tenure">Loan tenure</Label>
                    <Select
                      value={String(loanTenure)}
                      onValueChange={(v) => setLoanTenure(Number(v))}
                    >
                      <SelectTrigger id="loan_tenure">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">No loan (full payment)</SelectItem>
                        {[12, 24, 36, 48, 60].map((m) => (
                          <SelectItem key={m} value={String(m)}>
                            {m} months
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="interest_rate">Interest rate (% p.a.)</Label>
                    <Input
                      id="interest_rate"
                      type="number"
                      step="0.1"
                      min={0}
                      max={MAX_INTEREST_RATE}
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                      disabled={loanTenure === 0}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  rows={2}
                  placeholder="e.g. Wants delivery before Diwali, prefers red"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* STEP 4 — REVIEW */}
          {step === 3 && selectedVariant && (
            <div className="space-y-6 animate-fade-up">
              <h2 className="text-xl font-semibold">4. Review</h2>

              <ReviewSection title="Customer">
                <div className="font-semibold">
                  {customerSummary.full_name}{" "}
                  {existingCustomer ? (
                    <Badge variant="outline" className="ml-1">
                      Existing #{existingCustomer.id}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="ml-1">
                      New customer
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {customerSummary.phone}
                  {customerSummary.city ? ` · ${customerSummary.city}` : ""}
                </p>
                {customerSummary.address && (
                  <p className="text-sm text-muted-foreground">{customerSummary.address}</p>
                )}
              </ReviewSection>

              <ReviewSection title="Vehicle">
                <p className="font-semibold">
                  {selectedBrand?.name} {selectedModel?.name} — {selectedVariant.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  Lead source: {enumLabel(source)} · Priority: {enumLabel(priority)}
                </p>
              </ReviewSection>

              <ReviewSection title="Quotation inputs">
                <ul className="text-sm space-y-1">
                  <li>Ex-showroom: {inr(num(selectedVariant.ex_showroom_price))}</li>
                  {accessories
                    .filter((a) => accessoryIds.includes(a.id))
                    .map((a) => (
                      <li key={a.id}>
                        + {a.name}: {inr(num(a.price))}
                      </li>
                    ))}
                  {validCustomItems.map((c, i) => (
                    <li key={i}>
                      + {c.item_name}: {inr(num(c.unit_price))} × {c.quantity}
                    </li>
                  ))}
                  <li>Offer: {selectedOffer ? selectedOffer.title : "None"}</li>
                  <li>
                    Finance:{" "}
                    {loanTenure > 0
                      ? `${inr(num(downPayment))} down · ${loanTenure} months @ ${num(interestRate)}%`
                      : `Full payment (${inr(num(downPayment))} down)`}
                  </li>
                  {notes.trim() && <li>Notes: {notes.trim()}</li>}
                </ul>
              </ReviewSection>

              <p className="text-sm text-muted-foreground rounded-xl border border-primary/20 bg-primary/5 p-4">
                The final price, discount, loan amount, EMI, quotation number and expiry are
                calculated by the server when you create the quotation. A lead with status{" "}
                <strong>New</strong> will be opened for this customer (or the open lead for this
                vehicle reused).
              </p>
            </div>
          )}
        </CardContent>

        <div className="px-6 py-4 border-t bg-muted/20 flex justify-between rounded-b-2xl">
          <Button
            variant="outline"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || submitMutation.isPending}
          >
            <ChevronLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={goNext}>
              Next <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={submitQuotation}
              disabled={submitMutation.isPending}
              className="rounded-full"
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating…
                </>
              ) : (
                "Create quotation"
              )}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function PriceCell({
  label,
  value,
  strong,
}: {
  label: string;
  value: string | number | undefined;
  strong?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={strong ? "font-semibold" : "font-medium"}>{inr(num(value))}</p>
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 border-b pb-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
        {title}
      </p>
      {children}
    </div>
  );
}

/* ============ AFTER CREATION ============ */

function IntakeResultView({ result, onNew }: { result: IntakeResult; onNew: () => void }) {
  const { quotation: q, customer, lead } = result;
  const [pdfBusy, setPdfBusy] = useState(false);
  const [waResult, setWaResult] = useState<WhatsAppDispatchResponse | null>(null);

  const waInFlight = useRef(false);
  const waMutation = useMutation({
    mutationFn: () => sendQuotationWhatsApp(q.id),
    onSuccess: (res) => setWaResult(res),
    onError: (err: Error) => toast.error(`WhatsApp request failed: ${err.message}`),
  });

  const withPdf = async (action: (blob: Blob) => void) => {
    setPdfBusy(true);
    try {
      action(await downloadQuotationPdf(q.id));
    } catch (err) {
      toast.error(`PDF unavailable: ${(err as Error).message}`);
    } finally {
      setPdfBusy(false);
    }
  };

  const vehicleName = q.variant
    ? `${q.variant.model?.brand?.name ?? ""} ${q.variant.model?.name ?? ""} ${q.variant.name}`.trim()
    : `Variant #${q.variant_id}`;

  return (
    <div className="animate-fade-up max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Quotation created"
        description="Share it with the customer and plan the next step."
      />

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-success font-semibold flex items-center gap-1">
                <CheckCircle2 className="size-4" /> Quotation generated
              </p>
              <p className="text-2xl font-bold mt-1">{q.quotation_number}</p>
              <p className="text-sm text-muted-foreground">
                {customer.full_name} · {customer.phone}
                {result.customerCreated ? " · new customer" : " · existing customer"}
              </p>
              <p className="text-sm text-muted-foreground">{vehicleName}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Final price</p>
              <p className="text-3xl font-bold text-primary">{inr(num(q.final_price))}</p>
              {num(q.emi) > 0 && (
                <p className="text-sm text-muted-foreground">
                  EMI {inr(num(q.emi))}/month × {q.loan_tenure}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm border-t pt-4">
            <PriceCell label="Ex-showroom" value={q.base_price} />
            <PriceCell label="Insurance" value={q.insurance} />
            <PriceCell label="RTO" value={q.rto} />
            <PriceCell label="Accessories & items" value={q.accessories} />
            <PriceCell label="Discount" value={q.discount} />
            <PriceCell label="Down payment" value={q.down_payment} />
            <PriceCell label="Loan amount" value={q.loan_amount} />
            <div>
              <p className="text-xs text-muted-foreground">Valid until</p>
              <p className="font-medium">
                {q.expires_at ? new Date(q.expires_at).toLocaleDateString("en-IN") : "—"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button variant="outline" asChild className="gap-2">
              <Link to="/quotations" search={{ q: q.quotation_number }}>
                <FileText className="size-4" /> View quotation
              </Link>
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              disabled={pdfBusy}
              onClick={() =>
                withPdf((blob) => {
                  const url = URL.createObjectURL(blob);
                  window.open(url, "_blank", "noopener");
                  setTimeout(() => URL.revokeObjectURL(url), 60_000);
                })
              }
            >
              <ExternalLink className="size-4" /> Open PDF
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              disabled={pdfBusy}
              onClick={() => withPdf((blob) => downloadBlob(blob, `${q.quotation_number}.pdf`))}
            >
              <Download className="size-4" /> Download PDF
            </Button>
            <Button
              className="gap-2"
              disabled={waMutation.isPending}
              onClick={() => {
                if (waInFlight.current) return;
                waInFlight.current = true;
                waMutation.mutate(undefined, {
                  onSettled: () => {
                    waInFlight.current = false;
                  },
                });
              }}
            >
              {waMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Send via WhatsApp
            </Button>
          </div>

          {waResult &&
            (isRealWhatsAppDelivery(waResult) ? (
              <div className="rounded-xl border border-success/40 bg-success/5 p-4 text-sm">
                <p className="font-semibold text-success flex items-center gap-1">
                  <CheckCircle2 className="size-4" /> Sent via WhatsApp Business API
                </p>
                <p className="text-muted-foreground">
                  Provider {waResult.delivery.provider} accepted the message (id{" "}
                  {waResult.delivery.message_id}).
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                <p className="font-semibold flex items-center gap-1">
                  <TriangleAlert className="size-4" /> WhatsApp NOT delivered — simulated only
                </p>
                <p className="text-muted-foreground">
                  The server returned status <code>{waResult.delivery?.status ?? "unknown"}</code>{" "}
                  from {waResult.delivery?.provider ?? "an unknown provider"}. The customer has not
                  received anything. {waResult.delivery?.note}
                </p>
                <p className="text-muted-foreground mt-1">
                  Share the PDF with the customer manually until WhatsApp Business credentials are
                  configured on the server.
                </p>
              </div>
            ))}
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Sales lead</h3>
            <p className="text-sm text-muted-foreground">
              {result.leadOwnedElsewhere
                ? "This customer already has an open lead for this vehicle handled by another salesperson. The quotation is saved under your name; coordinate with them or a manager for the lead."
                : result.leadCreated
                  ? "A new lead was opened for this enquiry."
                  : "This quotation was added to the customer's existing open lead for this vehicle."}
            </p>
          </div>
          {lead && <LeadActionsPanel leadId={lead.id} />}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" asChild>
          <Link to="/follow-ups">Go to follow-ups</Link>
        </Button>
        <Button onClick={onNew} className="gap-2">
          <Plus className="size-4" /> New quotation
        </Button>
      </div>
    </div>
  );
}
