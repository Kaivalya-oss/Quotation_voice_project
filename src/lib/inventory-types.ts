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

export interface InventoryUnitResponse extends InventoryUnitBase {
  id: number;
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
