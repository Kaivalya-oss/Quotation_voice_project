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
 * Manual status changes offered in the UI, mirroring the backend state machine
 * (app/services/quotation_service.py QUOTATION_STATUS_TRANSITIONS). The backend rejects
 * anything else and refuses to accept a quotation past its expiry date.
 */
export const QUOTATION_STATUS_TRANSITIONS: Record<BackendQuotationStatus, BackendQuotationStatus[]> = {
  DRAFT: ["GENERATED", "CANCELLED"],
  GENERATED: ["SENT", "ACCEPTED", "REJECTED", "CANCELLED"],
  SENT: ["ACCEPTED", "REJECTED", "CANCELLED"],
  ACCEPTED: ["CANCELLED"],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

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
  details_json?: Record<string, any> | null;
}

/**
 * Payload for POST /api/v1/quotations
 */
export type PaymentMode = "CASH" | "FINANCE";

export interface QuotationCreate {
  customer_id: number;
  variant_id: number;
  compare_variant_id?: number | null | undefined;
  accessory_ids?: number[];
  custom_items?: QuotationItemCreate[];
  offer_id?: number | null;
  compare_offer_id?: number | null | undefined;
  payment_mode: PaymentMode;
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
  /** Option A only when is_comparison is true; use the VEHICLE_OPTION items for prices. */
  final_price: string;
  payment_mode: PaymentMode;
  is_comparison: boolean;

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
 * Provider result nested under `delivery`.
 * status is "SENT" for the Meta Cloud API provider, "MOCK_SENT" when the backend
 * has no WhatsApp credentials and only simulates (logs) the message.
 */
export interface WhatsAppDeliveryResult {
  provider: string;
  status: "SENT" | "MOCK_SENT" | string;
  message_id: string;
  recipient?: string;
  note?: string;
  details?: unknown;
}

/**
 * Response for POST /api/v1/quotations/{id}/send-whatsapp (after envelope unwrap)
 */
export interface WhatsAppDispatchResponse {
  /** True only for a real provider delivery (same as `delivered`). */
  success: boolean;
  delivered: boolean;
  /** True when the backend has no WhatsApp credentials and only simulated the send. */
  simulated: boolean;
  quotation_number: string;
  /** Quotation status after the attempt; unchanged (not SENT) for simulated sends. */
  quotation_status: BackendQuotationStatus;
  delivery: WhatsAppDeliveryResult;
}

/** Response for POST /api/v1/quotations/{id}/send-email (after envelope unwrap) */
export interface EmailDispatchResponse {
  /** True only when the email was really handed to the mail server. */
  delivered: boolean;
  /** True when the server has no SMTP credentials and nothing was sent. */
  simulated: boolean;
  status: "SENT" | "SIMULATED";
  recipient: string;
  quotation_number: string;
  quotation_status: BackendQuotationStatus;
  /** Whether the admin notice email was sent too. */
  admin_notified: boolean;
  /** Whether the quotation PDF was attached. */
  attachment: boolean;
  note?: string;
}

/** True only when the backend reports a real provider delivery, never for MOCK_SENT */
export function isRealWhatsAppDelivery(res: WhatsAppDispatchResponse | null | undefined): boolean {
  return res?.delivered === true && res.delivery?.status === "SENT";
}
