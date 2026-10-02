/**
 * FastAPI Authentication & User Types
 * Directly reflects Pydantic schemas in backend/app/schemas/auth.py & common.py
 */

export interface RoleResponse {
  id: number;
  name: string;
  description: string | null;
}

export type Role = RoleResponse;

export interface UserResponse {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  role: RoleResponse;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: UserResponse;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  full_name: string;
  phone?: string | null;
  password: string;
  role_name?: string;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiErrorDetail;
  message?: string;
}
