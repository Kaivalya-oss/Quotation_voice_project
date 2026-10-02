import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import type { AppRole, LeadStage, QuotationStatus } from "@/lib/validators";
import { api } from "@/lib/api";
import type {
  QuotationCreate,
  QuotationResponse,
  QuotationStatusUpdate,
  PaginatedQuotations,
  BackendQuotationStatus,
} from "@/lib/quotation-types";
import type {
  CustomerCreate,
  CustomerUpdate,
  CustomerResponse,
  PaginatedCustomers,
} from "@/lib/customer-types";
import type {
  VariantCreate,
  VariantUpdate,
  VariantResponse,
  BrandResponse,
  ModelResponse,
  AccessoryResponse,
  PaginatedVehicles,
} from "@/lib/vehicle-types";
import type {
  InventoryUnitCreate,
  InventoryUnitUpdate,
  InventoryUnitResponse,
  PaginatedInventoryUnits,
  StockActionRequest,
  VariantStockSummary,
  InventoryStatus,
} from "@/lib/inventory-types";

export type Customer = Database["public"]["Tables"]["customers"]["Row"];
export type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"];
export type Accessory = Database["public"]["Tables"]["accessories"]["Row"];
export type Quotation = Database["public"]["Tables"]["quotations"]["Row"];
export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type FollowUp = Database["public"]["Tables"]["follow_ups"]["Row"];
export type Offer = Database["public"]["Tables"]["offers"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
export type AuditLog = Database["public"]["Tables"]["audit_logs"]["Row"];

export interface QuotationAccessory {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export type QuotationWithRelations = Quotation & {
  customer: Pick<Customer, "id" | "name" | "phone" | "email" | "city"> | null;
  vehicle: Pick<Vehicle, "id" | "brand" | "model" | "variant" | "color" | "image_url"> | null;
  created_by_profile: Pick<Profile, "id" | "name"> | null;
};

export type LeadWithRelations = Lead & {
  customer: Pick<Customer, "id" | "name" | "phone" | "city"> | null;
  quotation: Pick<Quotation, "id" | "quotation_number" | "total_amount" | "status"> | null;
  assignee: Pick<Profile, "id" | "name"> | null;
};

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/* ============ AUTH / PROFILE ============ */

export async function fetchCurrentUserContext() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);

  return {
    user,
    profile: profile ?? null,
    roles: (roles ?? []).map((r) => r.role as AppRole),
  };
}

export async function updateProfile(id: string, values: Partial<Profile>) {
  return unwrap(await supabase.from("profiles").update(values).eq("id", id).select().single());
}

/* ============ VEHICLES / CATALOG (FastAPI REST Backend) ============ */

export async function listVehicles(
  opts: {
    search?: string | undefined;
    brandId?: number | undefined;
    modelId?: number | undefined;
    fuelType?: string | undefined;
    status?: string | undefined;
    minPrice?: number | undefined;
    maxPrice?: number | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    onlyInStock?: boolean | undefined;
  } = {},
): Promise<PaginatedVehicles & { rows: VariantResponse[] }> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 50;

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(pageSize));

  if (opts.search?.trim()) params.set("search", opts.search.trim());
  if (opts.brandId) params.set("brand_id", String(opts.brandId));
  if (opts.modelId) params.set("model_id", String(opts.modelId));
  if (opts.fuelType) params.set("fuel_type", opts.fuelType);
  if (opts.status) params.set("status", opts.status);
  if (opts.minPrice !== undefined) params.set("min_price", String(opts.minPrice));
  if (opts.maxPrice !== undefined) params.set("max_price", String(opts.maxPrice));

  const res = await api.get<PaginatedVehicles>(`/api/v1/vehicles?${params.toString()}`);
  const items = res.items ?? [];
  return {
    items,
    total: res.total ?? items.length,
    page: res.page ?? page,
    page_size: res.page_size ?? pageSize,
    pages: res.pages ?? 1,
    rows: items,
  };
}

export async function getVehicle(id: number | string): Promise<VariantResponse> {
  return await api.get<VariantResponse>(`/api/v1/vehicles/${id}`);
}

export async function createVehicle(values: VariantCreate): Promise<VariantResponse> {
  return await api.post<VariantResponse>("/api/v1/vehicles", values);
}

export async function updateVehicle(
  id: number | string,
  values: VariantUpdate,
): Promise<VariantResponse> {
  return await api.put<VariantResponse>(`/api/v1/vehicles/${id}`, values);
}

