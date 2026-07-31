import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import type { AppRole, LeadStage, QuotationStatus } from "@/lib/validators";

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

/* ============ VEHICLES / INVENTORY ============ */

export async function listVehicles(opts: { search?: string; onlyInStock?: boolean } = {}) {
  let q = supabase.from("vehicles").select("*").eq("is_active", true).order("brand");
  if (opts.onlyInStock) q = q.gt("stock", 0);
  if (opts.search) q = q.or(`brand.ilike.%${opts.search}%,model.ilike.%${opts.search}%`);
  return unwrap(await q);
}

export async function upsertVehicle(values: Partial<Vehicle> & { id?: string }) {
  if (values.id) {
    return unwrap(
      await supabase.from("vehicles").update(values).eq("id", values.id).select().single(),
    );
  }
  return unwrap(
    await supabase
      .from("vehicles")
      .insert(values as Database["public"]["Tables"]["vehicles"]["Insert"])
      .select()
      .single(),
  );
}

export async function deleteVehicle(id: string) {
  const { error } = await supabase.from("vehicles").update({ is_active: false }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function adjustStock(vehicleId: string, delta: number) {
  const { data: vehicle, error } = await supabase
    .from("vehicles")
    .select("stock")
    .eq("id", vehicleId)
    .single();
  if (error) throw new Error(error.message);
  const next = Math.max(0, (vehicle?.stock ?? 0) + delta);
  return unwrap(
    await supabase
      .from("vehicles")
      .update({ stock: next, stock_updated_at: new Date().toISOString() })
      .eq("id", vehicleId)
      .select()
      .single(),
  );
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

/* ============ CUSTOMERS ============ */

export async function listCustomers(search?: string) {
  let q = supabase.from("customers").select("*").order("created_at", { ascending: false });
  if (search) q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%,city.ilike.%${search}%`);
  return unwrap(await q);
}

export async function findCustomerByPhone(phone: string) {
  const normalized = phone.replace(/[\s-]/g, "").replace(/^\+91/, "");
  const { data } = await supabase
    .from("customers")
    .select("*")
    .or(`phone.eq.${normalized},phone.eq.+91${normalized}`)
    .maybeSingle();
  return data ?? null;
}

export async function upsertCustomer(
  values: Partial<Customer> & { id?: string; name: string; phone: string },
): Promise<Customer> {
  if (values.id) {
    return unwrap(
      await supabase.from("customers").update(values).eq("id", values.id).select().single(),
    );
  }
  const existing = await findCustomerByPhone(values.phone);
  if (existing) {
    const { id: _ignored, ...patch } = values;
    return unwrap(
      await supabase.from("customers").update(patch).eq("id", existing.id).select().single(),
    );
  }
  const { data: auth } = await supabase.auth.getUser();
  return unwrap(
    await supabase
      .from("customers")
      .insert({ ...values, created_by: auth.user?.id ?? null })
      .select()
      .single(),
  );
}

export async function deleteCustomer(id: string) {
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getCustomerTimeline(customerId: string) {
  const [quotations, leads] = await Promise.all([
    supabase
      .from("quotations")
      .select("*, vehicle:vehicles(brand, model, variant)")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("leads")
      .select("*, follow_ups(*)")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
  ]);
  return {
    quotations: quotations.data ?? [],
    leads: leads.data ?? [],
  };
}

/* ============ QUOTATIONS ============ */

const QUOTATION_SELECT =
  "*, customer:customers(id,name,phone,email,city), vehicle:vehicles(id,brand,model,variant,color,image_url), created_by_profile:profiles!quotations_created_by_fkey(id,name)";

export async function listQuotations(
  opts: {
    search?: string;
    status?: QuotationStatus | "all";
    from?: string;
    to?: string;
    executiveId?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 10;
  let q = supabase
    .from("quotations")
    .select(QUOTATION_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (opts.status && opts.status !== "all") q = q.eq("status", opts.status);
  if (opts.from) q = q.gte("created_at", opts.from);
  if (opts.to) q = q.lte("created_at", opts.to);
  if (opts.executiveId) q = q.eq("created_by", opts.executiveId);
  if (opts.search) q = q.ilike("quotation_number", `%${opts.search}%`);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as unknown as QuotationWithRelations[], count: count ?? 0 };
}

export async function getQuotation(id: string) {
  return unwrap(
    await supabase.from("quotations").select(QUOTATION_SELECT).eq("id", id).single(),
  ) as unknown as QuotationWithRelations;
}

export async function createQuotation(
  values: Database["public"]["Tables"]["quotations"]["Insert"],
) {
  const { data: auth } = await supabase.auth.getUser();
  return unwrap(
    await supabase
      .from("quotations")
      .insert({ ...values, created_by: auth.user?.id ?? null })
      .select(QUOTATION_SELECT)
      .single(),
  ) as unknown as QuotationWithRelations;
}

export async function updateQuotation(id: string, values: Partial<Quotation>) {
  return unwrap(
    await supabase.from("quotations").update(values).eq("id", id).select(QUOTATION_SELECT).single(),
  ) as unknown as QuotationWithRelations;
}

export async function deleteQuotation(id: string) {
  const { error } = await supabase.from("quotations").delete().eq("id", id);
  if (error) throw new Error(error.message);
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
  const like = `%${term}%`;
  const [customers, vehicles, quotations] = await Promise.all([
    supabase.from("customers").select("id,name,phone,city").or(`name.ilike.${like},phone.ilike.${like}`).limit(5),
    supabase.from("vehicles").select("id,brand,model,variant").or(`brand.ilike.${like},model.ilike.${like}`).limit(5),
    supabase
      .from("quotations")
      .select("id,quotation_number,total_amount,status")
      .ilike("quotation_number", like)
      .limit(5),
  ]);
  return {
    customers: customers.data ?? [],
    vehicles: vehicles.data ?? [],
    quotations: quotations.data ?? [],
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
