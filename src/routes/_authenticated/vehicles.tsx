import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Plus,
  Fuel,
  Gauge,
  Palette,
  Loader2,
  Tag,
  CheckCircle2,
  Info,
} from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  listVehicles,
  listVehicleBrands,
  listVehicleModels,
  createVehicle,
} from "@/services/repository";
import type { VariantCreate, VariantResponse } from "@/lib/vehicle-types";

export const Route = createFileRoute("/_authenticated/vehicles")({
  head: () => ({
    meta: [
      { title: "Vehicles Catalogue — VoiceQuote AI" },
      { name: "description", content: "Browse available vehicle models, variants, and official pricing." },
    ],
  }),
  component: VehiclesPage,
});

function inr(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === "") return "₹0";
  const num = typeof val === "number" ? val : parseFloat(val);
  if (isNaN(num)) return "₹0";
  return "₹" + Math.round(num).toLocaleString("en-IN");
}

function VehiclesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedBrandId, setSelectedBrandId] = useState<string>("ALL");
  const [selectedFuelType, setSelectedFuelType] = useState<string>("ALL");

  // Add Variant Dialog
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState<VariantCreate>({
    model_id: 1,
    name: "",
    code: "",
    engine_cc: 125,
    fuel_type: "PETROL",
    transmission: "AUTOMATIC",
    ex_showroom_price: "",
    insurance_price: "",
    rto_price: "",
    accessories_price: "",
    color_options: "",
    status: "ACTIVE",
  });

  // Query Brands from FastAPI
  const { data: brands = [] } = useQuery({
    queryKey: ["vehicle-brands"],
    queryFn: () => listVehicleBrands(),
  });

  // Query Models from FastAPI for the creation dialog
  const { data: models = [] } = useQuery({
    queryKey: ["vehicle-models"],
    queryFn: () => listVehicleModels(),
  });

  // Query Vehicles (Variants) from FastAPI
  const {
    data: vehiclesData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["vehicles", search, selectedBrandId, selectedFuelType],
    queryFn: () => {
      const opts: Parameters<typeof listVehicles>[0] = {
        pageSize: 50,
        status: "ACTIVE",
      };
      if (search.trim()) opts.search = search.trim();
      if (selectedBrandId !== "ALL") opts.brandId = Number(selectedBrandId);
      if (selectedFuelType !== "ALL") opts.fuelType = selectedFuelType;
      return listVehicles(opts);
    },
  });

  const variants = vehiclesData?.items ?? [];

  // Create Variant Mutation
  const createMutation = useMutation({
    mutationFn: (payload: VariantCreate) => createVehicle(payload),
    onSuccess: (newVariant) => {
      toast.success(`Variant "${newVariant.name}" created successfully!`);
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setIsAddOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      if (err.status === 403) {
        toast.error("Management permission required to create vehicle variants.");
      } else {
        toast.error(err.message || "Failed to create vehicle variant");
      }
    },
  });

  const resetForm = () => {
    setFormData({
      model_id: models[0]?.id ?? 1,
      name: "",
      code: "",
      engine_cc: 125,
      fuel_type: "PETROL",
      transmission: "AUTOMATIC",
      ex_showroom_price: "",
      insurance_price: "",
      rto_price: "",
      accessories_price: "",
      color_options: "",
      status: "ACTIVE",
    });
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim() || !formData.ex_showroom_price) {
      toast.error("Name, Code, and Ex-Showroom price are required.");
      return;
    }
    createMutation.mutate({
      ...formData,
      engine_cc: formData.engine_cc ? Number(formData.engine_cc) : null,
      ex_showroom_price: Number(formData.ex_showroom_price),
      insurance_price: formData.insurance_price ? Number(formData.insurance_price) : 0,
      rto_price: formData.rto_price ? Number(formData.rto_price) : 0,
      accessories_price: formData.accessories_price ? Number(formData.accessories_price) : 0,
    });
  };

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Vehicles Catalogue"
        description="Browse available brands, models, variants and authoritative on-road pricing."
        actions={
          <Button
            onClick={() => {
              resetForm();
              setIsAddOpen(true);
            }}
            className="shrink-0 rounded-full"
          >
            <Plus className="mr-1.5 size-4" /> Add variant
          </Button>
        }
      />

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search variant name or code..."
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Brand Filter */}
          <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Brands</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Fuel Type Filter */}
          <Select value={selectedFuelType} onValueChange={setSelectedFuelType}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Fuel Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Fuels</SelectItem>
              <SelectItem value="PETROL">Petrol</SelectItem>
              <SelectItem value="ELECTRIC">Electric</SelectItem>
              <SelectItem value="HYBRID">Hybrid</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Vehicle Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="size-8 animate-spin mb-3 text-primary" />
          <p className="text-sm">Loading vehicle catalog from backend...</p>
        </div>
      ) : isError ? (
        <div className="py-12 text-center text-destructive">
          Failed to load vehicles: {(error as Error)?.message || "Unknown error"}
        </div>
      ) : variants.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-16 text-center text-muted-foreground">
            <Info className="size-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-base font-medium">No vehicles found</p>
            <p className="text-sm mt-1">Try clearing your search query or filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {variants.map((v) => {
            const brandName = v.model?.brand?.name || "Brand";
            const modelName = v.model?.name || "";
            return (
              <Card
                key={v.id}
                className="overflow-hidden rounded-2xl border border-border/80 transition-all hover:shadow-md hover:border-primary/40 flex flex-col justify-between"
              >
                {/* Card Banner / Vehicle Spec Header */}
                <div>
                  <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-muted/40 p-4 border-b border-border/60">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wider">
                          <Tag className="size-3" />
                          <span>{brandName}</span>
                          {modelName && <span>· {modelName}</span>}
                        </div>
                        <h3 className="text-lg font-bold text-foreground mt-0.5">{v.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{v.code}</p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-xs uppercase font-medium",
                          v.status === "ACTIVE" && "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400",
                        )}
                      >
                        {v.status}
                      </Badge>
                    </div>
                  </div>

                  <CardContent className="p-4 space-y-3">
                    {/* Technical Specifications */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-2">
                        <Fuel className="size-3.5 text-primary shrink-0" />
                        <span className="truncate">{v.fuel_type}</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-2">
                        <Gauge className="size-3.5 text-primary shrink-0" />
                        <span className="truncate">
                          {v.engine_cc ? `${v.engine_cc} cc` : v.transmission}
                        </span>
                      </div>
                    </div>

                    {/* Color options */}
                    {v.color_options && (
                      <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Palette className="size-3.5 text-primary shrink-0 mt-0.5" />
                        <span className="line-clamp-1">{v.color_options}</span>
                      </div>
                    )}

                    {/* Price Breakdown */}
                    <div className="space-y-1.5 border-t border-border/60 pt-3 text-xs">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Ex-Showroom:</span>
                        <span>{inr(v.ex_showroom_price)}</span>
                      </div>
                      {Number(v.rto_price) > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>RTO Charges:</span>
                          <span>{inr(v.rto_price)}</span>
                        </div>
                      )}
                      {Number(v.insurance_price) > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>Insurance:</span>
                          <span>{inr(v.insurance_price)}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </div>

                {/* Footer with On-Road Price */}
                <div className="border-t border-border/80 bg-muted/20 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                      On-Road Price
                    </p>
                    <p className="text-xl font-bold text-primary font-display">
                      {inr(v.on_road_price)}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Variant #{v.id}
                  </Badge>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Variant Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleAddSubmit}>
            <DialogHeader>
              <DialogTitle>Add Vehicle Variant</DialogTitle>
              <DialogDescription>
                Create a new variant in PostgreSQL catalog. (Management required)
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-4 max-h-[460px] overflow-y-auto pr-1">
              {/* Model selection */}
              <div className="space-y-1">
                <Label htmlFor="variant-model">Vehicle Model *</Label>
                <Select
                  value={String(formData.model_id)}
                  onValueChange={(val) => setFormData({ ...formData, model_id: Number(val) })}
                >
                  <SelectTrigger id="variant-model">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.brand?.name ? `${m.brand.name} - ` : ""}
                        {m.name} ({m.vehicle_type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="variant-name">Variant Name *</Label>
                  <Input
                    id="variant-name"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. 125 Disc"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="variant-code">Variant Code *</Label>
                  <Input
                    id="variant-code"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="e.g. TVS-JUP-125-D"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="variant-fuel">Fuel Type</Label>
                  <Select
                    value={formData.fuel_type}
                    onValueChange={(val) => setFormData({ ...formData, fuel_type: val })}
                  >
                    <SelectTrigger id="variant-fuel">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PETROL">Petrol</SelectItem>
                      <SelectItem value="ELECTRIC">Electric</SelectItem>
                      <SelectItem value="HYBRID">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="variant-trans">Transmission</Label>
                  <Select
                    value={formData.transmission}
                    onValueChange={(val) => setFormData({ ...formData, transmission: val })}
                  >
                    <SelectTrigger id="variant-trans">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AUTOMATIC">Automatic</SelectItem>
                      <SelectItem value="MANUAL">Manual</SelectItem>
                      <SelectItem value="CVT">CVT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="variant-cc">Engine (cc)</Label>
                  <Input
                    id="variant-cc"
                    type="number"
                    value={formData.engine_cc || ""}
                    onChange={(e) => setFormData({ ...formData, engine_cc: Number(e.target.value) })}
                    placeholder="125"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="variant-ex">Ex-Showroom (₹) *</Label>
                  <Input
                    id="variant-ex"
                    type="number"
                    required
                    value={formData.ex_showroom_price || ""}
                    onChange={(e) => setFormData({ ...formData, ex_showroom_price: e.target.value })}
                    placeholder="85000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="variant-rto">RTO Charges (₹)</Label>
                  <Input
                    id="variant-rto"
                    type="number"
                    value={formData.rto_price || ""}
                    onChange={(e) => setFormData({ ...formData, rto_price: e.target.value })}
                    placeholder="8000"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="variant-ins">Insurance (₹)</Label>
                  <Input
                    id="variant-ins"
                    type="number"
                    value={formData.insurance_price || ""}
                    onChange={(e) => setFormData({ ...formData, insurance_price: e.target.value })}
                    placeholder="6000"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="variant-colors">Color Options</Label>
                <Input
                  id="variant-colors"
                  value={formData.color_options || ""}
                  onChange={(e) => setFormData({ ...formData, color_options: e.target.value })}
                  placeholder="e.g. Matte Blue, Pearl White, Gloss Black"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                Create Variant
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
