import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Plus,
  Car,
  Tag,
  Loader2,
  Calendar,
  Lock,
  Unlock,
  Edit2,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Info,
} from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  listInventoryUnits,
  createInventoryUnit,
  updateInventoryUnit,
  reserveInventoryUnit,
  releaseInventoryUnit,
  listVehicles,
} from "@/services/repository";
import {
  INITIAL_INVENTORY_STATUSES,
  INVENTORY_STATUS_LABEL,
  INVENTORY_STATUS_TRANSITIONS,
  type InventoryStatus,
  type InventoryUnitCreate,
  type InventoryUnitUpdate,
  type InventoryUnitResponse,
} from "@/lib/inventory-types";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory Management — Voice Quote" },
      { name: "description", content: "Manage physical vehicle units, showroom stock, and atomic reservations." },
    ],
  }),
  component: InventoryPage,
});

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
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

function StatusBadge({ status }: { status: InventoryStatus | string }) {
  switch (status) {
    case "AVAILABLE":
      return (
        <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
          Available
        </Badge>
      );
    case "RESERVED":
      return (
        <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
          Reserved
        </Badge>
      );
    case "SOLD":
      return <Badge variant="secondary">Sold</Badge>;
    case "SERVICE":
      return (
        <Badge className="bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30">
          Service
        </Badge>
      );
    case "IN_TRANSIT":
      return (
        <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30">
          In Transit
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function InventoryPage() {
  const queryClient = useQueryClient();
  const { canManageInventory } = useAuth();

  // Filters & Pagination state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [variantFilter, setVariantFilter] = useState<string>("ALL");
  const [branchFilter, setBranchFilter] = useState<string>("ALL");
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;

  // Dialog States
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editUnit, setEditUnit] = useState<InventoryUnitResponse | null>(null);
  const [reserveUnit, setReserveUnit] = useState<InventoryUnitResponse | null>(null);
  const [releaseUnit, setReleaseUnit] = useState<InventoryUnitResponse | null>(null);
  const [actionNotes, setActionNotes] = useState("");

  // Add Unit Form State
  const [createForm, setCreateForm] = useState<InventoryUnitCreate>({
    variant_id: 1,
    vin_chassis_number: "",
    engine_number: "",
    color: "",
    status: "AVAILABLE",
    branch_name: "Main Showroom",
    arrival_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  // Edit Unit Form State
  const [editForm, setEditForm] = useState<InventoryUnitUpdate>({
    color: "",
    status: "AVAILABLE",
    branch_name: "",
    arrival_date: "",
    notes: "",
  });

  // Fetch Vehicle Catalog for Variant Filter & Selection
  const { data: catalogData } = useQuery({
    queryKey: ["inventory-catalog-variants"],
    queryFn: () => listVehicles({ pageSize: 100, status: "ACTIVE" }),
  });
  const variants = catalogData?.items ?? [];

  // Query Inventory Units from FastAPI
  const {
    data: inventoryData,
    isLoading,
    isError,
    error,
    isFetching,
  } = useQuery({
    queryKey: [
      "inventory",
      search,
      statusFilter,
      variantFilter,
      branchFilter,
      page,
      pageSize,
    ],
    queryFn: () => {
      const opts: Parameters<typeof listInventoryUnits>[0] = {
        page,
        pageSize,
      };
      if (search.trim()) opts.search = search.trim();
      if (statusFilter !== "ALL") opts.status = statusFilter;
      if (variantFilter !== "ALL") opts.variantId = Number(variantFilter);
      if (branchFilter !== "ALL") opts.branchName = branchFilter;
      return listInventoryUnits(opts);
    },
  });

  const units = inventoryData?.items ?? [];
  const total = inventoryData?.total ?? 0;
  const totalPages = inventoryData?.pages ?? 1;

  // Mutations
  const createMutation = useMutation({
    mutationFn: (values: InventoryUnitCreate) => createInventoryUnit(values),
    onSuccess: (newUnit) => {
      toast.success(`Inventory unit #${newUnit.id} registered successfully!`);
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setIsAddOpen(false);
      resetCreateForm();
    },
    onError: (err: any) => {
      if (err.code === "VIN_EXISTS") {
        toast.error("Duplicate VIN: An inventory unit with this chassis number already exists.");
      } else if (err.code === "ENGINE_NO_EXISTS") {
        toast.error("Duplicate Engine Number: A vehicle unit with this engine number already exists.");
      } else if (err.status === 403) {
        toast.error("Permission Denied: Management role required to create inventory units.");
      } else {
        toast.error(err.message || "Failed to create inventory unit");
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: number; values: InventoryUnitUpdate }) =>
      updateInventoryUnit(id, values),
    onSuccess: (updated) => {
      toast.success(`Inventory unit #${updated.id} updated successfully!`);
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setEditUnit(null);
    },
    onError: (err: any) => {
      if (err.status === 403) {
        toast.error("Permission Denied: Management role required to update inventory.");
      } else {
        toast.error(err.message || "Failed to update inventory unit");
      }
    },
  });

  const reserveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      reserveInventoryUnit(id, { notes: notes || null }),
    onSuccess: (reserved) => {
      toast.success(`Unit #${reserved.id} (${reserved.vin_chassis_number}) reserved successfully!`);
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setReserveUnit(null);
      setActionNotes("");
    },
    onError: (err: any) => {
      if (err.code === "UNIT_NOT_AVAILABLE") {
        toast.error("Unit cannot be reserved because it is no longer available.");
      } else {
        toast.error(err.message || "Failed to reserve vehicle unit");
      }
    },
  });

  const releaseMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      releaseInventoryUnit(id, { notes: notes || null }),
    onSuccess: (released) => {
      toast.success(`Unit #${released.id} released back to Available stock!`);
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setReleaseUnit(null);
      setActionNotes("");
    },
    onError: (err: any) => {
      if (err.code === "UNIT_NOT_RESERVED") {
        toast.error("Unit cannot be released because it is not currently reserved.");
      } else {
        toast.error(err.message || "Failed to release unit");
      }
    },
  });

  const resetCreateForm = () => {
    setCreateForm({
      variant_id: variants[0]?.id ?? 1,
      vin_chassis_number: "",
      engine_number: "",
      color: "",
      status: "AVAILABLE",
      branch_name: "Main Showroom",
      arrival_date: new Date().toISOString().slice(0, 10),
      notes: "",
    });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.variant_id) {
      toast.error("Please select a vehicle variant.");
      return;
    }
    if (!createForm.vin_chassis_number.trim()) {
      toast.error("Chassis / VIN number is required.");
      return;
    }
    if (!createForm.engine_number.trim()) {
      toast.error("Engine number is required.");
      return;
    }
    if (!createForm.color.trim()) {
      toast.error("Color is required.");
      return;
    }
    createMutation.mutate({
      ...createForm,
      variant_id: Number(createForm.variant_id),
      vin_chassis_number: createForm.vin_chassis_number.trim().toUpperCase(),
      engine_number: createForm.engine_number.trim().toUpperCase(),
      color: createForm.color.trim(),
      branch_name: createForm.branch_name.trim() || "Main Showroom",
      arrival_date: createForm.arrival_date || null,
      notes: createForm.notes?.trim() || null,
    });
  };

  const handleEditOpen = (unit: InventoryUnitResponse) => {
    setEditUnit(unit);
    setEditForm({
      color: unit.color,
      status: unit.status,
      branch_name: unit.branch_name,
      arrival_date: unit.arrival_date ? unit.arrival_date.slice(0, 10) : "",
      notes: unit.notes || "",
    });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUnit) return;
    if (!editForm.color?.trim()) {
      toast.error("Color cannot be empty.");
      return;
    }
    updateMutation.mutate({
      id: editUnit.id,
      values: {
        color: editForm.color.trim(),
        status: editForm.status,
        branch_name: editForm.branch_name?.trim() || "Main Showroom",
        arrival_date: editForm.arrival_date || null,
        notes: editForm.notes?.trim() || null,
      },
    });
  };

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Physical Inventory"
        description="Track vehicle chassis numbers, showroom locations, and lock bookings with atomic reservation."
        actions={
          canManageInventory ? (
            <Button
              onClick={() => {
                const firstVar = variants[0];
                if (firstVar && !createForm.variant_id) {
                  setCreateForm((prev) => ({ ...prev, variant_id: firstVar.id }));
                }
                setIsAddOpen(true);
              }}
              className="gap-2 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Add Vehicle Unit
            </Button>
          ) : undefined
        }
      />

      {/* Filters and Search Bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by VIN, Engine No, or Color..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>

            {/* Status Filter */}
            <div className="w-full md:w-44">
              <Select
                value={statusFilter}
                onValueChange={(val) => {
                  setStatusFilter(val);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status: All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  <SelectItem value="AVAILABLE">Available</SelectItem>
                  <SelectItem value="RESERVED">Reserved</SelectItem>
                  <SelectItem value="SOLD">Sold</SelectItem>
                  <SelectItem value="SERVICE">Service</SelectItem>
                  <SelectItem value="IN_TRANSIT">In Transit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Variant Filter */}
            <div className="w-full md:w-56">
              <Select
                value={variantFilter}
                onValueChange={(val) => {
                  setVariantFilter(val);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Models/Variants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Vehicle Variants</SelectItem>
                  {variants.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.model?.name} {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Branch Filter */}
            <div className="w-full md:w-44">
              <Select
                value={branchFilter}
                onValueChange={(val) => {
                  setBranchFilter(val);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Branches</SelectItem>
                  <SelectItem value="Main Showroom">Main Showroom</SelectItem>
                  <SelectItem value="West End Showroom">West End Showroom</SelectItem>
                  <SelectItem value="Service Center">Service Center</SelectItem>
                  <SelectItem value="Central Stockyard">Central Stockyard</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-12 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading physical inventory...</p>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-2">
              <ShieldAlert className="h-10 w-10 text-destructive" />
              <p className="text-base font-semibold">Failed to load inventory</p>
              <p className="text-sm text-muted-foreground">
                {(error as Error)?.message || "Please check your network connection and retry."}
              </p>
            </div>
          ) : units.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
              <div className="p-3 bg-muted rounded-full">
                <Car className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-base font-medium">No inventory units found</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                {search || statusFilter !== "ALL" || variantFilter !== "ALL" || branchFilter !== "ALL"
                  ? "No vehicle units match your active filter criteria."
                  : "No vehicles have been added to inventory yet."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 border-b text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="px-6 py-3 font-semibold">ID</th>
                    <th className="px-6 py-3 font-semibold">Vehicle / Variant</th>
                    <th className="px-6 py-3 font-semibold">VIN / Chassis</th>
                    <th className="px-6 py-3 font-semibold">Engine No.</th>
                    <th className="px-6 py-3 font-semibold">Color</th>
                    <th className="px-6 py-3 font-semibold">Branch</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 font-semibold">Arrival Date</th>
                    <th className="px-6 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {units.map((unit) => {
                    const variantName = unit.variant?.name || `Variant #${unit.variant_id}`;
                    const modelName = unit.variant?.model?.name || "";
                    const brandName = unit.variant?.model?.brand?.name || "";
                    const isAvailable = unit.status === "AVAILABLE";
                    const isReserved = unit.status === "RESERVED";

                    return (
                      <tr key={unit.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs font-semibold text-muted-foreground">
                          #{unit.id}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-foreground">{variantName}</div>
                          <div className="text-xs text-muted-foreground">
                            {brandName} {modelName} {unit.variant?.code ? `• ${unit.variant.code}` : ""}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs font-semibold text-foreground tracking-wide">
                          {unit.vin_chassis_number}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                          {unit.engine_number}
                        </td>
                        <td className="px-6 py-4 font-medium">{unit.color}</td>
                        <td className="px-6 py-4 text-muted-foreground text-xs">{unit.branch_name}</td>
                        <td className="px-6 py-4">
                          <StatusBadge status={unit.status} />
                        </td>
                        <td className="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(unit.arrival_date)}
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Reserve Action (Any authenticated role) */}
                            {isAvailable && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2.5 text-xs text-amber-600 border-amber-500/30 hover:bg-amber-500/10 gap-1.5"
                                onClick={() => {
                                  setActionNotes("");
                                  setReserveUnit(unit);
                                }}
                              >
                                <Lock className="h-3.5 w-3.5" />
                                Reserve
                              </Button>
                            )}

                            {/* Release Action (Any authenticated role) */}
                            {isReserved && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2.5 text-xs text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10 gap-1.5"
                                onClick={() => {
                                  setActionNotes("");
                                  setReleaseUnit(unit);
                                }}
                              >
                                <Unlock className="h-3.5 w-3.5" />
                                Release
                              </Button>
                            )}

                            {/* Edit Action (Management only) */}
                            {canManageInventory && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2 text-xs gap-1"
                                onClick={() => handleEditOpen(unit)}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                                Edit
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/20 text-xs">
              <span className="text-muted-foreground">
                Showing <span className="font-medium text-foreground">{units.length}</span> of{" "}
                <span className="font-medium text-foreground">{total}</span> vehicle units
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 gap-1"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </Button>
                <span className="px-2 text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 gap-1"
                  disabled={page >= totalPages || isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Add Inventory Unit (Management Roles) */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <form onSubmit={handleCreateSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" />
                Register New Inventory Unit
              </DialogTitle>
              <DialogDescription>
                Add a physical vehicle with unique chassis and engine numbers into showroom stock.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {/* Variant Selector */}
              <div className="space-y-1.5">
                <Label htmlFor="variant_id">Vehicle Model & Variant *</Label>
                <Select
                  value={String(createForm.variant_id)}
                  onValueChange={(val) =>
                    setCreateForm((prev) => ({ ...prev, variant_id: Number(val) }))
                  }
                >
                  <SelectTrigger id="variant_id">
                    <SelectValue placeholder="Select variant" />
                  </SelectTrigger>
                  <SelectContent>
                    {variants.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.model?.brand?.name} {v.model?.name} — {v.name} ({v.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* VIN & Engine Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="vin">VIN / Chassis Number *</Label>
                  <Input
                    id="vin"
                    placeholder="e.g. ME4JF5077K8123456"
                    value={createForm.vin_chassis_number}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, vin_chassis_number: e.target.value }))
                    }
                    className="font-mono uppercase text-xs"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="engine">Engine Number *</Label>
                  <Input
                    id="engine"
                    placeholder="e.g. JF50E9123456"
                    value={createForm.engine_number}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, engine_number: e.target.value }))
                    }
                    className="font-mono uppercase text-xs"
                    required
                  />
                </div>
              </div>

              {/* Color & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="color">Color *</Label>
                  <Input
                    id="color"
                    placeholder="e.g. Pearl Nightstar Black"
                    value={createForm.color}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, color: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="status">Initial Status</Label>
                  <Select
                    value={createForm.status}
                    onValueChange={(val) =>
                      setCreateForm((prev) => ({ ...prev, status: val as InventoryStatus }))
                    }
                  >
                    <SelectTrigger id="status">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {INITIAL_INVENTORY_STATUSES.map((st) => (
                        <SelectItem key={st} value={st}>
                          {INVENTORY_STATUS_LABEL[st]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Branch & Arrival Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="branch">Showroom / Branch Location</Label>
                  <Input
                    id="branch"
                    placeholder="e.g. Main Showroom"
                    value={createForm.branch_name}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, branch_name: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="arrival_date">Arrival Date</Label>
                  <Input
                    id="arrival_date"
                    type="date"
                    value={createForm.arrival_date || ""}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, arrival_date: e.target.value }))
                    }
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes / Batch Info (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="e.g. Delivered under consignment #401"
                  value={createForm.notes || ""}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Unit to Inventory
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Edit Inventory Unit (Management Roles) */}
      <Dialog open={!!editUnit} onOpenChange={(open) => !open && setEditUnit(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleEditSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit2 className="h-5 w-5 text-primary" />
                Edit Inventory Unit #{editUnit?.id}
              </DialogTitle>
              <DialogDescription>
                Update vehicle unit location, status, or inspection notes.
              </DialogDescription>
            </DialogHeader>

            {editUnit && (
              <div className="grid gap-4 py-4">
                {/* Read-only info callout */}
                <div className="p-3 bg-muted/50 rounded-md border text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vehicle:</span>
                    <span className="font-medium text-foreground">
                      {editUnit.variant?.model?.brand?.name} {editUnit.variant?.model?.name} {editUnit.variant?.name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">VIN / Chassis:</span>
                    <span className="font-mono font-semibold text-foreground">
                      {editUnit.vin_chassis_number}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Engine No:</span>
                    <span className="font-mono text-foreground">{editUnit.engine_number}</span>
                  </div>
                </div>

                {/* Color & Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-color">Color *</Label>
                    <Input
                      id="edit-color"
                      value={editForm.color || ""}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, color: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-status">Status</Label>
                    <Select
                      value={editForm.status || "AVAILABLE"}
                      onValueChange={(val) =>
                        setEditForm((prev) => ({ ...prev, status: val as InventoryStatus }))
                      }
                    >
                      <SelectTrigger id="edit-status">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        {editUnit &&
                          [
                            editUnit.status as InventoryStatus,
                            ...(INVENTORY_STATUS_TRANSITIONS[editUnit.status as InventoryStatus] ?? []),
                          ].map((st) => (
                            <SelectItem key={st} value={st}>
                              {INVENTORY_STATUS_LABEL[st] ?? st}
                              {st === editUnit.status ? " (current)" : ""}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Use Reserve / Release for reservations. Sold units cannot change status.
                    </p>
                  </div>
                </div>

                {/* Branch & Arrival Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-branch">Branch / Location</Label>
                    <Input
                      id="edit-branch"
                      value={editForm.branch_name || ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, branch_name: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-arrival">Arrival Date</Label>
                    <Input
                      id="edit-arrival"
                      type="date"
                      value={editForm.arrival_date || ""}
                      onChange={(e) =>
                        setEditForm((prev) => ({ ...prev, arrival_date: e.target.value }))
                      }
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <Label htmlFor="edit-notes">Notes</Label>
                  <Textarea
                    id="edit-notes"
                    value={editForm.notes || ""}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditUnit(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Reserve Unit (All Roles) */}
      <Dialog open={!!reserveUnit} onOpenChange={(open) => !open && setReserveUnit(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Lock className="h-5 w-5" />
              Reserve Unit #{reserveUnit?.id}
            </DialogTitle>
            <DialogDescription>
              Atomically lock this vehicle unit to prevent other executives from booking it.
            </DialogDescription>
          </DialogHeader>

          {reserveUnit && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-md text-xs space-y-1">
                <div className="font-semibold text-foreground">
                  {reserveUnit.variant?.model?.brand?.name} {reserveUnit.variant?.model?.name} {reserveUnit.variant?.name}
                </div>
                <div className="font-mono text-muted-foreground">VIN: {reserveUnit.vin_chassis_number}</div>
                <div className="text-muted-foreground">Color: {reserveUnit.color} • Branch: {reserveUnit.branch_name}</div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reserve-notes">Reservation Note (Optional)</Label>
                <Input
                  id="reserve-notes"
                  placeholder="e.g. Reserved for quotation QT-20261002-1001"
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReserveUnit(null)}>
              Cancel
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={reserveMutation.isPending}
              onClick={() => {
                if (reserveUnit) {
                  reserveMutation.mutate({ id: reserveUnit.id, notes: actionNotes.trim() });
                }
              }}
            >
              {reserveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Reservation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Release Unit (All Roles) */}
      <Dialog open={!!releaseUnit} onOpenChange={(open) => !open && setReleaseUnit(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <Unlock className="h-5 w-5" />
              Release Reserved Unit #{releaseUnit?.id}
            </DialogTitle>
            <DialogDescription>
              Release this vehicle unit back to Available stock so other customers can book it.
            </DialogDescription>
          </DialogHeader>

          {releaseUnit && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-xs space-y-1">
                <div className="font-semibold text-foreground">
                  {releaseUnit.variant?.model?.brand?.name} {releaseUnit.variant?.model?.name} {releaseUnit.variant?.name}
                </div>
                <div className="font-mono text-muted-foreground">VIN: {releaseUnit.vin_chassis_number}</div>
                <div className="text-muted-foreground">Branch: {releaseUnit.branch_name}</div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="release-notes">Release Note (Optional)</Label>
                <Input
                  id="release-notes"
                  placeholder="e.g. Booking cancelled / Quote expired"
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReleaseUnit(null)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={releaseMutation.isPending}
              onClick={() => {
                if (releaseUnit) {
                  releaseMutation.mutate({ id: releaseUnit.id, notes: actionNotes.trim() });
                }
              }}
            >
              {releaseMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Release
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
