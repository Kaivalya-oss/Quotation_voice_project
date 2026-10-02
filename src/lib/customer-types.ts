/**
 * Customer Types for FastAPI REST Backend
 * Mirrors Pydantic schemas in app/schemas/customer.py
 */

export interface CustomerBase {
  full_name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  occupation?: string | null;
  preferred_language?: string;
  budget?: string | number | null;
}

export interface CustomerCreate extends CustomerBase {}

export interface CustomerUpdate {
  full_name?: string;
  phone?: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  occupation?: string | null;
  preferred_language?: string;
  budget?: string | number | null;
}

export interface CustomerResponse extends CustomerBase {
  id: number;
  preferred_language: string;
  created_at: string;
  updated_at: string;
}

export interface PaginatedCustomers {
  items: CustomerResponse[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}
