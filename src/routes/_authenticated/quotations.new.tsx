import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  Mail,
  Mic,
  Plus,
  Printer,
  ShieldAlert,
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
import { useAuth } from "@/hooks/use-auth";
import { parseVoiceIntake } from "@/lib/voice-intake";
import type { BackendOfferResponse } from "@/lib/quotation-types";
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
  sendQuotationEmail,
  sendQuotationWhatsApp,
  downloadComparisonPdf,
} from "@/services/repository";
import type { CustomerResponse } from "@/lib/customer-types";
import type { VariantResponse } from "@/lib/vehicle-types";
import { PAYMENT_MODE_LABEL } from "@/lib/quotation-display";
import {
  isRealWhatsAppDelivery,
  type PaymentMode,
  type QuotationItemCreate,
  type QuotationResponse,
  type WhatsAppDispatchResponse,
  type EmailDispatchResponse,
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
  component: NewQuotationGate,
});

/** Only roles the backend allows to create quotations get the form; others see why not. */
function NewQuotationGate() {
  const { canSell, user, roleName } = useAuth();
  if (!user) {
    return (
      <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </p>
    );
  }
  if (!canSell) {
    return (
      <div className="animate-fade-up max-w-2xl mx-auto space-y-6">
        <PageHeader title="New Quotation" description="Customer intake and quotation creation." />
        <Card className="rounded-2xl">
          <CardContent className="space-y-3 p-6">
            <p className="flex items-center gap-2 font-semibold">
              <ShieldAlert className="size-5 text-destructive" /> Your role can't create quotations
            </p>
            <p className="text-sm text-muted-foreground">
              Quotations and new customers are created by Sales Executives, Dealer Owners and
              Admins. You are signed in as {roleName ? enumLabel(roleName) : "a different role"}.
              You can still view existing quotations and their PDFs.
            </p>
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/quotations">Go to quotations</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  return <NewQuotationPage />;
}

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

interface VehicleOutcome {
  quotation: QuotationResponse;
  /** Null when the customer's open lead for this vehicle belongs to another salesperson. */
  lead: LeadResponse | null;
  leadCreated: boolean;
  /** Set when the open lead exists but is handled by someone else. */
  leadOwnedElsewhere?: boolean;
}

interface IntakeResult extends VehicleOutcome {
  customer: CustomerResponse;
  customerCreated: boolean;
  /** Vehicle B of a comparison quotation (vehicle A is the top-level quotation). */
  compare?: VehicleOutcome;
}

/** Brand / model / variant ids chosen for one vehicle, plus what they resolve to. */
interface VehicleChoice {
  brandId: number | null;
  modelId: number | null;
  variantId: number | null;
}
interface ResolvedVehicle {
  variant: VariantResponse;
  brandName: string;
  modelName: string;
}
const EMPTY_CHOICE: VehicleChoice = { brandId: null, modelId: null, variantId: null };

const num = (v: string | number | null | undefined) => Number(v ?? 0) || 0;

/** Minimal Web Speech API surface used for voice capture (not in TS DOM lib) */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  start: () => void;
  stop: () => void;
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
  // One vehicle, or a comparison quotation of vehicle A vs vehicle B
  const [compareMode, setCompareMode] = useState(false);
  const [choiceB, setChoiceB] = useState<VehicleChoice>(EMPTY_CHOICE);
  const [vehicleB, setVehicleB] = useState<ResolvedVehicle | null>(null);
  const [offerIdB, setOfferIdB] = useState<number | null>(null);

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
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("CASH");
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
  const offersQueryB = useQuery({
    queryKey: ["applicable-offers", choiceB.brandId, choiceB.modelId, choiceB.variantId],
    queryFn: () =>
      listApplicableOffers({
        brandId: choiceB.brandId ?? undefined,
        modelId: choiceB.modelId ?? undefined,
        variantId: choiceB.variantId ?? undefined,
      }),
    enabled: compareMode && choiceB.variantId !== null,
  });
  const accessories = (accessoriesQuery.data ?? []).filter((a) => a.is_active);
  const offers = offersQuery.data ?? [];
  const selectedOffer = offers.find((o) => o.id === offerId) ?? null;
  const offersB = offersQueryB.data ?? [];
  const selectedOfferB = offersB.find((o) => o.id === offerIdB) ?? null;
  useEffect(() => {
    if (offerIdB !== null && offersQueryB.data && !offersQueryB.data.some((o) => o.id === offerIdB)) {
      setOfferIdB(null);
    }
  }, [offersQueryB.data, offerIdB]);
  const vehicleALabel = selectedVariant
    ? `${selectedBrand?.name ?? ""} ${selectedModel?.name ?? ""} ${selectedVariant.name}`.trim()
    : "";
  const vehicleBLabel = vehicleB
    ? `${vehicleB.brandName} ${vehicleB.modelName} ${vehicleB.variant.name}`.trim()
    : "";

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
  // Listens until the salesperson presses Stop, so pauses do not cut the description short.
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef("");
  const handleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
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
    recognition.continuous = true;
    transcriptRef.current = "";
    recognition.onstart = () => {
      setIsListening(true);
      toast.info(
        'Listening… say e.g. "name Rahul Sharma, phone 98765 43210, address 12 MG Road, city Mumbai". Press Stop when done.',
      );
    };
    recognition.onerror = (event) => {
      if (event?.error !== "no-speech" && event?.error !== "aborted") toast.error("Voice input error");
    };
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r?.isFinal) transcriptRef.current += ` ${r[0]?.transcript ?? ""}`;
      }
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      const heard = transcriptRef.current.trim();
      if (!heard) return;
      const parsed = parseVoiceIntake(heard);
      setForm((f) => ({
        full_name: parsed.full_name || f.full_name,
        phone: parsed.phone || f.phone,
        address: parsed.address || f.address,
        city: parsed.city || f.city,
        email: parsed.email || f.email,
      }));
      const filled = (["full_name", "phone", "address", "city", "email"] as const)
        .filter((k) => parsed[k])
        .map((k) => ({ full_name: "name", phone: "phone", address: "address", city: "city", email: "email" })[k]);
      toast.success(
        filled.length
          ? `Filled ${filled.join(", ")} from voice. Please check the details.`
          : "Could not recognise any details. Please type them.",
      );
    };
    recognitionRef.current = recognition;
    recognition.start();
  };
  useEffect(() => () => recognitionRef.current?.stop(), []);

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
    if (s === 1) {
      if (!selectedVariant)
        return compareMode
          ? "Select brand, model and variant for vehicle A."
          : "Select the brand, model and variant the customer wants.";
      if (compareMode && !vehicleB) return "Select brand, model and variant for vehicle B.";
      if (compareMode && vehicleB && vehicleB.variant.id === selectedVariant.id)
        return "Choose two different vehicles to compare.";
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
    // phone, not existingCustomer: submitting sets existingCustomer, which must not reset the key
    normalizedPhone,
    variantId,
    compareMode,
    choiceB.variantId,
    offerIdB,
    accessoryIds,
    customItems,
    offerId,
    paymentMode,
    notes,
  ]);
  useEffect(() => {
    intakeKey.current = null;
  }, [requestFingerprint]);

  // ---- Submit: customer → lead → quotation, all persisted by the backend ----
  const submitMutation = useMutation({
    mutationFn: async (): Promise<IntakeResult> => {
      if (!selectedVariant) throw new Error("Vehicle variant is required.");
      // Capture the key now: setExistingCustomer below changes the fingerprint, which clears the ref mid-submit.
      const attemptKey = (intakeKey.current ??= crypto.randomUUID());

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

      // 2. Open (or reuse) lead for the selected vehicle
      const openLeads = await listLeads({ customerId: customer!.id, pageSize: 100 });
      let lead =
        openLeads.items.find(
          (l) => !CLOSED_LEAD_STATUSES.has(l.status) && l.interested_variant_id === selectedVariant.id,
        ) ?? null;
      let leadCreated = false;
      let leadOwnedElsewhere = false;
      if (!lead) {
        try {
          lead = await createLead({
            customer_id: customer!.id,
            interested_variant_id: selectedVariant.id,
            source,
            priority,
            notes:
              notes.trim() ||
              (compareMode && vehicleB
                ? `Comparison quotation: ${selectedVariant.name} vs ${vehicleB.variant.name}`
                : `Quotation requested for ${selectedVariant.name}`),
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
            // Another salesperson handles this lead; reads are scoped, so we cannot open it.
            if (lookupErr instanceof ApiError && lookupErr.status === 404) leadOwnedElsewhere = true;
            else throw lookupErr;
          }
        }
      }

      // 3. Create the ONE quotation (contains both vehicle options if comparison requested)
      const quotation = await createQuotation(
        {
          customer_id: customer!.id,
          variant_id: selectedVariant.id,
          compare_variant_id: compareMode && vehicleB ? vehicleB.variant.id : undefined,
          accessory_ids: accessoryIds,
          custom_items: validCustomItems,
          offer_id: offerId,
          compare_offer_id: compareMode && vehicleB ? offerIdB : undefined,
          payment_mode: paymentMode,
          notes:
            [
              notes.trim(),
              compareMode && vehicleB ? `Comparison: ${selectedVariant.name} vs ${vehicleB.variant.name}` : "",
            ]
              .filter(Boolean)
              .join(" · ") || null,
        },
        attemptKey,
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
    setCompareMode(false);
    setChoiceB(EMPTY_CHOICE);
    setVehicleB(null);
    setOfferIdB(null);
    setAccessoryIds([]);
    setCustomItems([]);
    setOfferId(null);
    setPaymentMode("CASH");
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
                    {isListening ? "Stop listening" : "Voice input"}
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
              <div className="space-y-2">
                <Label>What does the customer want?</Label>
                <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Quotation type">
                  {(
                    [
                      [false, "Quotation for one vehicle", "A single priced quotation"],
                      [true, "Compare 2 vehicles", "Vehicle A vs vehicle B, side by side"],
                    ] as const
                  ).map(([value, title, hint]) => (
                    <button
                      key={String(value)}
                      type="button"
                      role="radio"
                      aria-checked={compareMode === value}
                      onClick={() => setCompareMode(value)}
                      className={`rounded-xl border p-4 text-left transition-colors ${
                        compareMode === value ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "hover:bg-muted/40"
                      }`}
                    >
                      <p className="font-semibold">{title}</p>
                      <p className="text-sm text-muted-foreground">{hint}</p>
                    </button>
                  ))}
                </div>
              </div>
              {compareMode && <h3 className="font-semibold">Vehicle A</h3>}
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

              {compareMode && (
                <div className="space-y-4 border-t pt-4">
                  <h3 className="font-semibold">Vehicle B</h3>
                  <VehiclePicker
                    value={choiceB}
                    onChange={setChoiceB}
                    onResolved={setVehicleB}
                    excludeVariantId={variantId}
                  />
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
                <Label className="text-base font-medium">
                  {compareMode ? `Offer — vehicle A (${vehicleALabel})` : "Offer"}
                </Label>
                <OfferSelect offers={offers} value={offerId} onChange={setOfferId} />
              </div>
              {compareMode && (
                <div className="space-y-3">
                  <Label className="text-base font-medium">Offer — vehicle B ({vehicleBLabel})</Label>
                  <OfferSelect offers={offersB} value={offerIdB} onChange={setOfferIdB} />
                </div>
              )}
              {compareMode && (
                <p className="text-sm text-muted-foreground">
                  Accessories, custom items and the payment mode apply to both vehicles so the
                  comparison is like for like.
                </p>
              )}

              <div className="space-y-3 pt-2 border-t">
                <Label className="text-base font-medium" id="payment-mode-label">
                  Payment mode
                </Label>
                <div
                  className="grid gap-3 sm:grid-cols-2"
                  role="radiogroup"
                  aria-labelledby="payment-mode-label"
                >
                  {(["CASH", "FINANCE"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={paymentMode === mode}
                      onClick={() => setPaymentMode(mode)}
                      className={`rounded-xl border p-4 text-left font-medium transition ${
                        paymentMode === mode ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                      }`}
                    >
                      {PAYMENT_MODE_LABEL[mode]}
                    </button>
                  ))}
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

              <ReviewSection title={compareMode ? "Vehicles compared" : "Vehicle"}>
                <p className="font-semibold">
                  {compareMode ? "A: " : ""}
                  {selectedBrand?.name} {selectedModel?.name} — {selectedVariant.name}
                  {compareMode && ` · offer: ${selectedOffer ? selectedOffer.title : "none"}`}
                </p>
                {compareMode && vehicleB && (
                  <p className="font-semibold">
                    B: {vehicleB.brandName} {vehicleB.modelName} — {vehicleB.variant.name} · offer:{" "}
                    {selectedOfferB ? selectedOfferB.title : "none"}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Lead source: {enumLabel(source)} · Priority: {enumLabel(priority)}
                </p>
              </ReviewSection>

              <ReviewSection title="Quotation inputs">
                <ul className="text-sm space-y-1">
                  <li>
                    Ex-showroom: {inr(num(selectedVariant.ex_showroom_price))}
                    {compareMode && vehicleB ? ` (A) vs ${inr(num(vehicleB.variant.ex_showroom_price))} (B)` : ""}
                  </li>
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
                  {!compareMode && <li>Offer: {selectedOffer ? selectedOffer.title : "None"}</li>}
                  <li>Payment mode: {PAYMENT_MODE_LABEL[paymentMode]}</li>
                  {notes.trim() && <li>Notes: {notes.trim()}</li>}
                </ul>
              </ReviewSection>

              <p className="text-sm text-muted-foreground rounded-xl border border-primary/20 bg-primary/5 p-4">
                The final price, discount, quotation number and expiry are
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

interface VehicleOptionData {
  label: string;
  name: string;
  brandName?: string;
  modelName?: string;
  fuelType?: string;
  transmission?: string;
  engineCc?: number | string | null;
  basePrice: number;
  insurance: number;
  rto: number;
  accessories: number;
  otherCharges: number;
  discount: number;
  finalPrice: number;
  offerTitle?: string | null;
}

function extractOptions(q: QuotationResponse): {
  optA: VehicleOptionData;
  optB: VehicleOptionData | null;
  isComparison: boolean;
} {
  const vehicleItems = (q.items ?? []).filter((it) => it.item_type === "VEHICLE_OPTION");
  const isComparison = vehicleItems.length >= 2;

  const snapA = (vehicleItems[0]?.details_json as Record<string, any> | undefined) ?? {};
  const optA: VehicleOptionData = {
    label: isComparison ? "Option A" : "Vehicle",
    name:
      snapA.full_name ??
      snapA.variant_name ??
      (q.variant
        ? `${q.variant.model?.brand?.name ?? ""} ${q.variant.model?.name ?? ""} ${q.variant.name}`.trim()
        : vehicleItems[0]?.item_name ?? `Variant #${q.variant_id}`),
    brandName: snapA.brand_name ?? q.variant?.model?.brand?.name,
    modelName: snapA.model_name ?? q.variant?.model?.name,
    fuelType: snapA.fuel_type ?? q.variant?.fuel_type,
    transmission: snapA.transmission ?? q.variant?.transmission,
    engineCc: snapA.engine_cc ?? q.variant?.engine_cc,
    basePrice: num(snapA.base_price ?? q.base_price),
    insurance: num(snapA.insurance ?? q.insurance),
    rto: num(snapA.rto ?? q.rto),
    accessories: num(snapA.accessories ?? q.accessories),
    otherCharges: num(
      snapA.other_charges ??
        Math.max(
          0,
          num(q.final_price) +
            num(q.discount) -
            num(q.base_price) -
            num(q.insurance) -
            num(q.rto) -
            num(q.accessories),
        ),
    ),
    discount: num(snapA.discount ?? q.discount),
    finalPrice: num(snapA.final_price ?? vehicleItems[0]?.total_price ?? q.final_price),
    offerTitle: snapA.offer_title ?? q.offer?.title,
  };

  let optB: VehicleOptionData | null = null;
  if (isComparison) {
    const snapB = (vehicleItems[1]?.details_json as Record<string, any> | undefined) ?? {};
    optB = {
      label: "Option B",
      name:
        snapB.full_name ??
        snapB.variant_name ??
        vehicleItems[1]?.item_name?.replace(/^Option B:\s*/, "") ??
        "Option B",
      brandName: snapB.brand_name,
      modelName: snapB.model_name,
      fuelType: snapB.fuel_type,
      transmission: snapB.transmission,
      engineCc: snapB.engine_cc,
      basePrice: num(snapB.base_price ?? vehicleItems[1]?.unit_price),
      insurance: num(snapB.insurance ?? 0),
      rto: num(snapB.rto ?? 0),
      accessories: num(snapB.accessories ?? 0),
      otherCharges: num(snapB.other_charges ?? 0),
      discount: num(snapB.discount ?? 0),
      finalPrice: num(snapB.final_price ?? vehicleItems[1]?.total_price),
      offerTitle: snapB.offer_title,
    };
  }

  return { optA, optB, isComparison };
}

function IntakeResultView({ result, onNew }: { result: IntakeResult; onNew: () => void }) {
  const { quotation: q, customer, lead } = result;
  const { optA, optB, isComparison } = extractOptions(q);

  const [pdfBusy, setPdfBusy] = useState(false);
  const [waResult, setWaResult] = useState<WhatsAppDispatchResponse | null>(null);
  const [printBusy, setPrintBusy] = useState(false);
  const [printActive, setPrintActive] = useState(false);

  const [emailTo, setEmailTo] = useState(customer.email ?? "");
  const [emailResult, setEmailResult] = useState<EmailDispatchResponse | null>(null);
  const emailInFlight = useRef(false);
  const emailMutation = useMutation({
    mutationFn: async () => {
      return await sendQuotationEmail(q.id, emailTo.trim() || undefined);
    },
    onSuccess: (res) => {
      setEmailResult(res);
      if (res.delivered)
        toast.success(`Quotation emailed to ${res.recipient}`);
    },
    onError: (err: Error) => toast.error(`Email not sent: ${err.message}`),
    onSettled: () => {
      emailInFlight.current = false;
    },
  });
  const sendEmail = () => {
    if (emailInFlight.current) return;
    if (!/^\S+@\S+\.\S+$/.test(emailTo.trim())) {
      toast.error("Enter the customer's email address first.");
      return;
    }
    emailInFlight.current = true;
    emailMutation.mutate();
  };

  const waInFlight = useRef(false);
  const waMutation = useMutation({
    mutationFn: async () => {
      return await sendQuotationWhatsApp(q.id);
    },
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

  /** Open the browser's native print dialog for this quotation. */
  const handlePrint = () => {
    setPrintBusy(true);
    setPrintActive(true);
  };

  useEffect(() => {
    if (!printActive) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const cleanup = () => {
          setPrintActive(false);
          setPrintBusy(false);
          window.removeEventListener("afterprint", cleanup);
        };
        window.addEventListener("afterprint", cleanup);
        window.print();
      });
    });
    return () => cancelAnimationFrame(id);
  }, [printActive]);

  return (
    <div className="animate-fade-up max-w-4xl mx-auto space-y-6">
      <PageHeader
        title={isComparison ? "Comparison quotation created" : "Quotation created"}
        description={
          isComparison
            ? "Two alternative vehicle options combined in one official quotation."
            : "Share it with the customer and plan the next step."
        }
      />

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-success font-semibold flex items-center gap-1">
                <CheckCircle2 className="size-4" /> {isComparison ? "Comparison quotation generated" : "Quotation generated"}
              </p>
              <p className="text-2xl font-bold mt-1">{q.quotation_number}</p>
              <p className="text-sm text-muted-foreground">
                {customer.full_name} · {customer.phone}
                {result.customerCreated ? " · new customer" : " · existing customer"}
              </p>
              {isComparison && optB ? (
                <p className="text-sm font-medium text-foreground mt-1">
                  Option A: {optA.name} <span className="text-muted-foreground">vs</span> Option B: {optB.name}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{optA.name}</p>
              )}
            </div>
            {!isComparison && (
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Final price</p>
                <p className="text-3xl font-bold text-primary">{inr(optA.finalPrice)}</p>
                <p className="text-sm text-muted-foreground">
                  Payment mode: {PAYMENT_MODE_LABEL[q.payment_mode]}
                </p>
              </div>
            )}
            {isComparison && (
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Valid until</p>
                <p className="font-semibold">{q.expires_at ? new Date(q.expires_at).toLocaleDateString("en-IN") : "—"}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Payment mode: {PAYMENT_MODE_LABEL[q.payment_mode]}
                </p>
              </div>
            )}
          </div>

          {isComparison && optB ? (
            /* Comparison: Display both vehicle options side-by-side as alternative choices — NEVER SUMMED */
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Option A */}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">Option A</span>
                    <span className="text-2xl font-bold text-primary">{inr(optA.finalPrice)}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-base">{optA.name}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs border-t pt-2">
                    <PriceCell label="Ex-showroom" value={optA.basePrice} />
                    <PriceCell label="Insurance" value={optA.insurance} />
                    <PriceCell label="RTO" value={optA.rto} />
                    <PriceCell label="Accessories & items" value={optA.accessories} />
                    {optA.otherCharges > 0 && <PriceCell label="Other charges" value={optA.otherCharges} />}
                    {optA.discount > 0 && <PriceCell label="Discount" value={-optA.discount} />}
                  </div>
                </div>

                {/* Option B */}
                <div className="rounded-xl border border-secondary/30 bg-secondary/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-secondary">Option B</span>
                    <span className="text-2xl font-bold text-secondary">{inr(optB.finalPrice)}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-base">{optB.name}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs border-t pt-2">
                    <PriceCell label="Ex-showroom" value={optB.basePrice} />
                    <PriceCell label="Insurance" value={optB.insurance} />
                    <PriceCell label="RTO" value={optB.rto} />
                    <PriceCell label="Accessories & items" value={optB.accessories} />
                    {optB.otherCharges > 0 && <PriceCell label="Other charges" value={optB.otherCharges} />}
                    {optB.discount > 0 && <PriceCell label="Discount" value={-optB.discount} />}
                  </div>
                </div>
              </div>

              {/* Side-by-Side Comparison Breakdown */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Side-by-Side Comparison
                </h3>
                <ComparisonTable a={optA} b={optB} />
              </div>
            </div>
          ) : (
            /* Single Vehicle Breakdown */
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm border-t pt-4">
              <PriceCell label="Ex-showroom" value={q.base_price} />
              <PriceCell label="Insurance" value={q.insurance} />
              <PriceCell label="RTO" value={q.rto} />
              <PriceCell label="Accessories & items" value={q.accessories} />
              <PriceCell label="Discount" value={q.discount} />
              <div>
                <p className="text-xs text-muted-foreground">Valid until</p>
                <p className="font-medium">
                  {q.expires_at ? new Date(q.expires_at).toLocaleDateString("en-IN") : "—"}
                </p>
              </div>
            </div>
          )}

          {/* Action buttons: Single set of actions for this quotation */}
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
              disabled={printBusy}
              onClick={handlePrint}
            >
              {printBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Printer className="size-4" />
              )}
              Print
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

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1 space-y-1">
              <Label htmlFor="email-to">Customer email</Label>
              <Input
                id="email-to"
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="customer@example.com"
              />
            </div>
            <Button className="gap-2" disabled={emailMutation.isPending} onClick={sendEmail}>
              {emailMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Mail className="size-4" />
              )}
              Send via Email
            </Button>
          </div>

          {emailResult &&
            (emailResult.delivered ? (
              <div className="rounded-xl border border-success/40 bg-success/5 p-4 text-sm">
                <p className="font-semibold text-success flex items-center gap-1">
                  <CheckCircle2 className="size-4" /> Emailed to {emailResult.recipient}
                </p>
                <p className="text-muted-foreground">
                  {emailResult.attachment ? "The quotation PDF was attached. " : "Sent without the PDF (file not found). "}
                  {emailResult.admin_notified
                    ? "The admin was notified."
                    : "The admin notice could not be sent."}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                <p className="font-semibold flex items-center gap-1">
                  <TriangleAlert className="size-4" /> Email NOT sent — simulated only
                </p>
                <p className="text-muted-foreground">{emailResult.note}</p>
              </div>
            ))}

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
          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">
                {isComparison && optB ? `Sales lead — ${optA.name} vs ${optB.name}` : `Sales lead — ${optA.name}`}
              </h3>
              <p className="text-sm text-muted-foreground">
                {lead?.id
                  ? result.leadCreated
                    ? "A new lead was opened for this enquiry."
                    : "This quotation was added to the customer's existing open lead."
                  : result.leadOwnedElsewhere
                    ? "This customer already has an open lead for this vehicle handled by another salesperson. The quotation is saved under your name; coordinate with them or a manager for the lead."
                    : "Quotation recorded successfully."}
              </p>
            </div>
            {lead && <LeadActionsPanel leadId={lead.id} />}
          </div>
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

      {/* Print portal — hidden from screen, visible only to @media print */}
      {printActive &&
        createPortal(
          <PrintableQuotations quotation={q} customer={customer} />,
          document.body
        )}
    </div>
  );
}

/** Brand -> model -> variant picker for vehicle B of a comparison (state lives in the parent). */
function VehiclePicker({
  value,
  onChange,
  onResolved,
  excludeVariantId,
}: {
  value: VehicleChoice;
  onChange: (next: VehicleChoice) => void;
  onResolved: (vehicle: ResolvedVehicle | null) => void;
  excludeVariantId: number | null;
}) {
  const brandsQuery = useQuery({ queryKey: ["catalog-brands"], queryFn: listVehicleBrands });
  const modelsQuery = useQuery({
    queryKey: ["catalog-models", value.brandId],
    queryFn: () => listVehicleModels(value.brandId ?? undefined),
    enabled: value.brandId !== null,
  });
  const variantsQuery = useQuery({
    queryKey: ["catalog-variants", value.modelId],
    queryFn: () => listVehicles({ modelId: value.modelId ?? undefined, status: "ACTIVE", pageSize: 100 }),
    enabled: value.modelId !== null,
  });
  const variants = variantsQuery.data?.items ?? [];
  const variant = variants.find((v) => v.id === value.variantId) ?? null;
  const brandName = brandsQuery.data?.find((b) => b.id === value.brandId)?.name ?? "";
  const modelName = modelsQuery.data?.find((m) => m.id === value.modelId)?.name ?? "";

  useEffect(() => {
    onResolved(variant ? { variant, brandName, modelName } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant?.id, brandName, modelName]);

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Brand</Label>
          <Select
            value={value.brandId ? String(value.brandId) : ""}
            onValueChange={(v) => onChange({ brandId: Number(v), modelId: null, variantId: null })}
          >
            <SelectTrigger aria-label="Vehicle B brand">
              <SelectValue placeholder={brandsQuery.isLoading ? "Loading…" : "Select brand"} />
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
            value={value.modelId ? String(value.modelId) : ""}
            onValueChange={(v) => onChange({ ...value, modelId: Number(v), variantId: null })}
            disabled={!value.brandId}
          >
            <SelectTrigger aria-label="Vehicle B model">
              <SelectValue placeholder={modelsQuery.isLoading ? "Loading…" : "Select model"} />
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
            value={value.variantId ? String(value.variantId) : ""}
            onValueChange={(v) => onChange({ ...value, variantId: Number(v) })}
            disabled={!value.modelId}
          >
            <SelectTrigger aria-label="Vehicle B variant">
              <SelectValue placeholder={variantsQuery.isLoading ? "Loading…" : "Select variant"} />
            </SelectTrigger>
            <SelectContent>
              {variants
                .filter((v) => v.id !== excludeVariantId)
                .map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {variant && (
        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
          <p className="font-semibold">
            {brandName} {modelName} — {variant.name}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <PriceCell label="Ex-showroom" value={variant.ex_showroom_price} />
            <PriceCell label="Insurance" value={variant.insurance_price} />
            <PriceCell label="RTO" value={variant.rto_price} />
            <PriceCell label="List on-road" value={variant.on_road_price} strong />
          </div>
        </div>
      )}
    </div>
  );
}

function OfferSelect({
  offers,
  value,
  onChange,
}: {
  offers: BackendOfferResponse[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  return (
    <Select value={value ? String(value) : "none"} onValueChange={(v) => onChange(v === "none" ? null : Number(v))}>
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
  );
}

/** Side-by-side figures for comparison quotation. */
function ComparisonTable({
  a,
  b,
}: {
  a: VehicleOptionData;
  b: VehicleOptionData;
}) {
  const rows: [string, (opt: VehicleOptionData) => string, boolean?][] = [
    ["Ex-showroom", (opt) => inr(opt.basePrice)],
    ["Insurance", (opt) => inr(opt.insurance)],
    ["RTO / Road Tax", (opt) => inr(opt.rto)],
    ["Accessories & items", (opt) => inr(opt.accessories)],
    ["Other charges", (opt) => inr(opt.otherCharges)],
    ["Discount", (opt) => (opt.discount > 0 ? `− ${inr(opt.discount)}` : "—")],
    ["On-road final price", (opt) => inr(opt.finalPrice), true],
  ];
  const diff = b.finalPrice - a.finalPrice;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 text-left font-medium text-muted-foreground">Component</th>
              <th className="p-3 text-left font-semibold">Option A · {a.name}</th>
              <th className="p-3 text-left font-semibold">Option B · {b.name}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, f, strong]) => (
              <tr key={label} className="border-t">
                <td className="p-3 text-muted-foreground">{label}</td>
                <td className={`p-3 ${strong ? "font-semibold text-primary" : ""}`}>{f(a)}</td>
                <td className={`p-3 ${strong ? "font-semibold text-primary" : ""}`}>{f(b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {diff !== 0 && (
        <p className="text-sm text-muted-foreground">
          {diff > 0 ? "Option A" : "Option B"} is <strong>{inr(Math.abs(diff))}</strong> lower on-road.
        </p>
      )}
    </div>
  );
}

/* ============================================================
   PRINTABLE QUOTATION — rendered into a detached DOM node and
   shown exclusively via @media print (see styles.css).
   ============================================================ */

interface PrintableQuotationsProps {
  quotation: QuotationResponse;
  customer: { full_name: string; phone: string; email?: string | null; address?: string | null; city?: string | null; state?: string | null };
}

function PrintableQuotations({ quotation: q, customer }: PrintableQuotationsProps) {
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const { optA, optB, isComparison } = extractOptions(q);

  const salesExec = q.sales_executive
    ? `${q.sales_executive.full_name} (${q.sales_executive.email ?? ""})`
    : "Sales Executive";

  return (
    <div id="print-quotation-content">
      <div className="print-quotation-page">
        {/* Header */}
        <div className="print-header">
          <div className="print-header-left">
            <div className="print-company-name">VoiceQuote AI Dealership</div>
            <div className="print-company-sub">Authorised Two-Wheeler Showroom</div>
          </div>
          <div className="print-header-right">
            <div className="print-doc-label">{isComparison ? "COMPARISON QUOTATION" : "QUOTATION"}</div>
            <div className="print-doc-number">{q.quotation_number}</div>
          </div>
        </div>

        <div className="print-divider" />

        {/* Meta row */}
        <div className="print-meta-row">
          <div>
            <span className="print-label">Date</span>
            <span className="print-value">{today}</span>
          </div>
          <div>
            <span className="print-label">Valid Until</span>
            <span className="print-value">
              {q.expires_at ? new Date(q.expires_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
            </span>
          </div>
          <div>
            <span className="print-label">Status</span>
            <span className="print-value">{q.status}</span>
          </div>
          <div>
            <span className="print-label">Payment Mode</span>
            <span className="print-value">{PAYMENT_MODE_LABEL[q.payment_mode]}</span>
          </div>
        </div>

        <div className="print-divider" />

        {/* Customer Details */}
        <div className="print-section" style={{ marginBottom: "8px" }}>
          <div className="print-section-title">Customer Details</div>
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
            <div><span className="print-label">Name</span><span className="print-value">{customer.full_name}</span></div>
            <div><span className="print-label">Phone</span><span className="print-value">{customer.phone}</span></div>
            {customer.email && <div><span className="print-label">Email</span><span className="print-value">{customer.email}</span></div>}
            {(customer.address || customer.city) && (
              <div>
                <span className="print-label">Address</span>
                <span className="print-value">{[customer.address, customer.city, customer.state].filter(Boolean).join(", ")}</span>
              </div>
            )}
          </div>
        </div>

        <div className="print-divider" />

        {isComparison && optB ? (
          <>
            {/* Comparison Note */}
            <div className="print-comparison-note">
              <strong>Comparison Quotation:</strong> The vehicles below are alternative purchase options. Each option is independently calculated. Prices are not cumulative.
            </div>

            {/* Side-by-side Option A and Option B */}
            <div className="print-two-col" style={{ gap: "16px", marginTop: "8px" }}>
              {/* Option A */}
              <div className="print-option-card">
                <span className="print-option-badge">Option A</span>
                <div className="print-vehicle-name">{optA.name}</div>
                {optA.engineCc && (
                  <div className="print-field">
                    <span className="print-label">Specs</span>
                    <span className="print-value">{[optA.engineCc ? `${optA.engineCc} cc` : "", optA.fuelType, optA.transmission].filter(Boolean).join(" · ")}</span>
                  </div>
                )}
                {optA.offerTitle && (
                  <div className="print-field">
                    <span className="print-label">Offer</span>
                    <span className="print-value">{optA.offerTitle}</span>
                  </div>
                )}

                <table className="print-price-table" style={{ marginTop: "6px" }}>
                  <tbody>
                    <tr><td className="print-price-label">Ex-showroom</td><td className="print-price-value">{inr(optA.basePrice)}</td></tr>
                    <tr><td className="print-price-label">Insurance</td><td className="print-price-value">{inr(optA.insurance)}</td></tr>
                    <tr><td className="print-price-label">RTO / Road Tax</td><td className="print-price-value">{inr(optA.rto)}</td></tr>
                    <tr><td className="print-price-label">Accessories &amp; Items</td><td className="print-price-value">{inr(optA.accessories)}</td></tr>
                    {optA.otherCharges > 0 && <tr><td className="print-price-label">Other Charges</td><td className="print-price-value">{inr(optA.otherCharges)}</td></tr>}
                    {optA.discount > 0 && <tr className="print-discount-row"><td className="print-price-label">Discount</td><td className="print-price-value">− {inr(optA.discount)}</td></tr>}
                  </tbody>
                  <tfoot>
                    <tr className="print-total-row">
                      <td className="print-price-label">On-Road Price</td>
                      <td className="print-price-value print-total-value">{inr(optA.finalPrice)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Option B */}
              <div className="print-option-card">
                <span className="print-option-badge">Option B</span>
                <div className="print-vehicle-name">{optB.name}</div>
                {optB.engineCc && (
                  <div className="print-field">
                    <span className="print-label">Specs</span>
                    <span className="print-value">{[optB.engineCc ? `${optB.engineCc} cc` : "", optB.fuelType, optB.transmission].filter(Boolean).join(" · ")}</span>
                  </div>
                )}
                {optB.offerTitle && (
                  <div className="print-field">
                    <span className="print-label">Offer</span>
                    <span className="print-value">{optB.offerTitle}</span>
                  </div>
                )}

                <table className="print-price-table" style={{ marginTop: "6px" }}>
                  <tbody>
                    <tr><td className="print-price-label">Ex-showroom</td><td className="print-price-value">{inr(optB.basePrice)}</td></tr>
                    <tr><td className="print-price-label">Insurance</td><td className="print-price-value">{inr(optB.insurance)}</td></tr>
                    <tr><td className="print-price-label">RTO / Road Tax</td><td className="print-price-value">{inr(optB.rto)}</td></tr>
                    <tr><td className="print-price-label">Accessories &amp; Items</td><td className="print-price-value">{inr(optB.accessories)}</td></tr>
                    {optB.otherCharges > 0 && <tr><td className="print-price-label">Other Charges</td><td className="print-price-value">{inr(optB.otherCharges)}</td></tr>}
                    {optB.discount > 0 && <tr className="print-discount-row"><td className="print-price-label">Discount</td><td className="print-price-value">− {inr(optB.discount)}</td></tr>}
                  </tbody>
                  <tfoot>
                    <tr className="print-total-row">
                      <td className="print-price-label">On-Road Price</td>
                      <td className="print-price-value print-total-value">{inr(optB.finalPrice)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        ) : (
          /* Single Vehicle Print Layout */
          <>
            <div className="print-section">
              <div className="print-section-title">Vehicle</div>
              <div className="print-vehicle-name">{optA.name}</div>
              {q.variant && (
                <div style={{ display: "flex", gap: "20px", marginTop: "4px" }}>
                  {q.variant.fuel_type && <div className="print-field"><span className="print-label">Fuel</span><span className="print-value">{q.variant.fuel_type}</span></div>}
                  {q.variant.transmission && <div className="print-field"><span className="print-label">Transmission</span><span className="print-value">{q.variant.transmission}</span></div>}
                  {q.variant.engine_cc && <div className="print-field"><span className="print-label">Engine</span><span className="print-value">{q.variant.engine_cc} cc</span></div>}
                  {q.offer && <div className="print-field"><span className="print-label">Offer</span><span className="print-value">{q.offer.title}</span></div>}
                </div>
              )}
            </div>

            <div className="print-divider" />

            <div className="print-pricing-block">
              <div className="print-section-title">Price Breakdown</div>
              <table className="print-price-table">
                <tbody>
                  <tr><td className="print-price-label">Ex-showroom Price</td><td className="print-price-value">{inr(optA.basePrice)}</td></tr>
                  <tr><td className="print-price-label">Insurance</td><td className="print-price-value">{inr(optA.insurance)}</td></tr>
                  <tr><td className="print-price-label">RTO / Road Tax</td><td className="print-price-value">{inr(optA.rto)}</td></tr>
                  <tr><td className="print-price-label">Accessories &amp; Items</td><td className="print-price-value">{inr(optA.accessories)}</td></tr>
                  {optA.otherCharges > 0 && <tr><td className="print-price-label">Other Charges</td><td className="print-price-value">{inr(optA.otherCharges)}</td></tr>}
                  {optA.discount > 0 && <tr className="print-discount-row"><td className="print-price-label">Discount</td><td className="print-price-value">− {inr(optA.discount)}</td></tr>}
                  {(q.items ?? []).filter((it) => it.item_type !== "VEHICLE_OPTION").map((item) => (
                    <tr key={item.id}>
                      <td className="print-price-label print-label-indent">{item.item_name}{item.quantity > 1 ? ` ×${item.quantity}` : ""}</td>
                      <td className="print-price-value">{inr(num(item.total_price))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="print-total-row">
                    <td className="print-price-label">Total On-Road Price</td>
                    <td className="print-price-value print-total-value">{inr(optA.finalPrice)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}

        <div className="print-divider" />

        {/* Terms */}
        <div className="print-terms">
          <div className="print-section-title">Terms &amp; Conditions</div>
          <ul className="print-terms-list">
            <li>This quotation is valid until the date mentioned above and is subject to availability.</li>
            <li>Prices are indicative and may vary based on RTO registration, insurance charges, and applicable taxes.</li>
            {q.payment_mode === "FINANCE" && (
              <li>Finance is subject to the applicant's credit profile and lender approval.</li>
            )}
            <li>This document is computer-generated and does not constitute a binding agreement.</li>
          </ul>
        </div>

        {/* Footer */}
        <div className="print-footer">
          <div>
            <span className="print-label">Prepared by</span>
            <span className="print-value">{salesExec}</span>
          </div>
          <div className="print-footer-note">
            Thank you for visiting our showroom. For queries, contact your sales executive.
          </div>
        </div>
      </div>
    </div>
  );
}
