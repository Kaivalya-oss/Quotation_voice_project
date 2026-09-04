import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { customers, vehicles, inventory } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { buildQuotationPdf, downloadBlob } from "@/lib/pdf";
import { buildWhatsAppMessage, sendWhatsApp } from "@/lib/whatsapp";

export const Route = createFileRoute("/_authenticated/quotations/new")({
  head: () => ({ meta: [{ title: "New Quotation — QuoteSpeak" }] }),
  component: NewQuotationPage,
});

function NewQuotationPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState(customers[0].id);
  const [selectedVehicle, setSelectedVehicle] = useState(vehicles[0].id);
  const [rto, setRto] = useState(8000);
  const [insurance, setInsurance] = useState(5000);
  const [accessories, setAccessories] = useState(1500);
  const [discount, setDiscount] = useState(0);

  const [finance, setFinance] = useState(false);
  const [downPayment, setDownPayment] = useState(20000);
  const [interestRate, setInterestRate] = useState(9.5);
  const [tenure, setTenure] = useState(24);

  const vehicle = vehicles.find((v) => v.id === selectedVehicle)!;
  const exShowroom = vehicle?.exShowroomPrice || 0;
  const onRoadPrice = exShowroom + rto + insurance + accessories - discount;
  
  const loanAmount = finance ? onRoadPrice - downPayment : 0;
  const monthlyRate = interestRate / 12 / 100;
  const emi = finance && loanAmount > 0 ? 
    Math.round((loanAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / (Math.pow(1 + monthlyRate, tenure) - 1)) : 0;

  const handleNext = () => setStep((s) => Math.min(s + 1, 5));
  const handlePrev = () => setStep((s) => Math.max(s - 1, 1));

  const handleSave = async () => {
    const customer = customers.find(c => c.id === selectedCustomer)!;
    const qtNumber = `QT-${Math.floor(1000 + Math.random() * 9000)}`;
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 7);

    try {
      const blob = await buildQuotationPdf({
        quotationNumber: qtNumber,
        createdAt: new Date().toISOString(),
        validUntil: validUntil.toISOString(),
        dealership: {
          name: "QuoteSpeak Dealership",
          phone: "+91 800 555 1234",
          address: "123 Dealership Road, Tech City",
        },
        customer: { name: customer.name, phone: customer.mobile, city: customer.city },
        vehicle: { brand: vehicle.brand, model: vehicle.model, variant: vehicle.variant, color: vehicle.color },
        accessories: [],
        pricing: {
          exShowroom,
          insurance,
          rto,
          accessoriesTotal: accessories,
          gstAmount: 0,
          discount,
          totalAmount: onRoadPrice,
        },
        finance: {
          downPayment,
          loanAmount,
          interestRate,
          tenureMonths: tenure,
          emi,
          totalInterest: (emi * tenure) - loanAmount,
        },
        executive: "Sales Executive",
        terms: "1. Quotation valid for 7 days.\n2. Prices subject to change without prior notice.",
        bookingLink: "http://localhost:8080",
      });

      downloadBlob(blob, `${qtNumber}.pdf`);

      const message = buildWhatsAppMessage({
        customerName: customer.name,
        quotationNumber: qtNumber,
        vehicle: `${vehicle.brand} ${vehicle.model} ${vehicle.variant}`,
        onRoadPrice,
        emi,
        tenureMonths: tenure,
        dealershipName: "QuoteSpeak Dealership",
        validUntil: validUntil.toISOString(),
      });

      sendWhatsApp(customer.mobile, message);
      toast.success("Quotation generated & WhatsApp sent successfully!");
      navigate({ to: "/quotations" });
    } catch (err) {
      toast.error("Failed to generate quotation");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader title="Create Quotation" description="Step-by-step dealership quotation flow." />
      
      <div className="flex justify-between items-center mb-8 relative">
        <div className="absolute left-0 top-1/2 w-full h-1 bg-muted -z-10 -translate-y-1/2 rounded-full" />
        <div className="absolute left-0 top-1/2 h-1 bg-primary -z-10 -translate-y-1/2 rounded-full transition-all" style={{ width: `${((step - 1) / 4) * 100}%` }} />
        {['Customer', 'Vehicle', 'Pricing', 'Finance', 'Summary'].map((s, i) => (
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
          {step === 1 && (
            <div className="space-y-4 animate-fade-up">
              <h2 className="text-lg font-semibold">Select Customer</h2>
              <div className="grid gap-3">
                {customers.map((c) => (
                  <label key={c.id} className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${selectedCustomer === c.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                    <input type="radio" name="customer" checked={selectedCustomer === c.id} onChange={() => setSelectedCustomer(c.id)} className="w-4 h-4 text-primary" />
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-sm text-muted-foreground">{c.mobile} · {c.city}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-fade-up">
              <h2 className="text-lg font-semibold">Select Vehicle</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {vehicles.map((v) => {
                  const inv = inventory.find(i => i.vehicleId === v.id);
                  return (
                    <label key={v.id} className={`flex flex-col gap-2 p-4 border rounded-xl cursor-pointer transition-colors ${selectedVehicle === v.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                      <div className="flex justify-between items-start">
                        <input type="radio" name="vehicle" checked={selectedVehicle === v.id} onChange={() => setSelectedVehicle(v.id)} className="w-4 h-4 text-primary mt-1" />
                        <span className={`text-xs px-2 py-1 rounded-full ${inv?.status === 'Available' ? 'bg-success/20 text-success-foreground' : 'bg-warning/20 text-warning-foreground'}`}>
                          {inv?.status || 'Out of Stock'}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-lg">{v.brand} {v.model}</p>
                        <p className="text-sm text-muted-foreground">{v.variant} · {v.color}</p>
                        <p className="font-medium mt-2">₹{v.exShowroomPrice.toLocaleString('en-IN')}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-fade-up max-w-md mx-auto">
              <h2 className="text-lg font-semibold text-center">Pricing & Accessories</h2>
              <div className="space-y-4">
                <div className="flex justify-between font-medium">
                  <span>Ex-Showroom ({vehicle?.brand} {vehicle?.model})</span>
                  <span>₹{exShowroom.toLocaleString('en-IN')}</span>
                </div>
                <div className="space-y-2">
                  <Label>RTO & Registration</Label>
                  <Input type="number" value={rto} onChange={(e) => setRto(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Insurance (1 yr Comp + 5 yr TP)</Label>
                  <Input type="number" value={insurance} onChange={(e) => setInsurance(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Accessories Pack</Label>
                  <Input type="number" value={accessories} onChange={(e) => setAccessories(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Discount</Label>
                  <Input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="border-success" />
                </div>
                <div className="pt-4 border-t flex justify-between font-bold text-xl text-primary">
                  <span>On-Road Price</span>
                  <span>₹{onRoadPrice.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6 animate-fade-up max-w-md mx-auto">
              <h2 className="text-lg font-semibold text-center">Payment Method</h2>
              <div className="flex gap-4 p-1 bg-muted rounded-xl mb-6">
                <button onClick={() => setFinance(false)} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${!finance ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>Cash</button>
                <button onClick={() => setFinance(true)} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${finance ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground'}`}>Finance</button>
              </div>

              {finance ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Down Payment</Label>
                    <Input type="number" value={downPayment} onChange={(e) => setDownPayment(Number(e.target.value))} />
                  </div>
                  <div className="flex justify-between font-medium text-sm text-muted-foreground">
                    <span>Loan Amount</span>
                    <span>₹{loanAmount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Interest Rate (%)</Label>
                      <Input type="number" step="0.1" value={interestRate} onChange={(e) => setInterestRate(Number(e.target.value))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Tenure (Months)</Label>
                      <Input type="number" value={tenure} onChange={(e) => setTenure(Number(e.target.value))} />
                    </div>
                  </div>
                  <div className="pt-4 border-t flex justify-between font-bold text-xl text-primary">
                    <span>Estimated EMI</span>
                    <span>₹{emi.toLocaleString('en-IN')} /mo</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p>Customer will pay the full on-road price of <strong>₹{onRoadPrice.toLocaleString('en-IN')}</strong> upfront.</p>
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6 animate-fade-up max-w-md mx-auto">
              <h2 className="text-2xl font-semibold text-center text-primary mb-6">Quotation Summary</h2>
              <div className="bg-muted/30 p-6 rounded-2xl border space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer</span>
                  <span className="font-medium">{customers.find(c => c.id === selectedCustomer)?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vehicle</span>
                  <span className="font-medium">{vehicle.brand} {vehicle.model}</span>
                </div>
                <hr />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ex-Showroom</span>
                  <span>₹{exShowroom.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">RTO & Insurance</span>
                  <span>₹{(rto + insurance).toLocaleString('en-IN')}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-success">
                    <span>Discount</span>
                    <span>-₹{discount.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <hr />
                <div className="flex justify-between font-bold text-lg">
                  <span>On-Road Price</span>
                  <span>₹{onRoadPrice.toLocaleString('en-IN')}</span>
                </div>
                {finance && (
                  <div className="bg-primary/5 p-4 rounded-xl mt-4 border border-primary/20">
                    <p className="text-xs text-primary font-semibold mb-2 uppercase tracking-wide">Finance Plan</p>
                    <div className="flex justify-between font-medium">
                      <span>EMI</span>
                      <span>₹{emi.toLocaleString('en-IN')} x {tenure}m</span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground mt-1">
                      <span>Down Payment</span>
                      <span>₹{downPayment.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
        <div className="px-6 py-4 border-t bg-muted/20 flex justify-between rounded-b-2xl">
          <Button variant="outline" onClick={handlePrev} disabled={step === 1}>
            <ChevronLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          {step < 5 ? (
            <Button onClick={handleNext}>
              Next <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleSave} className="bg-success text-success-foreground hover:bg-success/90">
              Generate & Send WhatsApp
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