export async function deleteVehicle(id: number | string): Promise<{ success: boolean; message: string }> {
  return await api.delete<{ success: boolean; message: string }>(`/api/v1/vehicles/${id}`);
}

export async function upsertVehicle(values: Partial<VariantCreate> & { id?: number | string }) {
  if (values.id) {
    return await updateVehicle(values.id, values as VariantUpdate);
  }
  return await createVehicle(values as VariantCreate);
}

export async function listVehicleBrands(): Promise<BrandResponse[]> {
  return await api.get<BrandResponse[]>("/api/v1/vehicles/catalog/brands");
}

export async function listVehicleModels(brandId?: number): Promise<ModelResponse[]> {
  const path = brandId ? `/api/v1/vehicles/catalog/models?brand_id=${brandId}` : "/api/v1/vehicles/catalog/models";
  return await api.get<ModelResponse[]>(path);
}

export async function listVehicleAccessories(): Promise<AccessoryResponse[]> {
  return await api.get<AccessoryResponse[]>("/api/v1/vehicles/catalog/accessories");
}


/* ============ INVENTORY (FastAPI REST Backend) ============ */

export async function listInventoryUnits(
  opts: {
    variantId?: number | undefined;
    variant_id?: number | undefined;
    status?: InventoryStatus | string | undefined;
    branchName?: string | undefined;
    branch_name?: string | undefined;
    search?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    page_size?: number | undefined;
  } = {},
): Promise<PaginatedInventoryUnits & { rows: InventoryUnitResponse[] }> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? opts.page_size ?? 20;

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(pageSize));

  const variantId = opts.variantId ?? opts.variant_id;
  if (variantId !== undefined) params.set("variant_id", String(variantId));

  if (opts.status && opts.status !== "all") params.set("status", opts.status);

  const branchName = opts.branchName ?? opts.branch_name;
  if (branchName?.trim()) params.set("branch_name", branchName.trim());

  if (opts.search?.trim()) params.set("search", opts.search.trim());

  const res = await api.get<PaginatedInventoryUnits>(`/api/v1/inventory?${params.toString()}`);
  const items = res.items ?? [];
  return {
    items,
    total: res.total ?? items.length,
    page: res.page ?? page,
    page_size: res.page_size ?? pageSize,
    pages: res.pages ?? 1,
    rows: items,
  };
}

export async function getInventoryUnit(id: number | string): Promise<InventoryUnitResponse> {
  return await api.get<InventoryUnitResponse>(`/api/v1/inventory/${id}`);
}

export async function createInventoryUnit(values: InventoryUnitCreate): Promise<InventoryUnitResponse> {
  return await api.post<InventoryUnitResponse>("/api/v1/inventory", values);
}

export async function updateInventoryUnit(
  id: number | string,
  values: InventoryUnitUpdate,
): Promise<InventoryUnitResponse> {
  return await api.put<InventoryUnitResponse>(`/api/v1/inventory/${id}`, values);
}

export async function reserveInventoryUnit(
  id: number | string,
  action?: StockActionRequest,
): Promise<InventoryUnitResponse> {
  return await api.post<InventoryUnitResponse>(`/api/v1/inventory/${id}/reserve`, action ?? {});
}

export async function releaseInventoryUnit(
  id: number | string,
  action?: StockActionRequest,
): Promise<InventoryUnitResponse> {
  return await api.post<InventoryUnitResponse>(`/api/v1/inventory/${id}/release`, action ?? {});
}

export async function getVariantStockSummary(variantId: number | string): Promise<VariantStockSummary> {
  return await api.get<VariantStockSummary>(`/api/v1/inventory/summary/${variantId}`);
}

/* ============ ACCESSORIES / OFFERS ============ */

export async function listAccessories() {
  return unwrap(
    await supabase.from("accessories").select("*").eq("is_active", true).order("name"),
  );
}

export async function upsertAccessory(values: Partial<Accessory> & { id?: string }) {
  if (values.id)
    return unwrap(
      await supabase.from("accessories").update(values).eq("id", values.id).select().single(),
    );
  return unwrap(
    await supabase
      .from("accessories")
      .insert(values as Database["public"]["Tables"]["accessories"]["Insert"])
      .select()
      .single(),
  );
}

