import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Check, Mic, Search, Plus, Loader2, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { buildQuotationPdf, downloadBlob } from "@/lib/pdf";
import { buildWhatsAppMessage, sendWhatsApp } from "@/lib/whatsapp";
import { listCustomers, upsertCustomer, listVehicles, Customer, Vehicle } from "@/services/repository";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/quotations/new")({
  head: () => ({ meta: [{ title: "New Quotation — QuoteSpeak" }] }),
  component: NewQuotationPage,
});

interface QuotationItemData {
  vehicle: Vehicle;
  exShowroom: number;
  rto: number;
  insurance: number;
  accessories: number;
  otherCharges: number;
  discount: number;
}

function NewQuotationPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  
  // Step 1: Customer State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: "", phone: "", city: "" });
  const [isListening, setIsListening] = useState(false);

  // Step 2 & 3: Model & Pricing State
  const [items, setItems] = useState<QuotationItemData[]>([]);

  // Queries
  const { data: customers = [], isLoading: isLoadingCustomers } = useQuery({
    queryKey: ["customers", searchQuery],
    queryFn: () => listCustomers(searchQuery),
  });

  const { data: vehicles = [], isLoading: isLoadingVehicles } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => listVehicles(),
  });

  const saveCustomerMutation = useMutation({
    mutationFn: (values: { name: string; phone: string; city?: string }) => upsertCustomer(values),
    onSuccess: (data) => {
      toast.success("Customer saved successfully!");
      setSelectedCustomer(data);
      setIsCreatingCustomer(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save customer");
    }
  });

  // Handle Voice Input
  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition is not supported in this browser. Please type manually.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (e: any) => {
      console.error(e);
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
        extractedCity = text.substring(phoneMatch.index + phoneMatch[0].length).replace(/from|in|at/gi, '').trim();
    }
    extractedName = extractedName.replace(/name is|my name is/gi, '').trim();

    setCustomerForm(prev => ({
        ...prev,
        name: extractedName || prev.name,
        phone: extractedPhone || prev.phone,
        city: extractedCity || prev.city
    }));
    
    setIsCreatingCustomer(true);
    toast.success("Voice input processed. Please verify the details.");
  };

  const handleSaveCustomer = () => {
    if (!customerForm.name || !customerForm.phone) {
      toast.error("Name and Phone are required.");
      return;
    }
    saveCustomerMutation.mutate(customerForm);
  };

  const toggleVehicle = (v: Vehicle) => {
    const exists = items.find(i => i.vehicle.id === v.id);
    if (exists) {
      setItems(items.filter(i => i.vehicle.id !== v.id));
    } else {
      if (items.length >= 2) {
        toast.error("You can select a maximum of two models.");
        return;
      }
      setItems([...items, {
        vehicle: v,
        exShowroom: v.ex_showroom_price,
        rto: v.rto || 0,
        insurance: v.insurance || 0,
        accessories: 0,
        otherCharges: 0,
        discount: 0
      }]);
    }
  };

  const updateItem = (index: number, field: keyof QuotationItemData, value: number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const calculateTotal = (item: QuotationItemData) => {
    const grossTotal = item.exShowroom + item.rto + item.insurance + item.accessories + item.otherCharges;
    return grossTotal - item.discount;
  };

  const handleSaveQuotation = async () => {
    if (!selectedCustomer || items.length === 0) return;

    try {
      // Create primary quotation record
      const qtNumber = `QT-${Math.floor(1000 + Math.random() * 9000)}`;
      const grandTotal = items.reduce((acc, item) => acc + calculateTotal(item), 0);

      // We maintain vehicle_id for backward compatibility with dashboard
      // We will pick the first selected model's vehicle_id
      const primaryVehicleId = items[0].vehicle.id;

      const { data: qtData, error: qtError } = await supabase.from('quotations').insert({
        quotation_number: qtNumber,
        customer_id: selectedCustomer.id,
        vehicle_id: primaryVehicleId, // Fallback for old schema
        status: 'draft',
        total_amount: grandTotal,
        ex_showroom: items[0].exShowroom, // Keep old columns alive for now
        rto: items[0].rto,
        insurance: items[0].insurance,
        accessories_total: items[0].accessories,
        discount: items[0].discount,
      }).select().single();

      if (qtError) throw qtError;

      // Create quotation items
      const qtItemsToInsert = items.map(item => ({
        quotation_id: qtData.id,
        vehicle_id: item.vehicle.id,
        model_name_snapshot: `${item.vehicle.brand} ${item.vehicle.model}`,
        variant_snapshot: item.vehicle.variant,
        ex_showroom: item.exShowroom,
        rto: item.rto,
        insurance: item.insurance,
        accessories: item.accessories,
        other_charges: item.otherCharges,
        discount: item.discount,
        total: calculateTotal(item)
      }));

      const { error: itemsError } = await supabase.from('quotation_items').insert(qtItemsToInsert);
      if (itemsError) throw itemsError;

      // Generate PDF
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 7);

      const blob = await buildQuotationPdf({
        quotationNumber: qtNumber,
        createdAt: new Date().toISOString(),
        validUntil: validUntil.toISOString(),
        dealership: {
          name: "QuoteSpeak Dealership",
          phone: "+91 800 555 1234",
          address: "123 Dealership Road, Tech City",
        },
        customer: { name: selectedCustomer.name, phone: selectedCustomer.phone, city: selectedCustomer.city || "" },
        // Use first vehicle for now in PDF if it's the old schema, 
        // ideally we would rewrite buildQuotationPdf to accept multiple items
        vehicle: { brand: items[0].vehicle.brand, model: items[0].vehicle.model, variant: items[0].vehicle.variant, color: items[0].vehicle.color },
        accessories: [],
        pricing: {
          exShowroom: items[0].exShowroom,
          insurance: items[0].insurance,
          rto: items[0].rto,
          accessoriesTotal: items[0].accessories,
          gstAmount: 0,
          discount: items[0].discount,
          totalAmount: calculateTotal(items[0]),
        },
        finance: { downPayment: 0, loanAmount: 0, interestRate: 0, tenureMonths: 0, emi: 0, totalInterest: 0 },
        executive: "Sales Executive",
        terms: "1. Quotation valid for 7 days.\n2. Prices subject to change without prior notice.",
        bookingLink: "http://localhost:8080",
      });

      downloadBlob(blob, `${qtNumber}.pdf`);

      // WhatsApp Delivery
      const message = buildWhatsAppMessage({
        customerName: selectedCustomer.name,
        quotationNumber: qtNumber,
        vehicle: `${items[0].vehicle.brand} ${items[0].vehicle.model} ${items[0].vehicle.variant}`,
        onRoadPrice: calculateTotal(items[0]),
        emi: 0,
        tenureMonths: 0,
        dealershipName: "QuoteSpeak Dealership",
        validUntil: validUntil.toISOString(),
      });

      sendWhatsApp(selectedCustomer.phone, message);
      toast.success("Quotation generated & WhatsApp sent successfully!");
      
      // Update status to sent
      await supabase.from('quotations').update({ status: 'sent' }).eq('id', qtData.id);

      navigate({ to: "/quotations" });
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to generate quotation: " + err.message);
    }
  };

  const handleNext = () => {
    if (step === 1 && !selectedCustomer) {
      toast.error("Please select or save a customer first.");
      return;
    }
    if (step === 2 && items.length === 0) {
      toast.error("Please select at least one model.");
      return;
    }
    setStep((s) => Math.min(s + 1, 4));
  };
  const handlePrev = () => setStep((s) => Math.max(s - 1, 1));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader title="Create Quotation" description="Step-by-step dealership quotation flow." />
      
      <div className="flex justify-between items-center mb-8 relative">
        <div className="absolute left-0 top-1/2 w-full h-1 bg-muted -z-10 -translate-y-1/2 rounded-full" />
        <div className="absolute left-0 top-1/2 h-1 bg-primary -z-10 -translate-y-1/2 rounded-full transition-all" style={{ width: `${((step - 1) / 3) * 100}%` }} />
        {['Customer', 'Models', 'Pricing', 'Preview'].map((s, i) => (
          <div key={s} className={`flex flex-col items-center ${step >= i + 1 ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-2 transition-colors ${step >= i + 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              {step > i + 1 ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <span className="text-xs font-medium">{s}</span>
          </div>
        ))}
      </div>

      <Card className="rounded-2xl shadow-sm border-border">
        <CardContent className="p-6 min-h-[400px]">
          {/* STEP 1: CUSTOMER */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-up">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Identify Customer</h2>
                <Button 
                  type="button"
                  variant={isListening ? "destructive" : "secondary"} 
                  onClick={handleVoiceInput}
                  className="gap-2 rounded-full"
                >
                  <Mic className={`w-4 h-4 ${isListening ? 'animate-pulse' : ''}`} />
                  {isListening ? "Listening..." : "Voice Input"}
                </Button>
              </div>

              {!isCreatingCustomer ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input 
                      placeholder="Search by name or phone..." 
                      className="pl-9"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  
                  <div className="grid gap-3 max-h-[300px] overflow-y-auto">
                    {isLoadingCustomers && <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>}
                    {!isLoadingCustomers && customers.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>No customers found.</p>
                        <Button 
                          variant="outline" 
                          className="mt-4 gap-2"
                          onClick={() => setIsCreatingCustomer(true)}
                        >
                          <Plus className="w-4 h-4" /> Create New Customer
                        </Button>
                      </div>
                    )}
                    {customers.map((c) => (
                      <label key={c.id} className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${selectedCustomer?.id === c.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                        <input type="radio" name="customer" checked={selectedCustomer?.id === c.id} onChange={() => setSelectedCustomer(c)} className="w-4 h-4 text-primary" />
                        <div>
                          <p className="font-medium">{c.name}</p>
                          <p className="text-sm text-muted-foreground">{c.phone} {c.city ? `· ${c.city}` : ''}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              ) : (
                <div className="space-y-4 bg-muted/20 p-6 rounded-xl border">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-medium">New Customer Details</h3>
                    <Button variant="ghost" size="sm" onClick={() => setIsCreatingCustomer(false)}>Cancel</Button>
                  </div>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label>Full Name *</Label>
                      <Input 
                        value={customerForm.name} 
                        onChange={(e) => setCustomerForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g. John Doe"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number *</Label>
                      <Input 
                        value={customerForm.phone} 
                        onChange={(e) => setCustomerForm(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="10-digit number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>City / Address</Label>
                      <Input 
                        value={customerForm.city} 
                        onChange={(e) => setCustomerForm(prev => ({ ...prev, city: e.target.value }))}
                        placeholder="Optional"
                      />
                    </div>
                    <Button 
                      onClick={handleSaveCustomer} 
                      disabled={saveCustomerMutation.isPending}
                      className="w-full mt-2"
                    >
                      {saveCustomerMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Verify & Save Customer
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: SELECT MODELS */}
          {step === 2 && (
            <div className="space-y-6 animate-fade-up">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Select Models (Max 2)</h2>
                <span className="text-sm text-muted-foreground bg-muted px-3 py-1 rounded-full">{items.length} / 2 Selected</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {isLoadingVehicles && <p>Loading models...</p>}
                {vehicles.map((v) => {
                  const isSelected = !!items.find(i => i.vehicle.id === v.id);
                  return (
                    <label key={v.id} className={`flex flex-col gap-2 p-4 border rounded-xl cursor-pointer transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                      <div className="flex justify-between items-start">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleVehicle(v)} className="w-4 h-4 text-primary mt-1 rounded" />
                        <span className={`text-xs px-2 py-1 rounded-full ${v.stock > 0 ? 'bg-success/20 text-success-foreground' : 'bg-warning/20 text-warning-foreground'}`}>
                          {v.stock > 0 ? 'Available' : 'Out of Stock'}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-lg">{v.brand} {v.model}</p>
                        <p className="text-sm text-muted-foreground">{v.variant} · {v.color}</p>
                        <p className="font-medium mt-2">₹{v.ex_showroom_price.toLocaleString('en-IN')}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3: PRICING */}
          {step === 3 && (
            <div className="space-y-6 animate-fade-up">
              <h2 className="text-xl font-semibold">Price Breakdown</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {items.map((item, idx) => (
                  <div key={item.vehicle.id} className="p-5 border rounded-2xl bg-card shadow-sm space-y-4">
                    <div className="flex justify-between items-center pb-3 border-b">
                      <div>
                        <h3 className="font-bold text-lg">{item.vehicle.model}</h3>
                        <p className="text-xs text-muted-foreground">{item.vehicle.variant}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => toggleVehicle(item.vehicle)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between text-sm items-center">
                        <span className="text-muted-foreground">Ex-Showroom</span>
                        <span className="font-medium">₹{item.exShowroom.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-sm items-center gap-4">
                        <Label className="text-muted-foreground whitespace-nowrap">RTO</Label>
                        <Input type="number" className="w-32 h-8 text-right" value={item.rto} onChange={(e) => updateItem(idx, 'rto', Number(e.target.value))} />
                      </div>
                      <div className="flex justify-between text-sm items-center gap-4">
                        <Label className="text-muted-foreground whitespace-nowrap">Insurance</Label>
                        <Input type="number" className="w-32 h-8 text-right" value={item.insurance} onChange={(e) => updateItem(idx, 'insurance', Number(e.target.value))} />
                      </div>
                      <div className="flex justify-between text-sm items-center gap-4">
                        <Label className="text-muted-foreground whitespace-nowrap">Accessories</Label>
                        <Input type="number" className="w-32 h-8 text-right" value={item.accessories} onChange={(e) => updateItem(idx, 'accessories', Number(e.target.value))} />
                      </div>
                      <div className="flex justify-between text-sm items-center gap-4">
                        <Label className="text-muted-foreground whitespace-nowrap">Other Charges</Label>
                        <Input type="number" className="w-32 h-8 text-right" value={item.otherCharges} onChange={(e) => updateItem(idx, 'otherCharges', Number(e.target.value))} />
                      </div>
                      <div className="flex justify-between text-sm items-center gap-4">
                        <Label className="text-muted-foreground whitespace-nowrap">Discount</Label>
                        <Input type="number" className="w-32 h-8 text-right text-success border-success" value={item.discount} onChange={(e) => updateItem(idx, 'discount', Number(e.target.value))} />
                      </div>
                    </div>

                    <div className="pt-3 border-t flex justify-between items-center">
                      <span className="font-bold text-lg text-primary">On-Road</span>
                      <span className="font-bold text-xl text-primary">₹{calculateTotal(item).toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4: PREVIEW */}
          {step === 4 && (
            <div className="space-y-6 animate-fade-up max-w-2xl mx-auto">
              <h2 className="text-2xl font-semibold text-center text-primary mb-6">Quotation Preview</h2>
              
              <div className="bg-muted/30 p-6 rounded-2xl border space-y-6">
                <div className="flex justify-between items-center border-b pb-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Customer</p>
                    <p className="font-medium text-lg mt-1">{selectedCustomer?.name}</p>
                    <p className="text-sm text-muted-foreground">{selectedCustomer?.phone}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Date</p>
                    <p className="font-medium mt-1">{new Date().toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Selected Models</p>
                  {items.map((item) => (
                    <div key={item.vehicle.id} className="bg-background border rounded-xl p-4">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-bold">{item.vehicle.brand} {item.vehicle.model}</h4>
                        <span className="font-bold text-primary">₹{calculateTotal(item).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                        <div className="flex justify-between"><span className="opacity-70">Ex-Showroom:</span> <span>₹{item.exShowroom.toLocaleString('en-IN')}</span></div>
                        <div className="flex justify-between"><span className="opacity-70">RTO:</span> <span>₹{item.rto.toLocaleString('en-IN')}</span></div>
                        <div className="flex justify-between"><span className="opacity-70">Insurance:</span> <span>₹{item.insurance.toLocaleString('en-IN')}</span></div>
                        <div className="flex justify-between"><span className="opacity-70">Accessories:</span> <span>₹{item.accessories.toLocaleString('en-IN')}</span></div>
                        <div className="flex justify-between"><span className="opacity-70">Other:</span> <span>₹{item.otherCharges.toLocaleString('en-IN')}</span></div>
                        <div className="flex justify-between"><span className="opacity-70">Discount:</span> <span className="text-success">-₹{item.discount.toLocaleString('en-IN')}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </CardContent>
        <div className="px-6 py-4 border-t bg-muted/20 flex justify-between rounded-b-2xl">
          <Button variant="outline" onClick={handlePrev} disabled={step === 1}>
            <ChevronLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          {step < 4 ? (
            <Button onClick={handleNext}>
              Next <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleSaveQuotation} className="bg-success text-success-foreground hover:bg-success/90">
              Confirm & Generate
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
