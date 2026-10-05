import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Mail,
  MapPin,
  Phone,
  Search,
  UserPlus,
  Pencil,
  Trash2,
  FileText,
  IndianRupee,
  Loader2,
  Calendar,
  Languages,
} from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  listCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  listQuotations,
} from "@/services/repository";
import type { CustomerCreate, CustomerResponse } from "@/lib/customer-types";
import type { QuotationResponse, QuotationItemResponse } from "@/lib/quotation-types";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Customers — Voice Quote" },
      { name: "description", content: "Customer profiles, contact details and quotation history." },
    ],
  }),
  component: CustomersPage,
});

function inr(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === "") return "₹0";
  const num = typeof val === "number" ? val : parseFloat(val);
  if (isNaN(num)) return "₹0";
  return "₹" + Math.round(num).toLocaleString("en-IN");
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function CustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Dialog states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  // Form states
  const [formData, setFormData] = useState<CustomerCreate>({
    full_name: "",
    phone: "",
    email: "",
    city: "",
    state: "",
    pincode: "",
    occupation: "",
    preferred_language: "English",
    budget: "",
  });

  // Query customers from FastAPI
  const { data: customerData, isLoading, isError, error } = useQuery({
    queryKey: ["customers", search],
    queryFn: () => listCustomers(search.trim() ? { search: search.trim(), pageSize: 50 } : { pageSize: 50 }),
  });

  const customersList = customerData?.items ?? [];

  // Default selection to first customer if none selected or selection not in list
  const activeCustomer = useMemo(() => {
    if (!customersList.length) return null;
    if (selectedId !== null) {
      const found = customersList.find((c) => c.id === selectedId);
      if (found) return found;
    }
    return customersList[0];
  }, [customersList, selectedId]);

  // Query quotations for selected customer
  const { data: quotes = [], isLoading: isLoadingQuotes } = useQuery<QuotationResponse[]>({
    queryKey: ["customer-quotations", activeCustomer?.id],
    queryFn: async () => {
      if (!activeCustomer?.id) return [];
      const res = await listQuotations({ customerId: activeCustomer.id, pageSize: 20 });
      return res.items ?? [];
    },
    enabled: !!activeCustomer?.id,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload: CustomerCreate) => createCustomer(payload),
    onSuccess: (newCust) => {
      toast.success(`Customer ${newCust.full_name} created successfully`);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setSelectedId(newCust.id);
      setIsAddOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create customer");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CustomerCreate> }) =>
      updateCustomer(id, payload),
    onSuccess: (updated) => {
      toast.success(`Customer ${updated.full_name} updated successfully`);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setIsEditOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update customer");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteCustomer(id),
    onSuccess: () => {
      toast.success("Customer removed successfully");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setIsDeleteOpen(false);
      setSelectedId(null);
    },
    onError: (err: any) => {
      if (err.status === 403) {
        toast.error("Management permission required to delete customers.");
      } else {
        toast.error(err.message || "Failed to delete customer");
      }
    },
  });

  const resetForm = () => {
    setFormData({
      full_name: "",
      phone: "",
      email: "",
      city: "",
      state: "",
      pincode: "",
      occupation: "",
      preferred_language: "English",
      budget: "",
    });
  };

  const openEdit = (customer: CustomerResponse) => {
    setFormData({
      full_name: customer.full_name,
      phone: customer.phone,
      email: customer.email || "",
      city: customer.city || "",
      state: customer.state || "",
      pincode: customer.pincode || "",
      occupation: customer.occupation || "",
      preferred_language: customer.preferred_language || "English",
      budget: customer.budget ? String(customer.budget) : "",
    });
    setIsEditOpen(true);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.full_name.trim() || !formData.phone.trim()) {
      toast.error("Full name and phone are required.");
      return;
    }
    createMutation.mutate({
      ...formData,
      email: formData.email?.trim() || null,
      city: formData.city?.trim() || null,
      state: formData.state?.trim() || null,
      pincode: formData.pincode?.trim() || null,
      occupation: formData.occupation?.trim() || null,
      budget: formData.budget ? Number(formData.budget) : null,
    });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCustomer) return;
    if (!formData.full_name.trim() || !formData.phone.trim()) {
      toast.error("Full name and phone are required.");
      return;
    }
    updateMutation.mutate({
      id: activeCustomer.id,
      payload: {
        ...formData,
        email: formData.email?.trim() || null,
        city: formData.city?.trim() || null,
        state: formData.state?.trim() || null,
        pincode: formData.pincode?.trim() || null,
        occupation: formData.occupation?.trim() || null,
        budget: formData.budget ? Number(formData.budget) : null,
      },
    });
  };

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Customers"
        description="Every customer, contact details, and quotation history from PostgreSQL."
        actions={
          <Button
            onClick={() => {
              resetForm();
              setIsAddOpen(true);
            }}
            className="shrink-0 rounded-full"
          >
            <UserPlus className="mr-1.5 size-4" /> Add customer
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        {/* Left Side: Search + Customer List */}
        <Card className="rounded-2xl">
          <CardContent className="space-y-3 p-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, phone or email..."
                className="pl-9"
              />
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="size-6 animate-spin mb-2" />
                <p className="text-sm">Loading customers from backend...</p>
              </div>
            ) : isError ? (
              <div className="py-8 text-center text-sm text-destructive">
                Failed to load customers: {(error as Error)?.message || "Unknown error"}
              </div>
            ) : customersList.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No customers found matching your search.
              </div>
            ) : (
              <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
                {customersList.map((c) => {
                  const isSelected = activeCustomer?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                        isSelected
                          ? "border-primary/40 bg-primary/5"
                          : "border-border hover:bg-muted/60",
                      )}
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {c.full_name?.charAt(0).toUpperCase() || "?"}
                      </span>
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {c.full_name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.phone} {c.city ? `· ${c.city}` : ""}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">
                        ID: {c.id}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Side: Selected Customer Details + Quotation History */}
        <div className="space-y-4">
          {activeCustomer ? (
            <>
              {/* Customer Profile Card */}
              <Card className="rounded-2xl">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div>
                    <CardTitle className="text-lg font-semibold">{activeCustomer.full_name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Customer #{activeCustomer.id} · Registered {formatDate(activeCustomer.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(activeCustomer)}
                      className="rounded-full h-8"
                    >
                      <Pencil className="size-3.5 mr-1" /> Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsDeleteOpen(true)}
                      className="rounded-full h-8 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border p-3">
                      <Phone className="size-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Phone</p>
                        <p className="truncate text-sm font-medium">{activeCustomer.phone}</p>
                      </div>
                    </div>
                    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border p-3">
                      <Mail className="size-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="truncate text-sm font-medium">
                          {activeCustomer.email || "Not specified"}
                        </p>
                      </div>
                    </div>
                    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border p-3">
                      <MapPin className="size-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Location</p>
                        <p className="truncate text-sm font-medium">
                          {[activeCustomer.address, activeCustomer.city, activeCustomer.state, activeCustomer.pincode]
                            .filter(Boolean)
                            .join(", ") || "Not specified"}
                        </p>
                      </div>
                    </div>
                    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border p-3">
                      <Building2 className="size-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Occupation</p>
                        <p className="truncate text-sm font-medium">
                          {activeCustomer.occupation || "Individual"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Highlights Banner */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-muted/50 p-3.5">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <FileText className="size-3.5 text-primary" /> Quotations
                      </div>
                      <p className="font-display text-lg font-semibold">{quotes.length}</p>
                    </div>
                    <div className="rounded-xl bg-muted/50 p-3.5">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <IndianRupee className="size-3.5 text-primary" /> Budget
                      </div>
                      <p className="font-display text-lg font-semibold">
                        {activeCustomer.budget ? inr(activeCustomer.budget) : "Open"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted/50 p-3.5">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <Languages className="size-3.5 text-primary" /> Language
                      </div>
                      <p className="font-display text-lg font-semibold">
                        {activeCustomer.preferred_language || "English"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quotation History Card */}
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>Quotation History</span>
                    <Badge variant="secondary" className="font-normal text-xs">
                      {quotes.length} record{quotes.length === 1 ? "" : "s"}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoadingQuotes ? (
                    <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin mr-2" /> Loading quotations...
                    </div>
                  ) : quotes.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No quotations recorded yet for this customer.
                    </p>
                  ) : (
                    <Accordion type="single" collapsible className="w-full">
                      {quotes.map((q: QuotationResponse) => (
                        <AccordionItem key={q.id} value={String(q.id)}>
                          <AccordionTrigger className="text-sm py-3 hover:no-underline">
                            <span className="flex w-full items-center justify-between gap-3 pr-3 text-left">
                              <span className="truncate">
                                <span className="font-semibold text-foreground">{q.quotation_number}</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  {q.variant?.name || "Vehicle"}
                                </span>
                              </span>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-xs uppercase",
                                    q.status === "ACCEPTED" && "border-green-500 text-green-600 bg-green-50/50",
                                    q.status === "GENERATED" && "border-blue-500 text-blue-600 bg-blue-50/50",
                                    q.status === "REJECTED" && "border-red-500 text-red-600 bg-red-50/50",
                                  )}
                                >
                                  {q.status}
                                </Badge>
                                <span className="font-semibold">{inr(q.final_price)}</span>
                              </div>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent className="text-xs space-y-2 pt-1 pb-3 text-muted-foreground">
                            <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2.5">
                              <div>
                                <span className="font-medium text-foreground">Date: </span>
                                {formatDate(q.created_at)}
                              </div>
                              <div>
                                <span className="font-medium text-foreground">Down Payment: </span>
                                {inr(q.down_payment)}
                              </div>
                              <div>
                                <span className="font-medium text-foreground">Loan Tenure: </span>
                                {q.loan_tenure} months
                              </div>
                              <div>
                                <span className="font-medium text-foreground">Monthly EMI: </span>
                                {inr(q.emi)}
                              </div>
                            </div>
                            {q.items && q.items.length > 0 && (
                              <div className="pt-1">
                                <p className="font-medium text-foreground mb-1">Items included:</p>
                                <ul className="list-disc list-inside space-y-0.5">
                                  {q.items.map((item: QuotationItemResponse) => (
                                    <li key={item.id}>
                                      {item.item_name} ({inr(item.total_price)})
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="rounded-2xl">
              <CardContent className="py-16 text-center text-muted-foreground">
                <p>Select a customer on the left to view profile details.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Add Customer Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleAddSubmit}>
            <DialogHeader>
              <DialogTitle>Add Customer</DialogTitle>
              <DialogDescription>
                Create a new customer profile in PostgreSQL.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="add-name">Full Name *</Label>
                  <Input
                    id="add-name"
                    required
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    placeholder="e.g. Rahul Sharma"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="add-phone">Phone *</Label>
                  <Input
                    id="add-phone"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="e.g. 9876543210"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="add-email">Email</Label>
                <Input
                  id="add-email"
                  type="email"
                  value={formData.email || ""}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="e.g. rahul@example.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="add-city">City</Label>
                  <Input
                    id="add-city"
                    value={formData.city || ""}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="e.g. Mumbai"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="add-state">State</Label>
                  <Input
                    id="add-state"
                    value={formData.state || ""}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    placeholder="e.g. Maharashtra"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="add-occupation">Occupation</Label>
                  <Input
                    id="add-occupation"
                    value={formData.occupation || ""}
                    onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                    placeholder="e.g. Engineer"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="add-budget">Budget (₹)</Label>
                  <Input
                    id="add-budget"
                    type="number"
                    value={formData.budget || ""}
                    onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                    placeholder="e.g. 100000"
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                Save Customer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleEditSubmit}>
            <DialogHeader>
              <DialogTitle>Edit Customer</DialogTitle>
              <DialogDescription>
                Update profile details for {activeCustomer?.full_name}.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="edit-name">Full Name *</Label>
                  <Input
                    id="edit-name"
                    required
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-phone">Phone *</Label>
                  <Input
                    id="edit-phone"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email || ""}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="edit-city">City</Label>
                  <Input
                    id="edit-city"
                    value={formData.city || ""}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-state">State</Label>
                  <Input
                    id="edit-state"
                    value={formData.state || ""}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="edit-occupation">Occupation</Label>
                  <Input
                    id="edit-occupation"
                    value={formData.occupation || ""}
                    onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-budget">Budget (₹)</Label>
                  <Input
                    id="edit-budget"
                    type="number"
                    value={formData.budget || ""}
                    onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Customer Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete Customer</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {activeCustomer?.full_name}? This action cannot be undone.
              (Note: Requires management privileges)
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => activeCustomer && deleteMutation.mutate(activeCustomer.id)}
            >
              {deleteMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