export async function deleteAccessory(id: string) {
  const { error } = await supabase.from("accessories").update({ is_active: false }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listOffers(activeOnly = false) {
  let q = supabase.from("offers").select("*").order("end_date", { ascending: false });
  if (activeOnly) {
    const today = new Date().toISOString().slice(0, 10);
    q = q.eq("is_active", true).lte("start_date", today).gte("end_date", today);
  }
  return unwrap(await q);
}

export async function upsertOffer(values: Partial<Offer> & { id?: string }) {
  if (values.id)
    return unwrap(
      await supabase.from("offers").update(values).eq("id", values.id).select().single(),
    );
  return unwrap(
    await supabase
      .from("offers")
      .insert(values as Database["public"]["Tables"]["offers"]["Insert"])
      .select()
      .single(),
  );
}

export async function deleteOffer(id: string) {
  const { error } = await supabase.from("offers").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ============ CUSTOMERS (FastAPI REST Backend) ============ */

export async function listCustomers(
  opts: {
    search?: string | undefined;
    city?: string | undefined;
    minBudget?: number | undefined;
    maxBudget?: number | undefined;
    sortBy?: ("id" | "full_name" | "budget" | "created_at") | undefined;
    sortOrder?: ("asc" | "desc") | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
  } | string = {},
): Promise<PaginatedCustomers & { rows: CustomerResponse[] }> {
  const options = typeof opts === "string" ? { search: opts } : opts;
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 50;

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(pageSize));

  if (options.search?.trim()) params.set("search", options.search.trim());
  if (options.city?.trim()) params.set("city", options.city.trim());
  if (options.minBudget !== undefined) params.set("min_budget", String(options.minBudget));
  if (options.maxBudget !== undefined) params.set("max_budget", String(options.maxBudget));
  if (options.sortBy) params.set("sort_by", options.sortBy);
  if (options.sortOrder) params.set("sort_order", options.sortOrder);

  const res = await api.get<PaginatedCustomers>(`/api/v1/customers?${params.toString()}`);
  const items = res.items ?? [];
  return {
    items,
    total: res.total ?? items.length,
    page: res.page ?? page,
    page_size: res.page_size ?? pageSize,
    pages: res.pages ?? 1,
    rows: items,
  };
}

export async function getCustomer(id: number | string): Promise<CustomerResponse> {
  return await api.get<CustomerResponse>(`/api/v1/customers/${id}`);
}

export async function createCustomer(values: CustomerCreate): Promise<CustomerResponse> {
  return await api.post<CustomerResponse>("/api/v1/customers", values);
}

export async function updateCustomer(
  id: number | string,
  values: CustomerUpdate,
): Promise<CustomerResponse> {
  return await api.put<CustomerResponse>(`/api/v1/customers/${id}`, values);
}

export async function deleteCustomer(id: number | string): Promise<{ success: boolean; message: string }> {
  return await api.delete<{ success: boolean; message: string }>(`/api/v1/customers/${id}`);
}

export async function findCustomerByPhone(phone: string): Promise<CustomerResponse | null> {
  const normalized = phone.replace(/[\s-]/g, "").replace(/^\+91/, "");
  const res = await listCustomers({ search: normalized, pageSize: 5 });
  const exact = res.items.find(
    (c) => c.phone.replace(/[\s-]/g, "").replace(/^\+91/, "") === normalized,
  );
  return exact ?? res.items[0] ?? null;
}

export async function upsertCustomer(
  values: Partial<CustomerCreate> & { id?: number | string; full_name?: string; name?: string; phone: string },
): Promise<CustomerResponse> {
  const fullName = values.full_name || values.name || "";
  const payload: CustomerCreate = {
    full_name: fullName,
    phone: values.phone,
    email: values.email ?? null,
    address: values.address ?? null,
    city: values.city ?? null,
    state: values.state ?? null,
    pincode: values.pincode ?? null,
    occupation: values.occupation ?? null,
    preferred_language: values.preferred_language ?? "English",
    budget: values.budget ?? null,
  };

  if (values.id) {
    return await updateCustomer(values.id, payload);
  }
  const existing = await findCustomerByPhone(values.phone);
  if (existing) {
    return await updateCustomer(existing.id, payload);
  }
  return await createCustomer(payload);
}

export async function getCustomerTimeline(customerId: number | string) {
  const quotesRes = await listQuotations({ customerId: Number(customerId), pageSize: 50 });
  return {
    quotations: quotesRes.items,
    leads: [],
  };
}

/* ============ QUOTATIONS (FastAPI REST Backend) ============ */

export async function listQuotations(
  opts: {
    search?: string;
    status?: QuotationStatus | BackendQuotationStatus | "all";
    from?: string;
    to?: string;
    executiveId?: string | number;
    customerId?: number;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 10;

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(pageSize));

  if (opts.status && opts.status !== "all") {
    params.set("status", opts.status.toUpperCase());
  }
  if (opts.from) params.set("from_date", opts.from);
  if (opts.to) params.set("to_date", opts.to);
  if (opts.executiveId && typeof opts.executiveId === "number") {
    params.set("sales_executive_id", String(opts.executiveId));
  }
  if (opts.customerId) {
    params.set("customer_id", String(opts.customerId));
  }

  const endpoint = `/api/v1/quotations?${params.toString()}`;
  const res = await api.get<PaginatedQuotations>(endpoint);

  let items = res.items ?? [];
  // Client-side search across quotation number, customer name, phone, or variant name
  if (opts.search && opts.search.trim()) {
    const s = opts.search.toLowerCase().trim();
    items = items.filter(
      (q) =>
        q.quotation_number?.toLowerCase().includes(s) ||
        q.customer?.full_name?.toLowerCase().includes(s) ||
        q.customer?.phone?.includes(s) ||
        q.variant?.name?.toLowerCase().includes(s),
    );
  }

  return {
    items,
    total: res.total ?? 0,
    page: res.page ?? page,
    page_size: res.page_size ?? pageSize,
    pages: res.pages ?? 1,
    // Backwards-compatibility aliases:
    rows: items as any,
    count: res.total ?? 0,
  };
}

export async function getQuotation(id: number | string): Promise<QuotationResponse> {
  return await api.get<QuotationResponse>(`/api/v1/quotations/${id}`);
}

export async function createQuotation(values: QuotationCreate): Promise<QuotationResponse> {
  return await api.post<QuotationResponse>("/api/v1/quotations", values);
}

export async function updateQuotationStatus(
  id: number | string,
  req: QuotationStatusUpdate,
): Promise<QuotationResponse> {
  return await api.put<QuotationResponse>(`/api/v1/quotations/${id}/status`, req);
}

export async function updateQuotation(
  id: number | string,
  values: { status: BackendQuotationStatus | QuotationStatus; reason?: string | null } | Partial<Quotation>,
): Promise<QuotationResponse> {
  const rawStatus = (values as any).status ?? "GENERATED";
  const status = String(rawStatus).toUpperCase() as BackendQuotationStatus;
  const reason = (values as any).reason ?? null;
  return await updateQuotationStatus(id, { status, reason });
}

export async function deleteQuotation(_id: number | string): Promise<void> {
  throw new Error(
    "Quotation deletion is not supported by the FastAPI backend (quotations are immutable sales records). Use status update CANCELLED instead.",
  );
}

export async function downloadQuotationPdf(id: number | string): Promise<Blob> {
  return await api.getBlob(`/api/v1/quotations/${id}/pdf`);
}

export async function sendQuotationWhatsApp(id: number | string) {
  return await api.post(`/api/v1/quotations/${id}/send-whatsapp`);
}

/* ============ LEADS & FOLLOW-UPS ============ */

const LEAD_SELECT =
  "*, customer:customers(id,name,phone,city), quotation:quotations(id,quotation_number,total_amount,status), assignee:profiles!leads_assigned_to_fkey(id,name)";

export async function listLeads(opts: { stage?: LeadStage | "all"; search?: string } = {}) {
  let q = supabase.from("leads").select(LEAD_SELECT).order("updated_at", { ascending: false });
  if (opts.stage && opts.stage !== "all") q = q.eq("stage", opts.stage);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  let rows = (data ?? []) as unknown as LeadWithRelations[];
  if (opts.search) {
    const s = opts.search.toLowerCase();
    rows = rows.filter(
      (l) =>
        l.customer?.name.toLowerCase().includes(s) || l.customer?.phone.includes(opts.search ?? ""),
    );
  }
  return rows;
}

export async function createLead(values: Database["public"]["Tables"]["leads"]["Insert"]) {
  const { data: auth } = await supabase.auth.getUser();
  return unwrap(
    await supabase
      .from("leads")
      .insert({ assigned_to: auth.user?.id ?? null, ...values })
      .select(LEAD_SELECT)
      .single(),
  ) as unknown as LeadWithRelations;
}

export async function updateLeadStage(id: string, stage: LeadStage, lostReason?: string) {
  return unwrap(
    await supabase
      .from("leads")
      .update({ stage, lost_reason: stage === "lost" ? (lostReason ?? null) : null })
      .eq("id", id)
      .select(LEAD_SELECT)
      .single(),
  ) as unknown as LeadWithRelations;
}

export async function listFollowUps(opts: { leadId?: string; upcomingOnly?: boolean } = {}) {
  let q = supabase
    .from("follow_ups")
    .select("*, lead:leads(id, stage, customer:customers(id,name,phone))")
    .order("follow_up_date");
  if (opts.leadId) q = q.eq("lead_id", opts.leadId);
  if (opts.upcomingOnly) q = q.eq("status", "pending");
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createFollowUp(
  values: Database["public"]["Tables"]["follow_ups"]["Insert"],
) {
  const { data: auth } = await supabase.auth.getUser();
  return unwrap(
    await supabase
      .from("follow_ups")
      .insert({ ...values, created_by: auth.user?.id ?? null })
      .select()
      .single(),
  );
}

export async function completeFollowUp(id: string) {
  return unwrap(
    await supabase.from("follow_ups").update({ status: "done" }).eq("id", id).select().single(),
  );
}

/* ============ NOTIFICATIONS ============ */

export async function listNotifications() {
  return unwrap(
    await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30),
  );
}

export async function pushNotification(input: {
  title: string;
  body?: string;
  type?: string;
  link?: string;
}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  return unwrap(
    await supabase
      .from("notifications")
      .insert({ ...input, user_id: auth.user.id })
      .select()
      .single(),
  );
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", auth.user.id)
    .eq("is_read", false);
}

/* ============ AUDIT ============ */

export async function logAudit(
  action: string,
  entity: string,
  entityId?: string,
  metadata: Json = {},
) {
  const { data: auth } = await supabase.auth.getUser();
  await supabase.from("audit_logs").insert({
    user_id: auth.user?.id ?? null,
    action,
    entity,
    entity_id: entityId ?? null,
    metadata,
  });
}

export async function listAuditLogs(limit = 60) {
  return unwrap(
    await supabase
      .from("audit_logs")
      .select("*, actor:profiles(id,name)")
      .order("created_at", { ascending: false })
      .limit(limit),
  );
}

/* ============ ADMIN / USERS ============ */

export async function listStaff() {
  const [profiles, roles] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at"),
    supabase.from("user_roles").select("*"),
  ]);
  if (profiles.error) throw new Error(profiles.error.message);
  return (profiles.data ?? []).map((p) => ({
    ...p,
    roles: (roles.data ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as AppRole),
  }));
}

