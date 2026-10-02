import type { UserResponse } from "./auth-types";

/**
 * Backend Quotation Statuses (uppercase enum in PostgreSQL/FastAPI)
 */
export type BackendQuotationStatus =
  | "DRAFT"
  | "GENERATED"
  | "SENT"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED";

/**
 * Nested Customer representation in QuotationResponse
 */
export interface BackendCustomerResponse {
  id: number;
  full_name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  occupation?: string | null;
  preferred_language: string;
  budget?: string | number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Nested Vehicle Brand
 */
export interface BackendBrandResponse {
  id: number;
  name: string;
  country?: string | null;
  logo_url?: string | null;
  is_active: boolean;
  created_at: string;
}

/**
 * Nested Vehicle Model
 */
export interface BackendModelResponse {
  id: number;
  brand_id: number;
  name: string;
  vehicle_type: string;
  description?: string | null;
  is_active: boolean;
  brand?: BackendBrandResponse | null;
  created_at: string;
}

/**
 * Nested Vehicle Variant
 */
export interface BackendVariantResponse {
  id: number;
  model_id: number;
  name: string;
  code: string;
  engine_cc?: number | null;
  fuel_type: string;
  transmission: string;
  ex_showroom_price: string;
  insurance_price: string;
  rto_price: string;
  accessories_price: string;
  on_road_price: string;
  color_options?: string | null;
  status: string;
  specs_json?: Record<string, unknown> | null;
  model?: BackendModelResponse | null;
  created_at: string;
  updated_at: string;
}

/**
 * Catalog Accessory
 */
export interface BackendAccessoryResponse {
  id: number;
  name: string;
  part_number?: string | null;
  price: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
}

/**
 * Promotional Offer
 */
export interface BackendOfferResponse {
  id: number;
  title: string;
  description?: string | null;
  discount_type: "PERCENTAGE" | "FIXED";
  discount_value: string;
  valid_from: string;
  valid_until: string;
  applicable_brand_id?: number | null;
  applicable_model_id?: number | null;
  applicable_variant_id?: number | null;
  min_order_value: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Custom quotation item schema for QuotationCreate
 */
export interface QuotationItemCreate {
  accessory_id?: number | null;
  item_name: string;
  item_type?: string; // "ACCESSORY", "INSURANCE_ADDON", etc.
  unit_price: number | string;
  quantity?: number;
}

/**
 * Quotation item in response
 */
export interface QuotationItemResponse {
  id: number;
  item_name: string;
  item_type: string;
  unit_price: string;
  quantity: number;
  total_price: string;
}

/**
 * Payload for POST /api/v1/quotations
 */
export interface QuotationCreate {
  customer_id: number;
  variant_id: number;
  accessory_ids?: number[];
  custom_items?: QuotationItemCreate[];
  offer_id?: number | null;
  down_payment: number | string;
  loan_tenure?: number;
  interest_rate?: number | string;
  notes?: string | null;
}

/**
 * Payload for PUT /api/v1/quotations/{id}/status
 */
export interface QuotationStatusUpdate {
  status: BackendQuotationStatus;
  reason?: string | null;
}

/**
 * Response model for Quotation
 */
export interface QuotationResponse {
  id: number;
  quotation_number: string;
  customer_id: number;
  sales_executive_id: number;
  variant_id: number;
  offer_id?: number | null;

  // Pricing breakdown (Decimal strings from backend)
  base_price: string;
  insurance: string;
  rto: string;
  accessories: string;
  discount: string;
  final_price: string;

  // Finance breakdown
  down_payment: string;
  loan_amount: string;
  interest_rate: string;
  loan_tenure: number;
  emi: string;

  status: BackendQuotationStatus;
  pdf_url?: string | null;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;

  customer?: BackendCustomerResponse | null;
  sales_executive?: UserResponse | null;
  variant?: BackendVariantResponse | null;
  offer?: BackendOfferResponse | null;
  items: QuotationItemResponse[];
}

/**
 * Paginated list response for GET /api/v1/quotations
 */
export interface PaginatedQuotations {
  items: QuotationResponse[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

/**
 * Response for POST /api/v1/quotations/{id}/send-whatsapp
 */
export interface WhatsAppDispatchResponse {
  provider: string;
  status: string;
  message_id: string;
  recipient?: string;
  note?: string;
  details?: unknown;
}
