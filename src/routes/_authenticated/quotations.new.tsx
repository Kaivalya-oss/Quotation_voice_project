import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Mic,
  Search,
  Plus,
  Loader2,
  FileCheck,
  Percent,
} from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { api } from "@/lib/api";
import { inr } from "@/lib/finance";
import { downloadBlob } from "@/lib/pdf";
import {
  createQuotation,
  downloadQuotationPdf,
  sendQuotationWhatsApp,
} from "@/services/repository";
import type {
  BackendCustomerResponse,
  BackendVariantResponse,
  BackendAccessoryResponse,
  BackendOfferResponse,
  WhatsAppDispatchResponse,
} from "@/lib/quotation-types";

export const Route = createFileRoute("/_authenticated/quotations/new")({
  head: () => ({ meta: [{ title: "New Quotation — VoiceQuote AI" }] }),
  component: NewQuotationPage,
});

function NewQuotationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);

  // Step 1: Customer State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<BackendCustomerResponse | null>(null);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState({ full_name: "", phone: "", city: "" });
  const [isListening, setIsListening] = useState(false);

  // Step 2: Vehicle Variant State
  const [selectedVariant, setSelectedVariant] = useState<BackendVariantResponse | null>(null);

  // Step 3: Accessories, Offers & Finance State
  const [selectedAccessoryIds, setSelectedAccessoryIds] = useState<number[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<number | null>(null);
  const [downPayment, setDownPayment] = useState<number>(0);
  const [loanTenure, setLoanTenure] = useState<number>(36);
  const [interestRate, setInterestRate] = useState<number>(9.5);
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Fetch Customers from FastAPI
  const { data: customerItems = [], isLoading: isLoadingCustomers } = useQuery({
    queryKey: ["fastapi-customers", searchQuery],
    queryFn: async () => {
      const res = await api.get<{ items: BackendCustomerResponse[] }>(
        `/api/v1/customers?page_size=50${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""}`,
      );
      return res.items ?? [];
    },
  });

  // Fetch Variants from FastAPI
  const { data: variantItems = [], isLoading: isLoadingVariants } = useQuery({
    queryKey: ["fastapi-variants"],
    queryFn: async () => {
      const res = await api.get<{ items: BackendVariantResponse[] }>(
        "/api/v1/vehicles?page_size=50&status=ACTIVE",
      );
      return res.items ?? [];
    },
  });

  // Fetch Standard Accessories Catalog
  const { data: accessories = [] } = useQuery({
    queryKey: ["fastapi-accessories"],
    queryFn: async () => {
      return await api.get<BackendAccessoryResponse[]>("/api/v1/vehicles/catalog/accessories");
    },
  });

  // Fetch Active Promotional Offers
  const { data: offers = [] } = useQuery({
    queryKey: ["fastapi-offers"],
    queryFn: async () => {
      return await api.get<BackendOfferResponse[]>("/api/v1/offers?active_only=true");
    },
  });

  // Quick Customer Creation
  const saveCustomerMutation = useMutation({
    mutationFn: async (values: { full_name: string; phone: string; city?: string }) => {
      return await api.post<BackendCustomerResponse>("/api/v1/customers", values);
    },
    onSuccess: (data) => {
      toast.success("Customer saved successfully!");
      setSelectedCustomer(data);
      setIsCreatingCustomer(false);
      queryClient.invalidateQueries({ queryKey: ["fastapi-customers"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save customer");
    },
  });

  // Voice Input Speech Recognition
  const handleVoiceInput = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      parseTranscriptToForm(transcript);
    };
    recognition.start();
  };

  const parseTranscriptToForm = (text: string) => {
    const phoneMatch = text.match(/(?:\+91|91)?[-\s]?(\d{10})/);
    let extractedPhone = phoneMatch ? phoneMatch[1] : "";
    let extractedName = text;
    if (phoneMatch && phoneMatch.index !== undefined) {
      extractedName = text.substring(0, phoneMatch.index).trim();
    }
    let extractedCity = "";
    if (phoneMatch && phoneMatch.index !== undefined) {
      extractedCity = text
        .substring(phoneMatch.index + phoneMatch[0].length)
        .replace(/from|in|at/gi, "")
        .trim();
    }
    extractedName = extractedName.replace(/name is|my name is/gi, "").trim();

    setCustomerForm({
      full_name: extractedName || customerForm.full_name,
      phone: extractedPhone || customerForm.phone,
      city: extractedCity || customerForm.city,
    });

    setIsCreatingCustomer(true);
    toast.success("Voice input processed. Please verify details.");
  };

  const handleSaveCustomer = () => {
    if (!customerForm.full_name || !customerForm.phone) {
      toast.error("Name and Phone are required.");
      return;
    }
    saveCustomerMutation.mutate(customerForm);
  };

  const toggleAccessory = (id: number) => {
    setSelectedAccessoryIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  // Preview Estimated Calculation (for immediate visual feedback before authoritative backend response)
  const calculateEstimatedTotal = () => {
    if (!selectedVariant) return 0;
    const base = Number(selectedVariant.ex_showroom_price) || 0;
    const insurance = Number(selectedVariant.insurance_price) || 0;
    const rto = Number(selectedVariant.rto_price) || 0;
    const accTotal = accessories
      .filter((a) => selectedAccessoryIds.includes(a.id))
      .reduce((sum, a) => sum + Number(a.price), 0);

    let discount = 0;
    const selectedOffer = offers.find((o) => o.id === selectedOfferId);
    if (selectedOffer) {
      if (selectedOffer.discount_type === "PERCENTAGE") {
        discount = (base * Number(selectedOffer.discount_value)) / 100;
      } else {
        discount = Math.min(Number(selectedOffer.discount_value), base);
      }
    }

    return Math.max(0, base + insurance + rto + accTotal - discount);
  };

  const handleNext = () => {
    if (step === 1 && !selectedCustomer) {
      toast.error("Please select or create a customer.");
      return;
    }
    if (step === 2 && !selectedVariant) {
      toast.error("Please select a vehicle model.");
      return;
    }
    setStep((s) => s + 1);
  };

  const handlePrev = () => setStep((s) => Math.max(1, s - 1));

  // Authoritative Backend Quotation Generation
  const handleSaveQuotation = async () => {
    if (!selectedCustomer) {
      toast.error("Customer is required.");
      return;
    }
    if (!selectedVariant) {
      toast.error("Vehicle variant is required.");
      return;
    }

    setSubmitting(true);
    try {
      const quote = await createQuotation({
        customer_id: selectedCustomer.id,
        variant_id: selectedVariant.id,
        accessory_ids: selectedAccessoryIds,
        offer_id: selectedOfferId,
        down_payment: Number(downPayment) || 0,
        loan_tenure: Number(loanTenure) || 36,
        interest_rate: Number(interestRate) || 9.5,
        notes: notes.trim() || null,
      });

      toast.success(
        `Quotation ${quote.quotation_number} generated! Final: ${inr(Number(quote.final_price))}`,
      );

      // 1. Download authoritative backend PDF
      try {
        const blob = await downloadQuotationPdf(quote.id);
        downloadBlob(blob, `${quote.quotation_number}.pdf`);
      } catch (pdfErr) {
        console.warn("Backend PDF auto-download:", pdfErr);
      }

      // 2. Dispatch via WhatsApp service
      try {
        const waRes = (await sendQuotationWhatsApp(quote.id)) as WhatsAppDispatchResponse;
        if (waRes && waRes.status === "MOCK_SENT") {
          toast.info(
            `WhatsApp simulated for ${selectedCustomer.full_name}: ${waRes.note ?? "Recorded in dev mode"}`,
          );
        } else {
          toast.success("Quotation sent via WhatsApp!");
        }
      } catch (waErr) {
        console.warn("WhatsApp dispatch:", waErr);
      }

      // Invalidate quotations list query
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
      navigate({ to: "/quotations" });
    } catch (err: any) {
      toast.error(err.message || "Failed to generate quotation.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-up max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Create New Quotation"
        description="Generate official dealership quotations with automated pricing & PDF generation."
      />

      {/* Progress Steps Header */}
      <div className="flex justify-between items-center bg-card p-4 rounded-2xl border shadow-sm">
        {[
          { num: 1, title: "Customer" },
          { num: 2, title: "Vehicle" },
          { num: 3, title: "Accessories & Finance" },
          { num: 4, title: "Preview & Generate" },
        ].map((s) => (
          <div key={s.num} className="flex items-center gap-2">
            <span
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                step === s.num
                  ? "bg-primary text-primary-foreground shadow"
                  : step > s.num
                    ? "bg-success text-success-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {s.num}
            </span>
            <span className="hidden sm:inline text-sm font-medium">{s.title}</span>
          </div>
        ))}
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          {/* STEP 1: CUSTOMER SELECTION */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-up">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Select or Add Customer</h2>
                <Button
                  type="button"
                  variant={isListening ? "destructive" : "secondary"}
                  onClick={handleVoiceInput}
                  className="gap-2 rounded-full"
                >
                  <Mic className={`w-4 h-4 ${isListening ? "animate-pulse" : ""}`} />
                  {isListening ? "Listening..." : "Voice Input"}
                </Button>
              </div>

              {!isCreatingCustomer ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      placeholder="Search by customer name or phone..."
                      className="pl-9"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <div className="grid gap-3 max-h-[300px] overflow-y-auto">
                    {isLoadingCustomers && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Loading customers...
                      </p>
                    )}
                    {!isLoadingCustomers && customerItems.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>No customers found.</p>
                        <Button
                          variant="outline"
                          className="mt-4 gap-2 rounded-full"
                          onClick={() => setIsCreatingCustomer(true)}
                        >
                          <Plus className="w-4 h-4" /> Add New Customer
                        </Button>
                      </div>
                    )}
                    {customerItems.map((c) => (
                      <label
                        key={c.id}
                        className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
                          selectedCustomer?.id === c.id
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="customer"
                          checked={selectedCustomer?.id === c.id}
                          onChange={() => setSelectedCustomer(c)}
                          className="w-4 h-4 text-primary"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-foreground">{c.full_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {c.phone} {c.city ? `· ${c.city}` : ""}
                          </p>
                        </div>
                        <Badge variant="outline">ID #{c.id}</Badge>
                      </label>
                    ))}
                  </div>

                  <div className="pt-2">
                    <Button
                      variant="outline"
                      className="gap-2 rounded-full"
                      onClick={() => setIsCreatingCustomer(true)}
                    >
                      <Plus className="w-4 h-4" /> Add New Customer
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-4 bg-muted/20 p-6 rounded-xl border">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-medium">New Customer Details</h3>
                    <Button variant="ghost" size="sm" onClick={() => setIsCreatingCustomer(false)}>
                      Cancel
                    </Button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Full Name *</Label>
                      <Input
                        value={customerForm.full_name}
                        onChange={(e) =>
                          setCustomerForm((prev) => ({ ...prev, full_name: e.target.value }))
                        }
                        placeholder="e.g. Rahul Sharma"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number *</Label>
                      <Input
                        value={customerForm.phone}
                        onChange={(e) =>
                          setCustomerForm((prev) => ({ ...prev, phone: e.target.value }))
                        }
                        placeholder="10-digit mobile number"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>City / Address</Label>
                    <Input
                      value={customerForm.city}
                      onChange={(e) =>
                        setCustomerForm((prev) => ({ ...prev, city: e.target.value }))
                      }
                      placeholder="e.g. Mumbai"
                    />
                  </div>
                  <Button
                    onClick={handleSaveCustomer}
                    disabled={saveCustomerMutation.isPending}
                    className="w-full mt-2 rounded-full"
                  >
                    {saveCustomerMutation.isPending && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Save Customer
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: VEHICLE VARIANT SELECTION */}
          {step === 2 && (
            <div className="space-y-6 animate-fade-up">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Select Vehicle Model / Variant</h2>
                {selectedVariant && (
                  <Badge variant="secondary" className="font-semibold text-primary">
                    {selectedVariant.name}
                  </Badge>
                )}
              </div>

              {isLoadingVariants && (
                <p className="text-sm text-muted-foreground text-center py-4">Loading models...</p>
              )}
              <div className="grid sm:grid-cols-2 gap-4">
                {variantItems.map((v) => {
                  const isSelected = selectedVariant?.id === v.id;
                  return (
                    <label
                      key={v.id}
                      className={`flex flex-col gap-2 p-5 border rounded-2xl cursor-pointer transition-all ${
                        isSelected
                          ? "border-primary ring-2 ring-primary/20 bg-primary/5 shadow"
                          : "hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <input
                          type="radio"
                          name="variant"
                          checked={isSelected}
                          onChange={() => setSelectedVariant(v)}
                          className="w-4 h-4 text-primary mt-1"
                        />
                        <Badge
                          variant="secondary"
                          className={
                            v.status === "ACTIVE"
                              ? "bg-success/15 text-success"
                              : "bg-muted text-muted-foreground"
                          }
                        >
                          {v.status}
                        </Badge>
                      </div>
                      <div>
                        <p className="font-bold text-lg text-foreground">{v.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {v.model?.brand?.name} {v.model?.name} · {v.transmission}
                        </p>
                        <div className="mt-3 pt-3 border-t flex justify-between items-baseline">
                          <span className="text-xs text-muted-foreground">Ex-Showroom:</span>
                          <span className="font-semibold text-base">
                            {inr(Number(v.ex_showroom_price))}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3: ACCESSORIES, OFFERS & FINANCE */}
          {step === 3 && (
            <div className="space-y-6 animate-fade-up">
              <h2 className="text-xl font-semibold">Accessories, Offers & Finance</h2>

              {/* Standard Accessories */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Standard Accessories (Optional)</Label>
                <div className="grid sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto p-1">
                  {accessories.map((acc) => {
                    const checked = selectedAccessoryIds.includes(acc.id);
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
                            onCheckedChange={() => toggleAccessory(acc.id)}
                          />
                          <span className="text-sm font-medium">{acc.name}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {inr(Number(acc.price))}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Applicable Offers */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Promotional Offer (Optional)</Label>
                <Select
                  value={selectedOfferId ? String(selectedOfferId) : "none"}
                  onValueChange={(val) => setSelectedOfferId(val === "none" ? null : Number(val))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select promotional discount" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No offer / standard pricing</SelectItem>
                    {offers.map((off) => (
                      <SelectItem key={off.id} value={String(off.id)}>
                        {off.title} (
                        {off.discount_type === "PERCENTAGE"
                          ? `${off.discount_value}% off`
                          : `Flat ₹${Number(off.discount_value).toLocaleString("en-IN")}`}
                        )
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Finance Options */}
              <div className="space-y-3 pt-2 border-t">
                <Label className="text-base font-medium">Financing / Loan Details</Label>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="down_payment">Down Payment (₹)</Label>
                    <Input
                      id="down_payment"
                      type="number"
                      min={0}
                      value={downPayment}
                      onChange={(e) => setDownPayment(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="loan_tenure">Tenure (Months)</Label>
                    <Select
                      value={String(loanTenure)}
                      onValueChange={(val) => setLoanTenure(Number(val))}
                    >
                      <SelectTrigger id="loan_tenure">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0 (Full Cash / No Loan)</SelectItem>
                        <SelectItem value="12">12 Months (1 Year)</SelectItem>
                        <SelectItem value="24">24 Months (2 Years)</SelectItem>
                        <SelectItem value="36">36 Months (3 Years)</SelectItem>
                        <SelectItem value="48">48 Months (4 Years)</SelectItem>
                        <SelectItem value="60">60 Months (5 Years)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="interest_rate">Annual Interest Rate (%)</Label>
                    <Input
                      id="interest_rate"
                      type="number"
                      step="0.1"
                      min={0}
                      value={interestRate}
                      onChange={(e) => setInterestRate(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Additional Remarks / Notes</Label>
                <Input
                  id="notes"
                  placeholder="e.g. Customer interested in festival delivery"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Estimated Preview Notice */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex justify-between items-center">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    Estimated On-Road Total
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Authoritative price & EMI schedule are calculated directly by the backend.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-primary">
                    {inr(calculateEstimatedTotal())}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: PREVIEW & CONFIRM */}
          {step === 4 && (
            <div className="space-y-6 animate-fade-up max-w-2xl mx-auto">
              <h2 className="text-2xl font-semibold text-center text-primary">Quotation Summary</h2>

              <div className="bg-card p-6 rounded-2xl border space-y-6 shadow-sm">
                <div className="flex justify-between items-center border-b pb-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                      Customer
                    </p>
                    <p className="font-semibold text-lg text-foreground mt-1">
                      {selectedCustomer?.full_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedCustomer?.phone} {selectedCustomer?.city ? `· ${selectedCustomer.city}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                      Date
                    </p>
                    <p className="font-medium text-foreground mt-1">
                      {new Date().toLocaleDateString("en-IN")}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                    Selected Vehicle
                  </p>
                  <div className="bg-muted/30 border rounded-xl p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-bold text-base text-foreground">
                        {selectedVariant?.name}
                      </h4>
                      <Badge variant="outline">{selectedVariant?.transmission}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Ex-Showroom:</span>
                        <span className="font-medium text-foreground">
                          {inr(Number(selectedVariant?.ex_showroom_price))}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Insurance:</span>
                        <span className="font-medium text-foreground">
                          {inr(Number(selectedVariant?.insurance_price))}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>RTO:</span>
                        <span className="font-medium text-foreground">
                          {inr(Number(selectedVariant?.rto_price))}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Accessories:</span>
                        <span className="font-medium text-foreground">
                          {selectedAccessoryIds.length} item(s)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Finance Info */}
                <div className="space-y-2 border-t pt-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                    Financing Terms
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-sm text-muted-foreground">
                    <div>
                      <span className="block text-xs">Down Payment:</span>
                      <span className="font-medium text-foreground">{inr(downPayment)}</span>
                    </div>
                    <div>
                      <span className="block text-xs">Tenure:</span>
                      <span className="font-medium text-foreground">
                        {loanTenure > 0 ? `${loanTenure} Months` : "Cash Purchase"}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs">Interest Rate:</span>
                      <span className="font-medium text-foreground">{interestRate}% p.a.</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm text-success-foreground">
                  <div className="flex items-center gap-2 font-medium">
                    <FileCheck className="w-4 h-4 text-success" /> Backend PDF & WhatsApp
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Upon clicking Confirm, the backend will calculate the exact on-road price,
                    amortized monthly EMI, save the quotation record in PostgreSQL, and generate an
                    official PDF available for immediate download and WhatsApp delivery.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>

        <div className="px-6 py-4 border-t bg-muted/20 flex justify-between rounded-b-2xl">
          <Button variant="outline" onClick={handlePrev} disabled={step === 1 || submitting}>
            <ChevronLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          {step < 4 ? (
            <Button onClick={handleNext}>
              Next <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSaveQuotation}
              disabled={submitting}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating Quotation...
                </>
              ) : (
                "Confirm & Generate Quotation"
              )}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
