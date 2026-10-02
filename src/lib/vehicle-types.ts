/**
 * Vehicle / Catalog Types for FastAPI REST Backend
 * Mirrors Pydantic schemas in app/schemas/vehicle.py
 */

export interface BrandResponse {
  id: number;
  name: string;
  country?: string | null;
  logo_url?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface BrandCreate {
  name: string;
  country?: string | null;
  logo_url?: string | null;
  is_active?: boolean;
}

export interface ModelResponse {
  id: number;
  brand_id: number;
  name: string;
  vehicle_type: string; // SCOOTER, MOTORCYCLE, EV
  description?: string | null;
  is_active: boolean;
  brand?: BrandResponse | null;
  created_at: string;
}

export interface ModelCreate {
  brand_id: number;
  name: string;
  vehicle_type?: string;
  description?: string | null;
  is_active?: boolean;
}

export interface VariantBase {
  model_id: number;
  name: string;
  code: string;
  engine_cc?: number | null;
  fuel_type: string; // PETROL, ELECTRIC, HYBRID
  transmission: string; // AUTOMATIC, MANUAL, CVT
  ex_showroom_price: string | number;
  insurance_price?: string | number;
  rto_price?: string | number;
  accessories_price?: string | number;
  color_options?: string | null;
  status?: string; // ACTIVE, DISCONTINUED
  specs_json?: Record<string, any> | null;
}

export interface VariantCreate extends VariantBase {}

export interface VariantUpdate {
  name?: string;
  engine_cc?: number | null;
  fuel_type?: string;
  transmission?: string;
  ex_showroom_price?: string | number;
  insurance_price?: string | number;
  rto_price?: string | number;
  accessories_price?: string | number;
  color_options?: string | null;
  status?: string;
  specs_json?: Record<string, any> | null;
}

export interface VariantResponse extends VariantBase {
  id: number;
  on_road_price: string | number;
  model?: ModelResponse | null;
  created_at: string;
  updated_at: string;
}

export interface AccessoryBase {
  name: string;
  part_number?: string | null;
  price: string | number;
  description?: string | null;
  is_active?: boolean;
}

export interface AccessoryCreate extends AccessoryBase {}

export interface AccessoryResponse extends AccessoryBase {
  id: number;
  is_active: boolean;
  created_at: string;
}

export interface PaginatedVehicles {
  items: VariantResponse[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}
