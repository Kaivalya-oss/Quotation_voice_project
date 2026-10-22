import type { UserResponse } from "@/lib/auth-types";
import type { CustomerResponse } from "@/lib/customer-types";
import type { VariantResponse } from "@/lib/vehicle-types";

/** Mirrors the backend TestRide statuses. */
export type TestRideStatus = "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

export interface TestRideCreate {
  customer_id: number;
  variant_id: number;
  scheduled_at: string;
  duration_minutes: number;
  driving_license_number?: string | null;
  notes?: string | null;
}

export interface TestRideResponse {
  id: number;
  customer_id: number;
  variant_id: number;
  sales_executive_id: number;
  scheduled_at: string;
  duration_minutes: number;
  status: TestRideStatus;
  driving_license_number?: string | null;
  feedback_rating?: number | null;
  notes?: string | null;
  customer?: CustomerResponse | null;
  variant?: VariantResponse | null;
  sales_executive?: UserResponse | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedTestRides {
  items: TestRideResponse[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export const testRideStatusStyles: Record<TestRideStatus, string> = {
  REQUESTED: "bg-amber-500/10 text-amber-600",
  CONFIRMED: "bg-blue-500/10 text-blue-600",
  COMPLETED: "bg-emerald-500/10 text-emerald-600",
  CANCELLED: "bg-muted text-muted-foreground",
  NO_SHOW: "bg-destructive/10 text-destructive",
};

/** A ride in one of these states still "covers" the lead — no new booking is needed. */
export const ACTIVE_RIDE_STATUSES = new Set<TestRideStatus>([
  "REQUESTED",
  "CONFIRMED",
  "COMPLETED",
]);