/* ============ SETTINGS ============ */

export async function getSetting<T = Record<string, unknown>>(key: string) {
  const { data } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value ?? null) as T | null;
}

export async function listSettings() {
  return unwrap(await supabase.from("settings").select("*"));
}

export async function saveSetting(key: string, value: Json) {
  const existing = await supabase.from("settings").select("id").eq("key", key).maybeSingle();
  if (existing.data) {
    return unwrap(
      await supabase
        .from("settings")
        .update({ value, updated_at: new Date().toISOString() })
        .eq("key", key)
        .select()
        .single(),
    );
  }
  return unwrap(await supabase.from("settings").insert({ key, value }).select().single());
}

/* ============ GLOBAL SEARCH ============ */

export async function globalSearch(term: string) {
  if (!term.trim()) return { customers: [], vehicles: [], quotations: [] };
  const [custRes, vehRes, quoteRes] = await Promise.all([
    listCustomers({ search: term, pageSize: 5 }),
    listVehicles({ search: term, pageSize: 5 }),
    listQuotations({ search: term, pageSize: 5 }),
  ]);
  return {
    customers: custRes.items,
    vehicles: vehRes.items,
    quotations: quoteRes.items,
  };
}

/* ============ ANALYTICS ============ */

export interface DashboardMetrics {
  todayCount: number;
  pendingCount: number;
  sentCount: number;
  convertedValue: number;
  monthGrowth: number;
  monthly: { month: string; quotations: number; revenue: number }[];
  recent: QuotationWithRelations[];
  activity: { id: string; text: string; time: string }[];
}

