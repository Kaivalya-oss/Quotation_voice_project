/**
 * Multi-tenant onboarding client (FastAPI /api/v1/platform). VITE_MULTI_TENANT=true turns it on;
 * otherwise the app keeps its single-showroom sign-in. The browser never stores database credentials.
 */
import { api, tokenStorage } from "@/lib/api";
import type { UserResponse } from "@/lib/auth-types";

export const MULTI_TENANT = import.meta.env["VITE_MULTI_TENANT"] === "true";

export type TenantRole = "OWNER" | "HEAD_OF_SALES" | "SALESPERSON";
export const TENANT_ROLES: TenantRole[] = ["OWNER", "HEAD_OF_SALES", "SALESPERSON"];
export const TENANT_ROLE_LABEL: Record<TenantRole, string> = {
  OWNER: "Owner",
  HEAD_OF_SALES: "Head of Sales",
  SALESPERSON: "Salesperson",
};

export interface PlatformUser {
  id: string;
  email: string;
  full_name: string | null;
  account_status: string;
}

export interface MembershipSummary {
  membership_id: string;
  tenant_id: string;
  showroom_name: string;
  slug: string;
  tenant_status: string;
  role: TenantRole;
  status: string;
}

export interface PlatformTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: PlatformUser;
  active_tenant: MembershipSummary | null;
}

export interface MeResponse {
  user: PlatformUser;
  memberships: MembershipSummary[];
  active_tenant_id: string | null;
  active_role: TenantRole | null;
}

export interface ConnectionDetails {
  database_provider: string | null;
  database_type: string;
  connection_status: string;
  schema_version: string | null;
  last_health_check: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
}

export interface SetupStatus {
  tenant_id: string;
  showroom_name: string;
  tenant_status: string;
  subscription_status: string;
  connection_status: string;
  operational: boolean;
  next_step: string | null;
  connection: ConnectionDetails | null;
}

export interface Member {
  membership_id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: TenantRole;
  status: string;
  invitation_expires_at: string | null;
  created_at: string;
}

export type DatabaseProvider = "SUPABASE" | "NEON" | "AWS_RDS" | "AZURE" | "OTHER";

export interface DatabaseConnectionInput {
  provider: DatabaseProvider;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ca_certificate?: string | null;
}

const P = "/api/v1/platform";
const DB = `${P}/tenants/current/database`;

/** Shape existing screens expect from useAuth; the role is the one held in the active showroom. */
export function toAppUser(user: PlatformUser, role: TenantRole | null): UserResponse {
  return {
    id: 0,
    email: user.email,
    full_name: user.full_name ?? user.email,
    phone: null,
    role: { id: 0, name: role ?? "", description: null },
    is_active: true,
    last_login_at: null,
    created_at: "",
  };
}

export function storeSession(tokens: PlatformTokens) {
  tokenStorage.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    user: toAppUser(tokens.user, tokens.active_tenant?.role ?? null),
  });
  clearGateCache();
}

// ---- Gate: only an operational showroom reaches business pages ----

let gateCache: { status: SetupStatus; at: number } | null = null;
const GATE_TTL_MS = 30_000;

export function clearGateCache() {
  gateCache = null;
}

export async function cachedSetupStatus(): Promise<SetupStatus> {
  if (gateCache && Date.now() - gateCache.at < GATE_TTL_MS) return gateCache.status;
  const status = await getSetupStatus();
  gateCache = { status, at: Date.now() };
  return status;
}

// ---- Accounts and showrooms ----

export const registerShowroom = (body: {
  showroom_name: string;
  email: string;
  password: string;
  full_name: string;
}) => api.post<PlatformTokens>(`${P}/showrooms/register`, body, { skipAuth: true });

export const createShowroom = (showroom_name: string) =>
  api.post<PlatformTokens>(`${P}/showrooms`, { showroom_name });

export const platformLogin = (email: string, password: string) =>
  api.post<PlatformTokens>(`${P}/auth/login`, { email, password }, { skipAuth: true });

export const getMe = () => api.get<MeResponse>(`${P}/me`);

export const selectShowroom = (tenant_id: string) =>
  api.post<PlatformTokens>(`${P}/tenants/select`, { tenant_id });

export const getSetupStatus = () => api.get<SetupStatus>(`${P}/tenants/current/setup-status`);

// ---- Team ----

export const listMembers = () => api.get<Member[]>(`${P}/tenants/current/members`);

export const inviteMember = (email: string, role: TenantRole) =>
  api.post<Member & { invitation_token: string }>(`${P}/tenants/current/invitations`, {
    email,
    role,
  });

export const acceptInvitation = (body: { token: string; full_name?: string; password?: string }) =>
  api.post<PlatformTokens>(`${P}/invitations/accept`, body, {
    skipAuth: !tokenStorage.getAccessToken(),
  });

export const deactivateMember = (id: string) =>
  api.post<Member>(`${P}/tenants/current/members/${id}/deactivate`);

export const updateMemberRole = (id: string, role: TenantRole) =>
  api.put<Member>(`${P}/tenants/current/members/${id}/role`, { role });

// ---- Showroom database (Owner only). Long timeouts: first setup runs every migration. ----

const SETUP_TIMEOUT = { timeoutMs: 120_000 };

export const testDatabase = (input: DatabaseConnectionInput) =>
  api.post<{ schema_version: string | null; latest_schema_version: string }>(
    `${DB}/test`,
    input,
    SETUP_TIMEOUT,
  );

export const connectDatabase = (input: DatabaseConnectionInput) =>
  api.post<ConnectionDetails>(`${DB}/connect`, input, SETUP_TIMEOUT);

export const migrateDatabase = () =>
  api.post<ConnectionDetails>(`${DB}/migrate`, undefined, SETUP_TIMEOUT);

export const checkDatabaseHealth = () =>
  api.post<{ healthy: boolean; error_code: string | null; checked_at: string }>(
    `${DB}/health`,
    undefined,
    SETUP_TIMEOUT,
  );

export const rotateDatabaseCredentials = (password: string, username?: string) =>
  api.post<ConnectionDetails>(
    `${DB}/rotate-credentials`,
    { password, username: username || null },
    SETUP_TIMEOUT,
  );

export const revokeDatabase = () => api.post<ConnectionDetails>(`${DB}/revoke`);
