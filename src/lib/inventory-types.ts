/**
 * Inventory Types for FastAPI REST Backend
 * Mirrors Pydantic schemas in app/schemas/inventory.py
 */

import type { VariantResponse } from "./vehicle-types";

export type InventoryStatus =
  | "AVAILABLE"
  | "RESERVED"
  | "SOLD"
  | "SERVICE"
  | "IN_TRANSIT";

export interface InventoryUnitBase {
  variant_id: number;
  vin_chassis_number: string;
  engine_number: string;
  color: string;
  status: InventoryStatus;
  branch_name: string;
  arrival_date?: string | null | undefined;
  notes?: string | null | undefined;
}

export interface InventoryUnitCreate extends InventoryUnitBase {}

export interface InventoryUnitUpdate {
  color?: string | null | undefined;
  status?: InventoryStatus | null | undefined;
  branch_name?: string | null | undefined;
  arrival_date?: string | null | undefined;
  notes?: string | null | undefined;
}

export const INVENTORY_STATUS_LABEL: Record<InventoryStatus, string> = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  SOLD: "Sold",
  SERVICE: "Service",
  IN_TRANSIT: "In Transit",
};

/** States a new unit may start in (RESERVED/SOLD are reached through the workflow). */
export const INITIAL_INVENTORY_STATUSES: InventoryStatus[] = ["AVAILABLE", "IN_TRANSIT", "SERVICE"];

/**
 * Status changes allowed from the edit form, mirroring the backend
 * (app/services/inventory_service.py INVENTORY_STATUS_TRANSITIONS). Reserving and releasing
 * use the dedicated Reserve/Release actions. The backend rejects anything else.
 */
export const INVENTORY_STATUS_TRANSITIONS: Record<InventoryStatus, InventoryStatus[]> = {
  AVAILABLE: ["SOLD", "SERVICE", "IN_TRANSIT"],
  RESERVED: ["SOLD"],
  IN_TRANSIT: ["AVAILABLE", "SERVICE"],
  SERVICE: ["AVAILABLE", "IN_TRANSIT"],
  SOLD: [],
};

export interface InventoryUnitResponse extends InventoryUnitBase {
  id: number;
  reserved_by_user_id?: number | null;
  reserved_at?: string | null;
  variant?: VariantResponse | null;
  created_at: string;
  updated_at: string;
}

export interface VariantStockSummary {
  variant_id: number;
  variant_name: string;
  total_units: number;
  available_units: number;
  reserved_units: number;
  sold_units: number;
  service_units: number;
  in_transit_units: number;
}

export interface StockActionRequest {
  notes?: string | null;
}

export interface PaginatedInventoryUnits {
  items: InventoryUnitResponse[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}
