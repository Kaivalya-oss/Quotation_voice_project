import type { TokenResponse, UserResponse } from "./auth-types";

/**
 * Storage keys for authentication data
 */
export const AUTH_STORAGE_KEYS = {
  ACCESS_TOKEN: "auth.access_token",
  REFRESH_TOKEN: "auth.refresh_token",
  USER: "auth.user",
} as const;

/**
 * Centralized token storage with SSR safety
 */
export const tokenStorage = {
  getAccessToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN);
  },

  setAccessToken(token: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN, token);
  },

  getRefreshToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN);
  },

  setRefreshToken(token: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN, token);
  },

  getUser(): UserResponse | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(AUTH_STORAGE_KEYS.USER);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as UserResponse;
    } catch {
      return null;
    }
  },

  setUser(user: UserResponse): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(AUTH_STORAGE_KEYS.USER, JSON.stringify(user));
  },

  setSession(data: { access_token: string; refresh_token: string; user?: UserResponse }): void {
    this.setAccessToken(data.access_token);
    this.setRefreshToken(data.refresh_token);
    if (data.user) {
      this.setUser(data.user);
    }
  },

  clear(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(AUTH_STORAGE_KEYS.USER);
  },
};

/**
 * Custom error class preserving backend error structure
 */
export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Normalize and resolve the API base URL
 */
export function getBaseUrl(): string {
  const envUrl = import.meta.env["VITE_API_BASE_URL"] as string | undefined;
  if (envUrl) {
    return envUrl.replace(/\/+$/, "");
  }
  return "http://localhost:8000";
}

/**
 * Resolve full request URL from base URL and endpoint
 */
function resolveUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const base = getBaseUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  skipAuth?: boolean;
  _isRetry?: boolean;
}

// Single active promise to handle concurrent 401 refreshes
let activeRefreshPromise: Promise<string | null> | null = null;

/**
 * Performs token refresh using the stored refresh_token
 */
async function refreshAccessToken(): Promise<string | null> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const refreshToken = tokenStorage.getRefreshToken();
      if (!refreshToken) {
        tokenStorage.clear();
        return null;
      }

      const refreshUrl = resolveUrl("/api/v1/auth/refresh");
      const res = await fetch(refreshUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!res.ok) {
        tokenStorage.clear();
        return null;
      }

      const json = await res.json();
      const tokenData: TokenResponse =
        json && typeof json === "object" && json.success === true && json.data ? json.data : json;

      if (tokenData && tokenData.access_token) {
        tokenStorage.setAccessToken(tokenData.access_token);
        if (tokenData.refresh_token) {
          tokenStorage.setRefreshToken(tokenData.refresh_token);
        }
        if (tokenData.user) {
          tokenStorage.setUser(tokenData.user);
        }
        return tokenData.access_token;
      }

      tokenStorage.clear();
      return null;
    } catch {
      tokenStorage.clear();
      return null;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

/**
 * Core Fetch Wrapper
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    body,
    skipAuth = false,
    _isRetry = false,
    headers: customHeaders,
    ...fetchInit
  } = options;
  const url = resolveUrl(path);

  const headers = new Headers(customHeaders);

  // Attach Content-Type for JSON payloads
  if (body !== undefined && !(body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Attach Bearer token if available and not skipped
  if (!skipAuth && !headers.has("Authorization")) {
    const token = tokenStorage.getAccessToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  let serializedBody: BodyInit | undefined;
  if (body !== undefined) {
    if (body instanceof FormData) {
      serializedBody = body;
    } else if (typeof body === "string") {
      serializedBody = body;
    } else {
      serializedBody = JSON.stringify(body);
    }
  }

  const fetchOptions: RequestInit = {
    ...fetchInit,
    headers,
  };
  if (serializedBody !== undefined) {
    fetchOptions.body = serializedBody;
  }

  let response: Response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network error";
    throw new ApiError(0, "NETWORK_ERROR", `Failed to connect to backend: ${message}`);
  }

  // Handle 401 Unauthorized with token refresh (once per request, ignoring auth routes)
  const isAuthRoute =
    path.includes("/auth/login") ||
    path.includes("/auth/register") ||
    path.includes("/auth/refresh");

  if (response.status === 401 && !skipAuth && !_isRetry && !isAuthRoute) {
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      return request<T>(path, { ...options, _isRetry: true });
    }
    // Refresh failed or no refresh token available
    tokenStorage.clear();
    if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
      window.location.href = "/login";
    }
  }

  // Parse JSON response
  let json: any = null;
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    try {
      json = await response.json();
    } catch {
      json = null;
    }
  }

  // Handle Error status codes (4xx, 5xx)
  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    let message = response.statusText || "Request failed";
    let details: unknown = undefined;

    if (json && typeof json === "object") {
      if (json.error && typeof json.error === "object") {
        code = json.error.code || code;
        message = json.error.message || message;
        details = json.error.details;
      } else if ("detail" in json) {
        message = typeof json.detail === "string" ? json.detail : JSON.stringify(json.detail);
      } else if ("message" in json && typeof json.message === "string") {
        message = json.message;
      }
    }

    throw new ApiError(response.status, code, message, details);
  }

  // If response contains FastAPI SuccessResponse envelope: { success: true, data: ... }
  if (json && typeof json === "object") {
    if (json.success === false) {
      const err = json.error || {};
      throw new ApiError(
        response.status,
        err.code || `HTTP_${response.status}`,
        err.message || "Operation failed",
        err.details,
      );
    }
    if (json.success === true && "data" in json) {
      return json.data as T;
    }
    return json as T;
  }

  return (json ?? ({} as unknown)) as T;
}

/**
 * Centralized API client methods
 */
export const api = {
  get<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return request<T>(path, { ...options, method: "GET" });
  },

  post<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, "method" | "body">,
  ): Promise<T> {
    return request<T>(path, { ...options, method: "POST", body });
  },

  put<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, "method" | "body">,
  ): Promise<T> {
    return request<T>(path, { ...options, method: "PUT", body });
  },

  patch<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, "method" | "body">,
  ): Promise<T> {
    return request<T>(path, { ...options, method: "PATCH", body });
  },

  delete<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return request<T>(path, { ...options, method: "DELETE" });
  },

  async getBlob(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<Blob> {
    const { skipAuth = false, _isRetry = false, headers: customHeaders, ...fetchInit } =
      options ?? {};
    const url = resolveUrl(path);
    const headers = new Headers(customHeaders);

    if (!skipAuth && !headers.has("Authorization")) {
      const token = tokenStorage.getAccessToken();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    }

    let response: Response;
    try {
      response = await fetch(url, { ...fetchInit, method: "GET", headers });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Network error";
      throw new ApiError(0, "NETWORK_ERROR", `Failed to connect to backend: ${message}`);
    }

    if (response.status === 401 && !skipAuth && !_isRetry) {
      const newAccessToken = await refreshAccessToken();
      if (newAccessToken) {
        return api.getBlob(path, { ...options, _isRetry: true });
      }
      tokenStorage.clear();
      if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
    }

    if (!response.ok) {
      let code = `HTTP_${response.status}`;
      let message = response.statusText || "Download failed";
      try {
        const errJson = await response.json();
        if (errJson?.error?.message) message = errJson.error.message;
        else if (errJson?.detail) message = String(errJson.detail);
      } catch {
        // ignore non-json errors
      }
      throw new ApiError(response.status, code, message);
    }

    return response.blob();
  },
};
