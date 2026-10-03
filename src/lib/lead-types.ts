/**
 * Lead & Follow-up Types for FastAPI REST Backend
 * Mirrors Pydantic schemas in app/schemas/lead.py and app/schemas/followup.py
 */
import type { UserResponse } from "./auth-types";
import type { CustomerResponse } from "./customer-types";
import type { VariantResponse } from "./vehicle-types";

export const LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "TEST_RIDE",
  "NEGOTIATION",
  "BOOKED",
  "PURCHASED",
  "LOST",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * Next stages offered as actions in the UI, mirroring the backend state machine
 * (app/services/lead_service.py VALID_TRANSITIONS). This only decides which buttons to show;
 * the backend remains authoritative and rejects anything else.
 */
export const LEAD_NEXT_STATUSES: Record<LeadStatus, readonly LeadStatus[]> = {
  NEW: ["CONTACTED", "LOST"],
  CONTACTED: ["INTERESTED", "LOST"],
  INTERESTED: ["TEST_RIDE", "NEGOTIATION", "LOST"],
  TEST_RIDE: ["NEGOTIATION", "LOST"],
  NEGOTIATION: ["BOOKED", "LOST"],
  BOOKED: ["PURCHASED", "LOST"],
  PURCHASED: [],
  LOST: ["NEW", "CONTACTED"],
};

/** Default reason recorded when an action button is used without a typed note. */
export const LEAD_ACTION_DEFAULT_REASON: Partial<Record<LeadStatus, string>> = {
  CONTACTED: "Customer contacted",
  INTERESTED: "Customer is interested",
  TEST_RIDE: "Customer agreed to test drive",
  NEGOTIATION: "Price negotiation started",
  BOOKED: "Booking confirmed",
  PURCHASED: "Vehicle purchased",
  LOST: "Customer not proceeding",
  NEW: "Lead reopened",
};

export const LEAD_SOURCES = ["WALK_IN", "ONLINE", "REFERRAL", "PHONE_INQUIRY", "CAMPAIGN"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

export const FOLLOWUP_TYPES = ["CALL", "VISIT", "WHATSAPP", "EMAIL"] as const;
export type FollowupType = (typeof FOLLOWUP_TYPES)[number];

export type FollowupStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

/** Human-readable label for any of the enum values above */
export function enumLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Badge colours per lead stage */
export const leadStatusStyles: Record<string, string> = {
  NEW: "bg-primary/10 text-primary",
  CONTACTED: "bg-blue-500/10 text-blue-600",
  INTERESTED: "bg-amber-500/15 text-amber-700",
  TEST_RIDE: "bg-violet-500/10 text-violet-600",
  NEGOTIATION: "bg-orange-500/15 text-orange-700",
  BOOKED: "bg-success/15 text-success",
  PURCHASED: "bg-success/25 text-success",
  LOST: "bg-destructive/10 text-destructive",
};

export interface LeadStatusHistoryResponse {
  id: number;
  from_status: string;
  to_status: string;
  changed_by_user_id?: number | null;
  reason?: string | null;
  created_at: string;
}

export interface LeadCreate {
  customer_id: number;
  assigned_salesperson_id?: number | null;
  source?: LeadSource;
  priority?: LeadPriority;
  interested_variant_id?: number | null;
  expected_purchase_date?: string | null;
  next_followup_date?: string | null;
  notes?: string | null;
}

export interface LeadUpdate {
  assigned_salesperson_id?: number | null;
  source?: LeadSource;
  priority?: LeadPriority;
  interested_variant_id?: number | null;
  expected_purchase_date?: string | null;
  next_followup_date?: string | null;
  notes?: string | null;
}

/** Payload for POST /api/v1/leads/{id}/status — the backend FSM validates the transition */
export interface LeadStatusTransitionRequest {
  to_status: LeadStatus;
  reason?: string | null;
  /** Status the user saw; the backend answers 409 LEAD_STATE_CHANGED if the lead moved on. */
  from_status?: LeadStatus | null;
}

export interface LeadResponse {
  id: number;
  customer_id: number;
  assigned_salesperson_id?: number | null;
  source: LeadSource;
  status: LeadStatus;
  priority: LeadPriority;
  interested_variant_id?: number | null;
  expected_purchase_date?: string | null;
  next_followup_date?: string | null;
  notes?: string | null;
  customer?: CustomerResponse | null;
  assigned_salesperson?: UserResponse | null;
  interested_variant?: VariantResponse | null;
  status_history: LeadStatusHistoryResponse[];
  created_at: string;
  updated_at: string;
}

export interface PaginatedLeads {
  items: LeadResponse[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface FollowupCreate {
  lead_id: number;
  scheduled_at: string;
  type: FollowupType;
  notes?: string | null;
}

export interface FollowupResponse {
  id: number;
  lead_id: number;
  scheduled_at: string;
  type: FollowupType;
  notes?: string | null;
  status: FollowupStatus;
  assigned_user_id: number;
  completed_at?: string | null;
  assigned_user?: UserResponse | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedFollowups {
  items: FollowupResponse[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}