const QUOTATION_SELECT = `
  *,
  customer:customers(*),
  vehicle:vehicles(*),
  items:quotation_items(*),
  creator:profiles!quotations_created_by_fkey(*)
`;

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const since = new Date();
  since.setMonth(since.getMonth() - 7);
  since.setDate(1);

  const [{ data: quotationRows }, { data: recentRows }, { data: activityRows }] = await Promise.all([
    supabase
      .from("quotations")
      .select("id,total_amount,status,created_at")
      .gte("created_at", since.toISOString()),
    supabase.from("quotations").select(QUOTATION_SELECT).order("created_at", { ascending: false }).limit(5),
    supabase.from("audit_logs").select("id,action,entity,created_at").order("created_at", { ascending: false }).limit(6),
  ]);

  const rows = quotationRows ?? [];
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const buckets = new Map<string, { quotations: number; revenue: number }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    buckets.set(d.toLocaleString("en-IN", { month: "short" }), { quotations: 0, revenue: 0 });
  }

  for (const row of rows) {
    const label = new Date(row.created_at).toLocaleString("en-IN", { month: "short" });
    const bucket = buckets.get(label);
    if (!bucket) continue;
    bucket.quotations += 1;
    if (row.status === "converted") bucket.revenue += Number(row.total_amount);
  }

  const monthly = [...buckets.entries()].map(([month, v]) => ({
    month,
    quotations: v.quotations,
    revenue: Math.round(v.revenue / 100000),
  }));

  const current = monthly[monthly.length - 1]?.quotations ?? 0;
  const previous = monthly[monthly.length - 2]?.quotations ?? 0;
  const monthGrowth = previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;

  return {
    todayCount: rows.filter((r) => new Date(r.created_at) >= startOfToday).length,
    pendingCount: rows.filter((r) => r.status === "draft" || r.status === "sent").length,
    sentCount: rows.filter((r) => r.status !== "draft").length,
    convertedValue: rows
      .filter((r) => r.status === "converted")
      .reduce((sum, r) => sum + Number(r.total_amount), 0),
    monthGrowth: Math.round(monthGrowth * 10) / 10,
    monthly,
    recent: (recentRows ?? []) as unknown as QuotationWithRelations[],
    activity: (activityRows ?? []).map((row) => ({
      id: row.id,
      text: `${row.action.replace(/[._]/g, " ")} · ${row.entity}`,
      time: new Date(row.created_at).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
    })),
  };
}

export interface AnalyticsSummary {
  monthly: { month: string; quotations: number; revenue: number }[];
  statusBreakdown: { status: string; count: number }[];
  topVehicles: { name: string; count: number; value: number }[];
  topExecutives: { name: string; quotations: number; value: number }[];
  conversionRate: number;
  averageTicket: number;
  totalPipeline: number;
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const base = await getDashboardMetrics();
  const { data } = await supabase
    .from("quotations")
    .select(
      "id,total_amount,status,created_at,vehicle:vehicles(brand,model),creator:profiles!quotations_created_by_fkey(name)",
    );

  const rows = (data ?? []) as unknown as {
    total_amount: number;
    status: string;
    vehicle: { brand: string; model: string } | null;
    creator: { name: string } | null;
  }[];

  const byStatus = new Map<string, number>();
  const byVehicle = new Map<string, { count: number; value: number }>();
  const byExec = new Map<string, { quotations: number; value: number }>();

  for (const row of rows) {
    byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);

    if (row.vehicle) {
      const key = `${row.vehicle.brand} ${row.vehicle.model}`;
      const entry = byVehicle.get(key) ?? { count: 0, value: 0 };
      entry.count += 1;
      entry.value += Number(row.total_amount);
      byVehicle.set(key, entry);
    }

    const execName = row.creator?.name ?? "Unassigned";
    const exec = byExec.get(execName) ?? { quotations: 0, value: 0 };
    exec.quotations += 1;
    exec.value += Number(row.total_amount);
    byExec.set(execName, exec);
  }

  const converted = byStatus.get("converted") ?? 0;
  const total = rows.length;

  return {
    monthly: base.monthly,
    statusBreakdown: [...byStatus.entries()].map(([status, count]) => ({ status, count })),
    topVehicles: [...byVehicle.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    topExecutives: [...byExec.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5),
    conversionRate: total ? Math.round((converted / total) * 1000) / 10 : 0,
    averageTicket: total
      ? Math.round(rows.reduce((sum, r) => sum + Number(r.total_amount), 0) / total)
      : 0,
    totalPipeline: rows
      .filter((r) => r.status !== "rejected" && r.status !== "expired")
      .reduce((sum, r) => sum + Number(r.total_amount), 0),
  };
}
