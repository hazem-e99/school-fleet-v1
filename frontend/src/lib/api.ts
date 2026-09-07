/* eslint-disable @typescript-eslint/no-explicit-any */
import { getApiConfig } from "./config";
import { ApiError } from "./apiError";
import {
  LoginDTO,
  StaffRegistrationDTO,
} from "@/types/auth";
import { Bus, BusApiResponse, BusRequest, BusListParams } from "@/types/bus";
import {
  CreateTripDTO,
  TripResponse,
  Trip,
  TripViewModel,
  UpdateTripDTO,
} from "@/types/trip";
import {
  SubscriptionPlanViewModel,
  CreateSubscriptionPlanDTO,
  UpdateSubscriptionPlanDTO,
  SubscriptionPlanViewModelApiResponse,
  SubscriptionPlanViewModelIEnumerableApiResponse,
  BooleanApiResponse,
  StudentSubscriptionViewModel,
  StudentSubscriptionViewModelApiResponse,
  StudentSubscriptionViewModelIEnumerableApiResponse,
  SubscriptionStatus,
  SuspendSubscriptionDTO,
  PaymentViewModel,
  PaymentViewModelApiResponse,
  PaymentViewModelIEnumerableApiResponse,
  PaymentStatus,
  CreatePaymentDTO,
  ReviewPaymentDTO,
  PaymentStatisticsViewModel,
  RequestCancellationDTO,
  ReviewCancellationDTO,
  CancellationRequestViewModel,
  SubscriptionReportViewModel,
  SubscriptionReportApiResponse,
  StudentOverviewRow,
  StudentOverviewApiResponse,
} from "@/types/subscription";
import {
  PreferredAreaViewModel,
  PreferredAreaViewModelApiResponse,
  PreferredAreaViewModelIEnumerableApiResponse,
  CreatePreferredAreaDTO,
  UpdatePreferredAreaDTO,
} from "@/types/preferredArea";
import {
  DepartmentViewModel,
  DepartmentViewModelApiResponse,
  DepartmentViewModelIEnumerableApiResponse,
  // School types alias the Department ones structurally (kept identical shape)
  CreateDepartmentDTO,
  UpdateDepartmentDTO,
} from "@/types/department";
import {
  YearOfStudyViewModel,
  YearOfStudyViewModelApiResponse,
  YearOfStudyViewModelIEnumerableApiResponse,
  CreateYearOfStudyDTO,
  UpdateYearOfStudyDTO,
} from "@/types/yearOfStudy";
import {
  GradeLevelViewModel,
  GradeLevelViewModelApiResponse,
  GradeLevelViewModelIEnumerableApiResponse,
  CreateGradeLevelDTO,
  UpdateGradeLevelDTO,
  GradeGroupViewModel,
  GradeGroupViewModelApiResponse,
  GradeGroupViewModelIEnumerableApiResponse,
  CreateGradeGroupDTO,
  UpdateGradeGroupDTO,
} from "@/types/grade";
import type {
  PricingRuleViewModel,
  PricingRuleViewModelApiResponse,
  PricingRuleViewModelIEnumerableApiResponse,
  CreatePricingRuleDTO,
  UpdatePricingRuleDTO,
  QuoteViewModel,
  QuoteViewModelApiResponse,
} from "@/types/pricing";
import type {
  DiscountRuleViewModel,
  DiscountRuleViewModelApiResponse,
  DiscountRuleViewModelIEnumerableApiResponse,
  CreateDiscountRuleDTO,
  UpdateDiscountRuleDTO,
} from "@/types/discount";
import type {
  InstallmentPlanViewModel,
  InstallmentPlanViewModelApiResponse,
  InstallmentPlanViewModelIEnumerableApiResponse,
  CreateInstallmentPlanDTO,
  UpdateInstallmentPlanDTO,
  StudentInstallmentViewModel,
  StudentInstallmentViewModelIEnumerableApiResponse,
} from "@/types/installment";
import type {
  RouteChangeRequestViewModel,
  RouteChangeRequestViewModelIEnumerableApiResponse,
  EligibleBusViewModel,
  EligibleBusViewModelIEnumerableApiResponse,
  CreateRouteChangeRequestDTO,
  ReviewRouteChangeRequestDTO,
} from "@/types/routeChangeRequest";
import type {
  AuditLogViewModel,
  AuditLogViewModelIEnumerableApiResponse,
  StringIEnumerableApiResponse,
} from "@/types/audit";
import type {
  ChildDetailViewModel,
  ChildDetailViewModelApiResponse,
} from "@/types/childDetail";
import {
  AcademicTermViewModel,
  AcademicTermViewModelApiResponse,
  AcademicTermViewModelIEnumerableApiResponse,
  CreateAcademicTermDTO,
  UpdateAcademicTermDTO,
} from "@/types/academicTerm";
import {
  TripBookingViewModel,
  CreateTripBookingDTO,
  ChangePickupTripBookingDTO,
  TripBookingSearchDTO,
  TripBookingViewModelApiResponse,
  TripBookingViewModelIEnumerableApiResponse,
  BookingStatus,
} from "@/types/tripBooking";
import {
  NotificationViewModel,
  NotificationViewModelApiResponse,
  NotificationViewModelIEnumerableApiResponse,
  CreateNotificationDTO,
  BroadcastNotificationDTO,
  Int32ApiResponse,
} from "@/types/notification";

const apiConfig = getApiConfig();

const REQUEST_TIMEOUT_MS = 20000;

// Guards against firing multiple session-expired redirects when several
// requests 401 at (roughly) the same time.
let isHandlingSessionExpiry = false;

function handleSessionExpired() {
  if (typeof window === "undefined" || isHandlingSessionExpiry) return;
  isHandlingSessionExpiry = true;
  try {
    window.localStorage.removeItem("user");
    window.localStorage.removeItem("token");
    window.localStorage.removeItem("authToken");
    window.localStorage.removeItem("access_token");
    document.cookie = "user=; path=/; max-age=0; Secure; SameSite=Lax";
  } catch {
    // ignore storage access failures (e.g. private browsing)
  }
  const current = window.location.pathname + window.location.search;
  const target = `/auth/login?sessionExpired=1${current.startsWith("/auth") ? "" : `&next=${encodeURIComponent(current)}`}`;
  window.location.href = target;
}

// Generic API functions
async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  let url = apiConfig.buildUrl(endpoint);
  console.log("🌐 Making request to:", url);
  console.log("📋 Request options:", options);
  console.log("📤 Request body:", options?.body);

  // Prevent GET/HEAD requests from having a body. Convert JSON body to query params if provided.
  if (
    options &&
    options.method &&
    /^(GET|HEAD)$/i.test(options.method) &&
    options.body
  ) {
    try {
      const raw = typeof options.body === "string" ? options.body : "";
      const obj = raw ? JSON.parse(raw) : {};
      const params = new URLSearchParams();
      Object.entries(obj || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        params.append(key, String(value));
      });
      const hasQuery = url.includes("?");
      const qs = params.toString();
      if (qs) {
        url = `${url}${hasQuery ? "&" : "?"}${qs}`;
      }
    } catch (e: unknown) {
      console.warn("Failed to convert GET body to query params:", e);
    } finally {
      // Remove body to satisfy fetch constraints for GET/HEAD
      delete (options as RequestInit & { body?: BodyInit | null }).body;
    }
  }

  try {
    // Inject Authorization header from stored user token for global endpoints
    const authHeaders: Record<string, string> = {};
    try {
      const isLocalApi =
        typeof url === "string" &&
        (url.startsWith("/api/") || url.startsWith("/api"));
      // Always try to get token for all APIs
      if (true) {
        // Prefer token from localStorage (client) or cookie (server)
        let token: string | undefined;
        if (typeof window !== "undefined") {
          const raw = window.localStorage.getItem("user");
          if (raw) {
            const parsed = JSON.parse(raw);
            token = parsed?.token || parsed?.accessToken;
          }
        } else {
          // Best-effort cookie parse for server-side calls
          const cookie =
            (options as RequestInit & { headers?: { cookie?: string } })
              ?.headers?.cookie || "";
          const match = /user=([^;]+)/.exec(cookie);
          if (match) {
            try {
              const parsed = JSON.parse(decodeURIComponent(match[1]));
              token = parsed?.token || parsed?.accessToken;
            } catch {}
          }
        }
        if (token) {
          authHeaders["Authorization"] = `Bearer ${token}`;
          console.log("🔐 Using token for API request:", token.substring(0, 20) + "...");
        } else {
          console.warn("⚠️ No token found in localStorage");
        }
      }
    } catch {}

    const isGet = (options?.method || "GET").toUpperCase() === "GET";

    // For GET requests with body, we need to convert to POST or use query parameters
    const finalUrl = url;
    const finalOptions = { ...options };

    if (isGet && options?.body) {
      // Convert GET with body to POST for compatibility
      finalOptions.method = "POST";
      console.log(
        "🔄 Converting GET request with body to POST for compatibility"
      );
    }

    const hasAuthHeader = Boolean(authHeaders["Authorization"]);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(finalUrl, {
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          ...(finalOptions.method === "GET"
            ? { "Cache-Control": "no-cache", Pragma: "no-cache" }
            : {}),
          ...authHeaders,
          ...finalOptions?.headers,
        },
        signal: controller.signal,
        ...finalOptions,
      });
    } catch (fetchError: unknown) {
      if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
        throw new ApiError({
          message: "The request took too long. Please try again.",
          isTimeout: true,
        });
      }
      throw new ApiError({
        message: "Unable to connect to the server. Please check your internet connection and try again.",
        isNetworkError: true,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    console.log("📥 Response status:", response.status, response.statusText);

    if (!response.ok) {
      // Parse the backend's standardized error body: { message, errorCode, errors }
      let errorMessage: string | undefined;
      let errorCode: string | null = null;
      let fieldErrors: Record<string, string> | null = null;
      try {
        const ct = response.headers.get("content-type") || "";
        if (ct.toLowerCase().includes("application/json")) {
          const j = await response.clone().json();
          if (typeof j?.message === "string" && j.message.trim()) {
            errorMessage = j.message;
          }
          if (typeof j?.errorCode === "string") {
            errorCode = j.errorCode;
          }
          if (j?.errors && typeof j.errors === "object") {
            fieldErrors = j.errors as Record<string, string>;
          }
        }
      } catch {
        // Body wasn't readable/JSON (e.g. an upstream proxy error page) — fall back to a generic message below.
      }

      if (response.status === 401 && hasAuthHeader) {
        handleSessionExpired();
      }

      throw new ApiError({
        message: errorMessage || `Request failed with status ${response.status}.`,
        status: response.status,
        code: errorCode,
        errors: fieldErrors,
      });
    }

    // Try to parse JSON safely; handle 204/empty bodies and servers that return JSON with wrong content-type
    const contentLengthHeader = response.headers.get("content-length");
    const contentLength = contentLengthHeader
      ? parseInt(contentLengthHeader, 10)
      : undefined;
    if (response.status === 204 || contentLength === 0) {
      return {} as unknown as T;
    }

    // Read body as text first, then try to JSON.parse. This handles servers that return JSON but set
    // the Content-Type to text/plain or omit it.
    const rawText = await response.text();
    if (!rawText) {
      return {} as unknown as T;
    }
    try {
      const parsed = JSON.parse(rawText);
      console.log("📥 Response data (parsed):", parsed);
      console.log("📥 Response success:", parsed?.success);
      console.log("📥 Response message:", parsed?.message);
      return parsed as T;
    } catch {
      // Not JSON — return raw text to caller (caller may handle text). This is more robust than
      // silently returning an empty object when servers mis-label JSON responses.
      console.warn("⚠️ Response was not JSON, returning raw text");
      return rawText as unknown as T;
    }
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error(`❌ API request failed for ${endpoint}:`, error);
    throw new ApiError({
      message: "Something went wrong. Please try again.",
    });
  }
}

export const api = {
  get: <T>(endpoint: string, options?: RequestInit) =>
    apiRequest<T>(endpoint, { ...options, method: "GET" }),
  post: <T>(endpoint: string, body: unknown, options?: RequestInit) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: "POST",
      body: JSON.stringify(body),
    }),
  put: <T>(endpoint: string, body: unknown, options?: RequestInit) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: "PUT",
      body: JSON.stringify(body),
    }),
  delete: <T>(endpoint: string, options?: RequestInit) =>
    apiRequest<T>(endpoint, { ...options, method: "DELETE" }),
};

// Authentication API calls
export const authAPI = {
  // Guardian (parent) registration — creates the guardian account + their children.
  registerGuardian: (data: Record<string, unknown>) => {
    return apiRequest<any>("/Authentication/registration-guardian", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Staff registration (Admin, Driver, Movement Manager, Supervisor)
  registerStaff: (staffData: StaffRegistrationDTO) => {
    console.log("🔗 Using endpoint:", apiConfig.AUTH.REGISTRATION_STAFF);
    console.log(
      "🔗 Full URL:",
      apiConfig.buildUrl(apiConfig.AUTH.REGISTRATION_STAFF)
    );
    console.log("📤 Sending data:", staffData);
    return apiRequest<any>(apiConfig.AUTH.REGISTRATION_STAFF, {
      method: "POST",
      body: JSON.stringify(staffData),
    });
  },

  // User login
  login: (credentials: LoginDTO) => {
    console.log("🔗 Using endpoint:", apiConfig.AUTH.LOGIN);
    console.log("🔗 Full URL:", apiConfig.buildUrl(apiConfig.AUTH.LOGIN));
    return apiRequest<any>(apiConfig.AUTH.LOGIN, {
      method: "POST",
      body: JSON.stringify(credentials),
    });
  },
};

// User-related API calls - use global endpoints
const mapGlobalStatus = (status: string | undefined) => {
  if (!status) return "active";
  const s = status.toLowerCase();
  if (s === "inactive") return "inactive";
  if (s === "suspended") return "suspended";
  return "active";
};

const mapGlobalRole = (role: string | undefined) => {
  if (!role) return "student";
  const r = role.toLowerCase();
  // Backend uses MovementManager, Conductor; app uses 'movement-manager' and may not use 'conductor'
  if (r === "movementmanager" || r === "movement manager")
    return "movement-manager";
  return r;
};

const mapGlobalUserToApp = (u: any) => {
  if (!u) return null;
  const first = u.firstName || "";
  const last = u.lastName || "";
  const fullName = `${first} ${last}`.trim();
  return {
    id: String(u.id ?? u.userId ?? ""),
    profileId: String(u.profileId ?? ""),
    name: fullName || u.name || "Unknown",
    fullName: fullName || undefined,
    role: mapGlobalRole(u.role),
    phone: u.phoneNumber || u.phone || "",
    nationalId: u.nationalId || "",
    status: mapGlobalStatus(u.status),
    avatar: u.profilePictureUrl || u.avatar || undefined,
    createdAt: u.createdAt || new Date().toISOString(),
    updatedAt: u.updatedAt || new Date().toISOString(),
  };
};

export const userAPI = {
  // Get all users (unwraps { data })
  getAll: async () => {
    const resp = await apiRequest<any>("/Users");
    const list = resp?.data ?? resp ?? [];
    return Array.isArray(list) ? list.map(mapGlobalUserToApp) : [];
  },

  // Get users by role
  getByRole: async (role: string) => {
    const resp = await apiRequest<any>(
      `/Users/by-role/${encodeURIComponent(role)}`
    );
    const list = resp?.data ?? resp ?? [];
    return Array.isArray(list) ? list.map(mapGlobalUserToApp) : [];
  },

  // Get user by ID
  getById: async (id: string) => {
    const resp = await apiRequest<any>(`/Users/${id}`);
    const item = resp?.data ?? resp ?? null;
    return item ? mapGlobalUserToApp(item) : null;
  },

  // Get user by phone (fallback to filtering all if endpoint unsupported)
  getByPhone: async (phone: string) => {
    try {
      const resp = await apiRequest<any>(
        `/Users?phone=${encodeURIComponent(phone)}`
      );
      const list = resp?.data ?? resp ?? [];
      return Array.isArray(list) ? list.map(mapGlobalUserToApp) : [];
    } catch {
      const all = await userAPI.getAll();
      return (all || []).filter(
        (u: any) => (u.phone || "").toLowerCase() === phone.toLowerCase()
      );
    }
  },

  // Change password
  changePassword: (payload: {
    currentPassword: string;
    password: string;
    confirmPassword: string;
  }) =>
    apiRequest<any>("/Users/change-password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Admin: reset another user's password (by numericId). Admin-only on the backend.
  adminResetPassword: (id: string | number, newPassword: string) =>
    apiRequest<any>(`/Users/${id}/reset-password`, {
      method: "PUT",
      body: JSON.stringify({ newPassword, confirmPassword: newPassword }),
    }),

  // Get profile
  getProfile: async () => {
    const resp = await apiRequest<any>("/Users/profile");
    const item = resp?.data ?? resp ?? null;
    return item ? mapGlobalUserToApp(item) : null;
  },

  // Get current user profile (raw data from /Users/profile endpoint)
  getCurrentUserProfile: async () => {
    const resp = await apiRequest<any>("/Users/profile");
    return resp?.data ?? resp ?? null;
  },

  // Delete user
  delete: (id: string) =>
    apiRequest<any>(`/Users/${id}`, {
      method: "DELETE",
    }),

  // Update user (partial)
  update: (id: string, payload: Record<string, unknown>) =>
    apiRequest<unknown>(`/Users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  // Update user profile (for all roles)
  updateProfile: (payload: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
  }) =>
    apiRequest<unknown>("/Users/profile", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  // Update driver profile (includes licenseNumber)
  updateDriverProfile: (payload: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    licenseNumber?: string;
  }) =>
    apiRequest<unknown>("/Users/driver-profile", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  // Update movement manager profile
  updateMovementManagerProfile: (payload: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
  }) =>
    apiRequest<unknown>("/Users/movement-manager-profile", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  // Update admin profile
  updateAdminProfile: (payload: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
  }) =>
    apiRequest<unknown>("/Users/admin-profile", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  // Update student profile using the correct endpoint
  updateStudentProfile: (payload: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    department?: string;
    preferredArea?: string;
    yearOfStudy?: number;
    emergencyContact?: string;
    emergencyPhone?: string;
  }) =>
    apiRequest<unknown>("/Users/student-profile", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  // Update profile picture
  updateProfilePicture: async (file: File) => {
    const formData = new FormData();
    formData.append('profilePicture', file);
    
    // Get authentication headers manually since we need to bypass the default Content-Type
    const authHeaders: Record<string, string> = {};
    try {
      if (typeof window !== "undefined") {
        const raw = window.localStorage.getItem("user");
        if (raw) {
          const parsed = JSON.parse(raw);
          const token = parsed?.token || parsed?.accessToken;
          if (token) {
            authHeaders["Authorization"] = `Bearer ${token}`;
            console.log("🔐 Using token for profile picture upload:", token.substring(0, 20) + "...");
          }
        }
      }
    } catch (error) {
      console.error("Failed to get auth token:", error);
    }
    
    const baseURL = apiConfig.BASE_URL;
    const url = `${baseURL}/Users/update-profile-picture`;
    
    console.log("🌐 Uploading profile picture to:", url);
    
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        // Don't set Content-Type, let browser set it with boundary for FormData
        ...authHeaders,
      },
      body: formData,
    });

    console.log("📥 Profile picture upload response:", response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Profile picture upload failed:", errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.text();
    console.log("📥 Profile picture upload result:", result);
    
    // Try to parse as JSON, fallback to text
    try {
      return JSON.parse(result);
    } catch (e) {
      return result;
    }
  },
};

// Bus-related API calls - use global endpoints
export const busAPI = {
  /**
   * Assigns the bus to a route, or clears it with `routeId: null`.
   * 409s when the bus still carries students on its current route.
   */
  assignRoute: (id: string | number, routeId: number | null): Promise<any> =>
    apiRequest<any>(`/Buses/${id}/route`, {
      method: "PUT",
      body: JSON.stringify({ routeId }),
    }),

  /** Server-paginated students riding a bus. `total` is the full count. */
  getStudents: async (
    id: string | number,
    params?: { page?: number; pageSize?: number; search?: string },
  ): Promise<{ data: any[]; total: number }> => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
    if (params?.search) qs.set("search", params.search);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const resp = await apiRequest<{ data: any[] | null; count?: number | null }>(
      `/Buses/${id}/students${suffix}`,
    );
    return { data: resp?.data ?? [], total: resp?.count ?? 0 };
  },

  // Get all buses with filters & pagination (GET with JSON body as per API)
  getAll: (params?: Partial<BusListParams>) => {
    const defaultParams: BusListParams = {
      page: 0,
      pageSize: 1000, // Default to get all buses
      busNumber: "",
      status: "",
      minSpeed: 0,
      maxSpeed: 0,
      minCapacity: 0,
      maxCapacity: 0,
    };
    const body = {
      ...defaultParams,
      ...(params || {}),
      _ts: Date.now(),
    };
    return apiRequest<BusApiResponse<Bus[]>>("/Buses", {
      method: "GET",
      body: JSON.stringify(body),
    });
  },

  // Get bus by ID
  getById: (id: number) => apiRequest<BusApiResponse<Bus>>(`/Buses/${id}`),

  // Create new bus
  create: (busData: BusRequest) =>
    apiRequest<BusApiResponse<Bus>>("/Buses", {
      method: "POST",
      body: JSON.stringify(busData),
    }),

  // Update bus
  update: (id: number, busData: BusRequest) =>
    apiRequest<BusApiResponse<Bus>>(`/Buses/${id}`, {
      method: "PUT",
      body: JSON.stringify(busData),
    }),

  // Delete bus
  delete: (id: number) =>
    apiRequest<BusApiResponse<null>>(`/Buses/${id}`, {
      method: "DELETE",
    }),
};

// Trip-related API calls - use global endpoints
/* Legacy Trip API removed – new Trip module will use dedicated tripService per backend spec */
export const tripAPI = {
  // Get all trips
  getAll: async (): Promise<TripViewModel[]> => {
    const resp = await apiRequest<TripViewModel[] | { data: TripViewModel[] }>(
      "/Trip"
    );
    const list =
      (resp as { data: TripViewModel[] })?.data ??
      (resp as TripViewModel[]) ??
      [];
    return Array.isArray(list) ? list : [];
  },

  // Get trip by ID
  getById: async (id: string | number): Promise<TripViewModel | null> => {
    const resp = await apiRequest<TripViewModel | { data: TripViewModel }>(
      `/Trip/${id}`
    );
    const item =
      (resp as { data: TripViewModel })?.data ??
      (resp as TripViewModel) ??
      null;
    return item ?? null;
  },

  // Get trip view model by ID (includes booking info)
  getViewModelById: async (
    id: string | number
  ): Promise<TripViewModel | null> => {
    const resp = await apiRequest<TripViewModel | { data: TripViewModel }>(
      `/Trip/${id}`
    );
    const item =
      (resp as { data: TripViewModel })?.data ??
      (resp as TripViewModel) ??
      null;
    return item ?? null;
  },

  // Get all trips as view models (includes booking info)
  getAllViewModels: async (): Promise<TripViewModel[]> => {
    const resp = await apiRequest<TripViewModel[] | { data: TripViewModel[] }>(
      "/Trip"
    );
    const list =
      (resp as { data: TripViewModel[] })?.data ??
      (resp as TripViewModel[]) ??
      [];
    return Array.isArray(list) ? list : [];
  },

  // Get trips by date (YYYY-MM-DD format)
  getByDate: async (date: string): Promise<Trip[]> => {
    const resp = await apiRequest<Trip[] | { data: Trip[] }>(
      `/Trip/by-date/${encodeURIComponent(date)}`
    );
    const list = (resp as { data: Trip[] })?.data ?? (resp as Trip[]) ?? [];
    return Array.isArray(list) ? list : [];
  },

  // Get trips by driver ID
  getByDriver: async (driverId: string | number): Promise<Trip[]> => {
    const resp = await apiRequest<Trip[] | { data: Trip[] }>(
      `/Trip/by-driver/${driverId}`
    );
    const list = (resp as { data: Trip[] })?.data ?? (resp as Trip[]) ?? [];
    return Array.isArray(list) ? list : [];
  },

  // Get trips by bus ID
  getByBus: async (busId: string | number): Promise<Trip[]> => {
    const resp = await apiRequest<Trip[] | { data: Trip[] }>(
      `/Trip/by-bus/${busId}`
    );
    const list = (resp as { data: Trip[] })?.data ?? (resp as Trip[]) ?? [];
    return Array.isArray(list) ? list : [];
  },

  // Create new trip using CreateTripDTO (camelCase as per spec)
  create: (tripData: CreateTripDTO): Promise<Trip> => {
    const payload: CreateTripDTO = {
      busId: Number(tripData.busId),
      driverId: Number(tripData.driverId),
      conductorId: Number(tripData.conductorId),
      startLocation: (tripData.startLocation || "").trim(),
      endLocation: (tripData.endLocation || "").trim(),
      tripDate: tripData.tripDate,
      departureTimeOnly: tripData.departureTimeOnly,
      arrivalTimeOnly: tripData.arrivalTimeOnly,
      stopLocations: Array.isArray(tripData.stopLocations)
        ? tripData.stopLocations.map((s) => ({
            address: (s.address || "").trim(),
            arrivalTimeOnly: s.arrivalTimeOnly,
            departureTimeOnly: s.departureTimeOnly,
          }))
        : [],
    };

    return apiRequest<Trip>("/Trip", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // Update existing trip using CreateTripDTO shape (backend expects same DTO)
  update: (id: string | number, tripData: CreateTripDTO): Promise<Trip> => {
    const payload: CreateTripDTO = {
      busId: Number(tripData.busId),
      driverId: Number(tripData.driverId),
      conductorId: Number(tripData.conductorId),
      startLocation: (tripData.startLocation || "").trim(),
      endLocation: (tripData.endLocation || "").trim(),
      tripDate: tripData.tripDate,
      departureTimeOnly: tripData.departureTimeOnly,
      arrivalTimeOnly: tripData.arrivalTimeOnly,
      stopLocations: Array.isArray(tripData.stopLocations)
        ? tripData.stopLocations.map((s) => ({
            address: (s.address || "").trim(),
            arrivalTimeOnly: s.arrivalTimeOnly,
            departureTimeOnly: s.departureTimeOnly,
          }))
        : [],
    };

    return apiRequest<Trip>(`/Trip/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  // Delete trip
  delete: (id: string | number): Promise<{ success: boolean }> =>
    apiRequest<{ success: boolean }>(`/Trip/${id}`, {
      method: "DELETE",
    }),

  // Get my trips (student's booked trips)
  getMyTrips: async (): Promise<TripBookingViewModel[]> => {
    const resp = await apiRequest<TripBookingViewModelIEnumerableApiResponse>("/Trip/my-trips");
    return resp?.data ?? [];
  },

  // Get driver's assigned trips
  getDriverTrips: async (): Promise<TripViewModel[]> => {
    const resp = await apiRequest<TripBookingViewModelIEnumerableApiResponse>("/Trip/my-trips");
    return (resp?.data ?? []) as unknown as TripViewModel[];
  },

  // Create booking
  createBooking: async (bookingData: CreateTripBookingDTO): Promise<BooleanApiResponse> => {
    console.log('🔍 tripAPI.createBooking called with:', bookingData);
    try {
      const result = await apiRequest<BooleanApiResponse>("/TripBooking", {
        method: "POST",
        body: JSON.stringify(bookingData),
      });
      console.log('✅ tripAPI.createBooking result:', result);
      return result;
    } catch (error) {
      console.error('❌ tripAPI.createBooking error:', error);
      throw error;
    }
  },

  // Get booking by ID
  getBookingById: async (id: string | number): Promise<TripBookingViewModel | null> => {
    const resp = await apiRequest<TripBookingViewModelApiResponse>(`/TripBooking/${id}`);
    return resp?.data ?? null;
  },

  // Get bookings by trip
  getBookingsByTrip: async (tripId: string | number): Promise<TripBookingViewModel[]> => {
    const resp = await apiRequest<TripBookingViewModelIEnumerableApiResponse>(`/TripBooking/by-trip/${tripId}`);
    return resp?.data ?? [];
  },

  // Get bookings by student
  getBookingsByStudent: async (studentId: string | number): Promise<TripBookingViewModel[]> => {
    const resp = await apiRequest<TripBookingViewModelIEnumerableApiResponse>(`/TripBooking/by-student/${studentId}`);
    return resp?.data ?? [];
  },

  // Get bookings by date
  getBookingsByDate: async (date: string): Promise<TripBookingViewModel[]> => {
    const resp = await apiRequest<TripBookingViewModelIEnumerableApiResponse>(`/TripBooking/by-date/${date}`);
    return resp?.data ?? [];
  },

  // Search bookings
  searchBookings: async (searchParams: TripBookingSearchDTO): Promise<TripBookingViewModel[]> => {
    const queryParams = new URLSearchParams();
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });
    
    const resp = await apiRequest<TripBookingViewModelIEnumerableApiResponse>(`/TripBooking/search?${queryParams.toString()}`, {
      method: "POST",
    });
    return resp?.data ?? [];
  },

  // Update pickup location
  updatePickupLocation: async (id: string | number, pickupData: ChangePickupTripBookingDTO): Promise<BooleanApiResponse> => {
    return apiRequest<BooleanApiResponse>(`/TripBooking/update-trip-pickup/${id}`, {
      method: "PUT",
      body: JSON.stringify(pickupData),
    });
  },

  // Cancel booking
  cancelBooking: async (bookId: string | number): Promise<BooleanApiResponse> => {
    return apiRequest<BooleanApiResponse>(`/TripBooking/${bookId}/cancel`, {
      method: "PATCH",
    });
  },

  // Delete booking
  deleteBooking: async (id: string | number): Promise<BooleanApiResponse> => {
    return apiRequest<BooleanApiResponse>(`/TripBooking/${id}`, {
      method: "DELETE",
    });
  },

  // Check eligibility
  checkEligibility: async (tripId: string | number, studentId: string | number): Promise<boolean> => {
    const resp = await apiRequest<BooleanApiResponse>(`/TripBooking/check-eligibility?tripId=${tripId}&studentId=${studentId}`);
    return resp?.data ?? false;
  },
};

// Payment-related API calls - use global endpoints
// Payment API - use global endpoints
export const paymentAPI = {
  // GET /api/Payment
  getAll: async (): Promise<PaymentViewModel[]> => {
    const resp = await apiRequest<PaymentViewModelIEnumerableApiResponse>("/Payment");
    return resp?.data ?? [];
  },
  // GET /api/Payment/{id}
  getById: async (id: number | string): Promise<PaymentViewModel | null> => {
    const resp = await apiRequest<PaymentViewModelApiResponse>(`/Payment/${id}`);
    return resp?.data ?? null;
  },
  // POST /api/Payment with CreatePaymentDTO
  create: (paymentData: CreatePaymentDTO): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>("/Payment", {
      method: "POST",
      body: JSON.stringify(paymentData),
    }),
  // DELETE /api/Payment/{id}
  delete: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/Payment/${id}`, {
      method: "DELETE",
    }),
  // PUT /api/Payment/{id}/review with ReviewPaymentDTO
  review: (
    id: number | string,
    reviewData: ReviewPaymentDTO
  ): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/Payment/${id}/review`, {
      method: "PUT",
      body: JSON.stringify(reviewData),
    }),
  // GET /api/Payment/my-payments
  getMyPayments: async (): Promise<PaymentViewModel[]> => {
    const resp = await apiRequest<PaymentViewModelIEnumerableApiResponse>("/Payment/my-payments");
    return resp?.data ?? [];
  },
  // GET /api/Payment/by-status/{status}
  getByStatus: async (status: PaymentStatus): Promise<PaymentViewModel[]> => {
    const resp = await apiRequest<PaymentViewModelIEnumerableApiResponse>(`/Payment/by-status/${status}`);
    return resp?.data ?? [];
  },
  // GET /api/Payment/pending
  getPending: async (): Promise<PaymentViewModel[]> => {
    const resp = await apiRequest<PaymentViewModelIEnumerableApiResponse>("/Payment/pending");
    return resp?.data ?? [];
  },
  // GET /api/Payment/by-student/{studentId}
  getByStudent: async (studentId: number | string): Promise<PaymentViewModel[]> => {
    const resp = await apiRequest<PaymentViewModelIEnumerableApiResponse>(`/Payment/by-student/${studentId}`);
    return resp?.data ?? [];
  },
  // GET /api/Payment/by-subscription-plan/{subscriptionPlanId}
  getBySubscriptionPlan: async (subscriptionPlanId: number | string): Promise<PaymentViewModel[]> => {
    const resp = await apiRequest<PaymentViewModelIEnumerableApiResponse>(`/Payment/by-subscription-plan/${subscriptionPlanId}`);
    return resp?.data ?? [];
  },
  // GET /api/Payment/statistics
  getStatistics: async (): Promise<PaymentStatisticsViewModel | null> => {
    const resp = await apiRequest<PaymentViewModelApiResponse>("/Payment/statistics");
    return (resp?.data ?? null) as unknown as PaymentStatisticsViewModel | null;
  },
  // GET /api/Payment/subscription-report - Admin-only aggregated revenue report
  getSubscriptionReport: async (): Promise<SubscriptionReportViewModel | null> => {
    const resp = await apiRequest<SubscriptionReportApiResponse>("/Payment/subscription-report");
    return resp?.data ?? null;
  },
};

// Notification-related API calls - use global endpoints
export const notificationAPI = {
  // GET /api/Notifications - Get all notifications for current user
  getAll: () => apiRequest<NotificationViewModelIEnumerableApiResponse>("/Notifications"),

  // GET /api/Notifications/unread - Get unread notifications for current user
  getUnread: () => apiRequest<NotificationViewModelIEnumerableApiResponse>("/Notifications/unread"),

  // GET /api/Notifications/unread-count - Get unread count for current user
  getUnreadCount: () => apiRequest<Int32ApiResponse>("/Notifications/unread-count"),

  // GET /api/Notifications/{id} - Get notification by ID
  getById: (id: number) => apiRequest<NotificationViewModelApiResponse>(`/Notifications/${id}`),

  // POST /api/Notifications - Create new notification
  create: (notificationData: CreateNotificationDTO) =>
    apiRequest<BooleanApiResponse>("/Notifications", {
      method: "POST",
      body: JSON.stringify(notificationData),
    }),

  // DELETE /api/Notifications/{id} - Delete notification
  delete: (id: number) =>
    apiRequest<BooleanApiResponse>(`/Notifications/${id}`, {
      method: "DELETE",
    }),

  // POST /api/Notifications/broadcast - Broadcast notification to multiple users
  broadcast: (broadcastData: BroadcastNotificationDTO) =>
    apiRequest<BooleanApiResponse>("/Notifications/broadcast", {
      method: "POST",
      body: JSON.stringify(broadcastData),
    }),

  // PUT /api/Notifications/{id}/mark-read - Mark notification as read
  markAsRead: (id: number) =>
    apiRequest<BooleanApiResponse>(`/Notifications/${id}/mark-read`, {
      method: "PUT",
    }),

  // PUT /api/Notifications/mark-all-read - Mark all notifications as read
  markAllAsRead: () =>
    apiRequest<BooleanApiResponse>("/Notifications/mark-all-read", {
      method: "PUT",
    }),

  // DELETE /api/Notifications/clear-all - Clear all notifications
  clearAll: () =>
    apiRequest<BooleanApiResponse>("/Notifications/clear-all", {
      method: "DELETE",
    }),

  // Admin endpoints
  // GET /api/Notifications/admin/all - Get all notifications (admin only)
  adminGetAll: () => apiRequest<NotificationViewModelIEnumerableApiResponse>("/Notifications/admin/all"),

  // DELETE /api/Notifications/admin/{id} - Delete notification (admin only)
  adminDelete: (id: number) =>
    apiRequest<BooleanApiResponse>(`/Notifications/admin/${id}`, {
      method: "DELETE",
    }),
};

// Forms API - use global endpoints
export const formsAPI = {
  get: () => apiRequest<any>("/Forms"),
};

// Subscription plans API - use global endpoints
export const subscriptionPlansAPI = {
  // GET /api/SubscriptionPlan → returns SubscriptionPlanViewModelIEnumerableApiResponse
  getAll: async (): Promise<SubscriptionPlanViewModel[]> => {
    const resp = await apiRequest<SubscriptionPlanViewModelIEnumerableApiResponse>("/SubscriptionPlan");
    return resp?.data ?? [];
  },
  // GET /api/SubscriptionPlan/active
  getActive: async (): Promise<SubscriptionPlanViewModel[]> => {
    const resp = await apiRequest<SubscriptionPlanViewModelIEnumerableApiResponse>("/SubscriptionPlan/active");
    return resp?.data ?? [];
  },
  // GET /api/SubscriptionPlan/{id}
  getById: async (id: number | string): Promise<SubscriptionPlanViewModel | null> => {
    const resp = await apiRequest<SubscriptionPlanViewModelApiResponse>(`/SubscriptionPlan/${id}`);
    return resp?.data ?? null;
  },
  // POST /api/SubscriptionPlan with CreateSubscriptionPlanDTO
  create: (planData: CreateSubscriptionPlanDTO): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>("/SubscriptionPlan", {
      method: "POST",
      body: JSON.stringify(planData),
    }),
  // PUT /api/SubscriptionPlan/{id} with UpdateSubscriptionPlanDTO
  update: (
    id: number | string,
    planData: UpdateSubscriptionPlanDTO
  ): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/SubscriptionPlan/${id}`, {
      method: "PUT",
      body: JSON.stringify(planData),
    }),
  // DELETE /api/SubscriptionPlan/{id}
  delete: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/SubscriptionPlan/${id}`, {
      method: "DELETE",
    }),
  // PUT /api/SubscriptionPlan/{id}/activate
  activate: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/SubscriptionPlan/${id}/activate`, {
      method: "PUT",
    }),
  // PUT /api/SubscriptionPlan/{id}/deactivate
  deactivate: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/SubscriptionPlan/${id}/deactivate`, {
      method: "PUT",
    }),
  // GET /api/SubscriptionPlan/by-price-range?minPrice=&maxPrice=
  getByPriceRange: async (minPrice?: number, maxPrice?: number): Promise<SubscriptionPlanViewModel[]> => {
    const params = new URLSearchParams();
    if (minPrice !== undefined) params.append("minPrice", String(minPrice));
    if (maxPrice !== undefined) params.append("maxPrice", String(maxPrice));
    const resp = await apiRequest<SubscriptionPlanViewModelIEnumerableApiResponse>(
      `/SubscriptionPlan/by-price-range?${params.toString()}`
    );
    return resp?.data ?? [];
  },
  // GET /api/SubscriptionPlan/by-duration?durationInDays=
  getByDuration: async (durationInDays?: number): Promise<SubscriptionPlanViewModel[]> => {
    const params = new URLSearchParams();
    if (durationInDays !== undefined)
      params.append("durationInDays", String(durationInDays));
    const resp = await apiRequest<SubscriptionPlanViewModelIEnumerableApiResponse>(
      `/SubscriptionPlan/by-duration?${params.toString()}`
    );
    return resp?.data ?? [];
  },
};

// Preferred Area API — admin-managed list shown on the registration dropdown.
// GET /active is @Public() on the backend (registration happens pre-login);
// every other route requires Admin.
export const preferredAreasAPI = {
  // GET /api/PreferredArea (Admin-only)
  getAll: async (): Promise<PreferredAreaViewModel[]> => {
    const resp = await apiRequest<PreferredAreaViewModelIEnumerableApiResponse>("/PreferredArea");
    return resp?.data ?? [];
  },
  // GET /api/PreferredArea/active (public)
  getActive: async (): Promise<PreferredAreaViewModel[]> => {
    const resp = await apiRequest<PreferredAreaViewModelIEnumerableApiResponse>("/PreferredArea/active");
    return resp?.data ?? [];
  },
  // GET /api/PreferredArea/{id} (Admin-only)
  getById: async (id: number | string): Promise<PreferredAreaViewModel | null> => {
    const resp = await apiRequest<PreferredAreaViewModelApiResponse>(`/PreferredArea/${id}`);
    return resp?.data ?? null;
  },
  // POST /api/PreferredArea with CreatePreferredAreaDTO (Admin-only)
  create: (data: CreatePreferredAreaDTO): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>("/PreferredArea", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  // PUT /api/PreferredArea/{id} with UpdatePreferredAreaDTO (Admin-only)
  update: (
    id: number | string,
    data: UpdatePreferredAreaDTO
  ): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/PreferredArea/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  // DELETE /api/PreferredArea/{id} (Admin-only)
  delete: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/PreferredArea/${id}`, {
      method: "DELETE",
    }),
  // PUT /api/PreferredArea/{id}/activate (Admin-only)
  activate: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/PreferredArea/${id}/activate`, {
      method: "PUT",
    }),
  // PUT /api/PreferredArea/{id}/deactivate (Admin-only)
  deactivate: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/PreferredArea/${id}/deactivate`, {
      method: "PUT",
    }),
};

// Department API — admin-managed list shown on the registration, student
// profile, and admin student-edit dropdowns. GET /active is @Public() on the
// backend (registration happens pre-login); every other route requires Admin.
// Admin-managed "School" list — replaces the former "Department" list. GET
// /active is @Public() (guardian registration happens pre-login); everything
// else is Admin-only. Endpoints live under /api/School.
export const schoolsAPI = {
  getAll: async (): Promise<DepartmentViewModel[]> => {
    const resp = await apiRequest<DepartmentViewModelIEnumerableApiResponse>("/School");
    return resp?.data ?? [];
  },
  getActive: async (): Promise<DepartmentViewModel[]> => {
    const resp = await apiRequest<DepartmentViewModelIEnumerableApiResponse>("/School/active");
    return resp?.data ?? [];
  },
  getById: async (id: number | string): Promise<DepartmentViewModel | null> => {
    const resp = await apiRequest<DepartmentViewModelApiResponse>(`/School/${id}`);
    return resp?.data ?? null;
  },
  create: (data: CreateDepartmentDTO): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>("/School", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (
    id: number | string,
    data: UpdateDepartmentDTO
  ): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/School/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/School/${id}`, {
      method: "DELETE",
    }),
  activate: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/School/${id}/activate`, {
      method: "PUT",
    }),
  deactivate: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/School/${id}/deactivate`, {
      method: "PUT",
    }),
};

/** @deprecated Use schoolsAPI — the "Department" concept is now "School". */
export const departmentsAPI = schoolsAPI;

// Children — a guardian's own children (CRUD) plus admin reads.
export const childrenAPI = {
  getMyChildren: async (): Promise<any[]> => {
    const resp = await apiRequest<{ data: any[] }>("/Child/my-children");
    return resp?.data ?? [];
  },
  /**
   * Admin assigns a child to a route and/or bus. `null` clears an assignment;
   * clearing the route also clears the bus.
   *
   * 409s when the bus is full, does not serve the selected route, is not
   * Active, or when moving a child onto a disabled route. Pass
   * `allowOverCapacity: true` to deliberately exceed capacity — that override
   * is recorded in the audit log.
   */
  /**
   * Admin edit of any child's details, not scoped to one family. `email: ''`
   * clears the address — the server unsets it rather than storing an empty
   * string. The change is written to the audit log.
   */
  /**
   * Everything the admin child detail page shows, assembled server-side.
   * Deliberately one call: the client-side equivalent would be 6+N requests,
   * one of which downloads the whole route-change-request queue.
   */
  getDetail: async (id: number | string): Promise<ChildDetailViewModel | null> => {
    const resp = await apiRequest<ChildDetailViewModelApiResponse>(`/Child/${id}/detail`);
    return resp?.data ?? null;
  },
  adminUpdate: (
    id: number | string,
    payload: {
      name?: string;
      email?: string | null;
      schoolName?: string;
      pickupAreaName?: string;
      gender?: string;
      dateOfBirth?: string;
      gradeLevelId?: number;
    },
  ): Promise<{ data: any; success: boolean; message?: string | null }> =>
    apiRequest<{ data: any; success: boolean; message?: string | null }>(
      `/Child/${id}/admin`,
      { method: "PUT", body: JSON.stringify(payload) },
    ),
  assign: (
    id: number | string,
    payload: { routeId?: number | null; busId?: number | null; allowOverCapacity?: boolean },
  ): Promise<{ data: any; success: boolean; message?: string | null }> =>
    apiRequest<{ data: any; success: boolean; message?: string | null }>(
      `/Child/${id}/assignment`,
      { method: "PUT", body: JSON.stringify(payload) },
    ),
  create: (data: Record<string, unknown>): Promise<{ data: any; success: boolean }> =>
    apiRequest<{ data: any; success: boolean }>("/Child", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: number | string, data: Record<string, unknown>): Promise<{ data: any; success: boolean }> =>
    apiRequest<{ data: any; success: boolean }>(`/Child/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  remove: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/Child/${id}`, { method: "DELETE" }),
  getById: async (id: number | string): Promise<any | null> => {
    const resp = await apiRequest<{ data: any }>(`/Child/${id}`);
    return resp?.data ?? null;
  },
  getAll: async (): Promise<any[]> => {
    const resp = await apiRequest<{ data: any[] }>("/Child/all");
    return resp?.data ?? [];
  },
  getByGuardian: async (guardianId: number | string): Promise<any[]> => {
    const resp = await apiRequest<{ data: any[] }>(`/Child/by-guardian/${guardianId}`);
    return resp?.data ?? [];
  },
};

// Year of Study API — admin-managed list shown on the registration, student
// profile, and admin student-edit dropdowns. GET /active is @Public() on the
// backend (registration happens pre-login); every other route requires Admin.
export const yearsOfStudyAPI = {
  // GET /api/YearOfStudy (Admin-only)
  getAll: async (): Promise<YearOfStudyViewModel[]> => {
    const resp = await apiRequest<YearOfStudyViewModelIEnumerableApiResponse>("/YearOfStudy");
    return resp?.data ?? [];
  },
  // GET /api/YearOfStudy/active (public)
  getActive: async (): Promise<YearOfStudyViewModel[]> => {
    const resp = await apiRequest<YearOfStudyViewModelIEnumerableApiResponse>("/YearOfStudy/active");
    return resp?.data ?? [];
  },
  // GET /api/YearOfStudy/{id} (Admin-only)
  getById: async (id: number | string): Promise<YearOfStudyViewModel | null> => {
    const resp = await apiRequest<YearOfStudyViewModelApiResponse>(`/YearOfStudy/${id}`);
    return resp?.data ?? null;
  },
  // POST /api/YearOfStudy with CreateYearOfStudyDTO (Admin-only)
  create: (data: CreateYearOfStudyDTO): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>("/YearOfStudy", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  // PUT /api/YearOfStudy/{id} with UpdateYearOfStudyDTO (Admin-only)
  update: (
    id: number | string,
    data: UpdateYearOfStudyDTO
  ): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/YearOfStudy/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  // DELETE /api/YearOfStudy/{id} (Admin-only)
  delete: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/YearOfStudy/${id}`, {
      method: "DELETE",
    }),
  // PUT /api/YearOfStudy/{id}/activate (Admin-only)
  activate: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/YearOfStudy/${id}/activate`, {
      method: "PUT",
    }),
  // PUT /api/YearOfStudy/{id}/deactivate (Admin-only)
  deactivate: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/YearOfStudy/${id}/deactivate`, {
      method: "PUT",
    }),
};

// Grade catalog — admin-managed list of school grades. Referenced by
// Child.gradeLevelId and grouped by GradeGroup for pricing.
export const gradeLevelsAPI = {
  // GET /api/GradeLevel (Admin-only)
  getAll: async (): Promise<GradeLevelViewModel[]> => {
    const resp = await apiRequest<GradeLevelViewModelIEnumerableApiResponse>("/GradeLevel");
    return resp?.data ?? [];
  },
  // GET /api/GradeLevel/active (Admin + Guardian — the child form's dropdown)
  getActive: async (): Promise<GradeLevelViewModel[]> => {
    const resp = await apiRequest<GradeLevelViewModelIEnumerableApiResponse>("/GradeLevel/active");
    return resp?.data ?? [];
  },
  getById: async (id: number | string): Promise<GradeLevelViewModel | null> => {
    const resp = await apiRequest<GradeLevelViewModelApiResponse>(`/GradeLevel/${id}`);
    return resp?.data ?? null;
  },
  create: (data: CreateGradeLevelDTO): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>("/GradeLevel", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: number | string, data: UpdateGradeLevelDTO): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/GradeLevel/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  // Returns 409 when a child or grade group still references the grade —
  // deactivate instead of deleting in that case.
  delete: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/GradeLevel/${id}`, { method: "DELETE" }),
  activate: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/GradeLevel/${id}/activate`, { method: "PUT" }),
  deactivate: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/GradeLevel/${id}/deactivate`, { method: "PUT" }),
};

// Grade groups — pricing bands over the grade catalog ("KG1 → Grade 2").
export const gradeGroupsAPI = {
  getAll: async (): Promise<GradeGroupViewModel[]> => {
    const resp = await apiRequest<GradeGroupViewModelIEnumerableApiResponse>("/GradeGroup");
    return resp?.data ?? [];
  },
  getActive: async (): Promise<GradeGroupViewModel[]> => {
    const resp = await apiRequest<GradeGroupViewModelIEnumerableApiResponse>("/GradeGroup/active");
    return resp?.data ?? [];
  },
  getById: async (id: number | string): Promise<GradeGroupViewModel | null> => {
    const resp = await apiRequest<GradeGroupViewModelApiResponse>(`/GradeGroup/${id}`);
    return resp?.data ?? null;
  },
  create: (data: CreateGradeGroupDTO): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>("/GradeGroup", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: number | string, data: UpdateGradeGroupDTO): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/GradeGroup/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/GradeGroup/${id}`, { method: "DELETE" }),
  activate: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/GradeGroup/${id}/activate`, { method: "PUT" }),
  deactivate: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/GradeGroup/${id}/deactivate`, { method: "PUT" }),
};

// Academic terms — the school calendar that Term/Annual plans date themselves
// from. Monthly plans never bind to a term.
export const academicTermsAPI = {
  getAll: async (): Promise<AcademicTermViewModel[]> => {
    const resp = await apiRequest<AcademicTermViewModelIEnumerableApiResponse>("/AcademicTerm");
    return resp?.data ?? [];
  },
  getActive: async (): Promise<AcademicTermViewModel[]> => {
    const resp = await apiRequest<AcademicTermViewModelIEnumerableApiResponse>("/AcademicTerm/active");
    return resp?.data ?? [];
  },
  getById: async (id: number | string): Promise<AcademicTermViewModel | null> => {
    const resp = await apiRequest<AcademicTermViewModelApiResponse>(`/AcademicTerm/${id}`);
    return resp?.data ?? null;
  },
  create: (data: CreateAcademicTermDTO): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>("/AcademicTerm", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: number | string, data: UpdateAcademicTermDTO): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/AcademicTerm/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/AcademicTerm/${id}`, { method: "DELETE" }),
  activate: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/AcademicTerm/${id}/activate`, { method: "PUT" }),
  deactivate: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/AcademicTerm/${id}/deactivate`, { method: "PUT" }),
};

/**
 * The admin pricing matrix. Admin-only on the server — a guardian never reads
 * rules, only the total that POST /Pricing/quote returns.
 */
export const pricingRulesAPI = {
  getAll: async (params?: { subscriptionPlanId?: number; isActive?: boolean }): Promise<PricingRuleViewModel[]> => {
    const qs = new URLSearchParams();
    if (params?.subscriptionPlanId !== undefined) qs.set("subscriptionPlanId", String(params.subscriptionPlanId));
    if (params?.isActive !== undefined) qs.set("isActive", String(params.isActive));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const resp = await apiRequest<PricingRuleViewModelIEnumerableApiResponse>(`/PricingRule${suffix}`);
    return resp?.data ?? [];
  },
  getActive: async (): Promise<PricingRuleViewModel[]> => {
    const resp = await apiRequest<PricingRuleViewModelIEnumerableApiResponse>("/PricingRule/active");
    return resp?.data ?? [];
  },
  getById: async (id: number | string): Promise<PricingRuleViewModel | null> => {
    const resp = await apiRequest<PricingRuleViewModelApiResponse>(`/PricingRule/${id}`);
    return resp?.data ?? null;
  },
  create: (data: CreatePricingRuleDTO): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>("/PricingRule", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: number | string, data: UpdatePricingRuleDTO): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/PricingRule/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/PricingRule/${id}`, { method: "DELETE" }),
  activate: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/PricingRule/${id}/activate`, { method: "PUT" }),
  deactivate: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/PricingRule/${id}/deactivate`, { method: "PUT" }),
};

/**
 * The single source of any price this app displays.
 *
 * Nothing on the client multiplies, discounts or totals anything: it asks the
 * server what a basket costs and renders the answer. Returns null on failure so
 * a caller shows "unavailable" rather than a number it invented.
 */
export const pricingAPI = {
  quote: async (
    subscriptionPlanId: number,
    childIds: number[],
    installmentPlanId?: number,
  ): Promise<QuoteViewModel | null> => {
    const resp = await apiRequest<QuoteViewModelApiResponse>("/Pricing/quote", {
      method: "POST",
      body: JSON.stringify({
        subscriptionPlanId,
        childIds,
        ...(installmentPlanId !== undefined ? { installmentPlanId } : {}),
      }),
    });
    return resp?.data ?? null;
  },
};

/** Sibling discount rules. Admin-only on the server, like pricing rules. */
export const discountRulesAPI = {
  getAll: async (): Promise<DiscountRuleViewModel[]> => {
    const resp = await apiRequest<DiscountRuleViewModelIEnumerableApiResponse>("/DiscountRule");
    return resp?.data ?? [];
  },
  getActive: async (): Promise<DiscountRuleViewModel[]> => {
    const resp = await apiRequest<DiscountRuleViewModelIEnumerableApiResponse>("/DiscountRule/active");
    return resp?.data ?? [];
  },
  getById: async (id: number | string): Promise<DiscountRuleViewModel | null> => {
    const resp = await apiRequest<DiscountRuleViewModelApiResponse>(`/DiscountRule/${id}`);
    return resp?.data ?? null;
  },
  create: (data: CreateDiscountRuleDTO): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>("/DiscountRule", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: number | string, data: UpdateDiscountRuleDTO): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/DiscountRule/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/DiscountRule/${id}`, { method: "DELETE" }),
  activate: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/DiscountRule/${id}/activate`, { method: "PUT" }),
  deactivate: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/DiscountRule/${id}/deactivate`, { method: "PUT" }),
};

/**
 * Instalment plan templates. `getActive` is readable by a guardian too — they
 * have to see which schedules are offered before choosing one at checkout.
 */
export const installmentPlansAPI = {
  getAll: async (): Promise<InstallmentPlanViewModel[]> => {
    const resp = await apiRequest<InstallmentPlanViewModelIEnumerableApiResponse>("/InstallmentPlan");
    return resp?.data ?? [];
  },
  getActive: async (subscriptionPlanId?: number): Promise<InstallmentPlanViewModel[]> => {
    const suffix = subscriptionPlanId !== undefined ? `?subscriptionPlanId=${subscriptionPlanId}` : "";
    const resp = await apiRequest<InstallmentPlanViewModelIEnumerableApiResponse>(`/InstallmentPlan/active${suffix}`);
    return resp?.data ?? [];
  },
  getById: async (id: number | string): Promise<InstallmentPlanViewModel | null> => {
    const resp = await apiRequest<InstallmentPlanViewModelApiResponse>(`/InstallmentPlan/${id}`);
    return resp?.data ?? null;
  },
  create: (data: CreateInstallmentPlanDTO): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>("/InstallmentPlan", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number | string, data: UpdateInstallmentPlanDTO): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/InstallmentPlan/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/InstallmentPlan/${id}`, { method: "DELETE" }),
  activate: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/InstallmentPlan/${id}/activate`, { method: "PUT" }),
  deactivate: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/InstallmentPlan/${id}/deactivate`, { method: "PUT" }),
};

/** A child's actual payment schedule. */
export const installmentsAPI = {
  forSubscription: async (subscriptionId: number | string): Promise<StudentInstallmentViewModel[]> => {
    const resp = await apiRequest<StudentInstallmentViewModelIEnumerableApiResponse>(
      `/Installment/subscription/${subscriptionId}`,
    );
    return resp?.data ?? [];
  },
  myOutstanding: async (): Promise<StudentInstallmentViewModel[]> => {
    const resp = await apiRequest<StudentInstallmentViewModelIEnumerableApiResponse>("/Installment/my-outstanding");
    return resp?.data ?? [];
  },
  forChild: async (childId: number | string, onlyOutstanding = false): Promise<StudentInstallmentViewModel[]> => {
    const suffix = onlyOutstanding ? "?onlyOutstanding=true" : "";
    const resp = await apiRequest<StudentInstallmentViewModelIEnumerableApiResponse>(
      `/Installment/child/${childId}${suffix}`,
    );
    return resp?.data ?? [];
  },
};

/**
 * Route change requests. Guardians raise and withdraw; admins review. There is
 * deliberately no guardian-facing "assign" call — that is the point of the
 * workflow.
 */
export const routeChangeRequestAPI = {
  getAll: async (params?: { status?: string; page?: number; pageSize?: number }): Promise<RouteChangeRequestViewModel[]> => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.page !== undefined) qs.set("page", String(params.page));
    if (params?.pageSize !== undefined) qs.set("pageSize", String(params.pageSize));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const resp = await apiRequest<RouteChangeRequestViewModelIEnumerableApiResponse>(`/RouteChangeRequest${suffix}`);
    return resp?.data ?? [];
  },
  getMyRequests: async (): Promise<RouteChangeRequestViewModel[]> => {
    const resp = await apiRequest<RouteChangeRequestViewModelIEnumerableApiResponse>("/RouteChangeRequest/my-requests");
    return resp?.data ?? [];
  },
  getEligibleBuses: async (id: number | string): Promise<EligibleBusViewModel[]> => {
    const resp = await apiRequest<EligibleBusViewModelIEnumerableApiResponse>(`/RouteChangeRequest/${id}/eligible-buses`);
    return resp?.data ?? [];
  },
  create: (data: CreateRouteChangeRequestDTO): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>("/RouteChangeRequest", { method: "POST", body: JSON.stringify(data) }),
  review: (id: number | string, data: ReviewRouteChangeRequestDTO): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/RouteChangeRequest/${id}/review`, { method: "PUT", body: JSON.stringify(data) }),
  cancel: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/RouteChangeRequest/${id}/cancel`, { method: "PUT" }),
};

/**
 * The audit trail. Admin-only, read-only — entries are written by the actions
 * they record and are never edited or deleted through the API.
 */
export const auditAPI = {
  search: async (params?: {
    entityType?: string;
    entityId?: number;
    action?: string;
    actorId?: number;
    page?: number;
    pageSize?: number;
  }): Promise<{ rows: AuditLogViewModel[]; total: number }> => {
    const qs = new URLSearchParams();
    if (params?.entityType) qs.set("entityType", params.entityType);
    if (params?.entityId !== undefined) qs.set("entityId", String(params.entityId));
    if (params?.action) qs.set("action", params.action);
    if (params?.actorId !== undefined) qs.set("actorId", String(params.actorId));
    if (params?.page !== undefined) qs.set("page", String(params.page));
    if (params?.pageSize !== undefined) qs.set("pageSize", String(params.pageSize));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const resp = await apiRequest<AuditLogViewModelIEnumerableApiResponse>(`/AuditLog${suffix}`);
    // `count` is the total across all pages, not the length of this page.
    return { rows: resp?.data ?? [], total: resp?.count ?? 0 };
  },
  getActions: async (): Promise<string[]> => {
    const resp = await apiRequest<StringIEnumerableApiResponse>("/AuditLog/actions");
    return resp?.data ?? [];
  },
};

// TripBooking API - use global endpoints
export const tripBookingAPI = {
  // POST /api/TripBooking (create new booking)
  create: (bookingData: CreateTripBookingDTO): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>("/TripBooking", {
      method: "POST",
      body: JSON.stringify(bookingData),
    }),
  
  // GET /api/TripBooking/{id} (get booking by id)
  getById: async (id: number | string): Promise<TripBookingViewModel | null> => {
    const resp = await apiRequest<TripBookingViewModelApiResponse>(`/TripBooking/${id}`);
    return resp?.data ?? null;
  },
  
  // DELETE /api/TripBooking/{id} (delete booking)
  delete: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/TripBooking/${id}`, {
      method: "DELETE",
    }),
  
  // PATCH /api/TripBooking/{bookId}/cancel (cancel booking)
  cancel: (bookId: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/TripBooking/${bookId}/cancel`, {
      method: "PATCH",
    }),
  
  // PUT /api/TripBooking/update-trip-pickup/{id} (update pickup location for a booking)
  updatePickupLocation: (
    id: number | string, 
    pickupData: ChangePickupTripBookingDTO
  ): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/TripBooking/update-trip-pickup/${id}`, {
      method: "PUT",
      body: JSON.stringify(pickupData),
    }),
  
  // POST /api/TripBooking/search (search/filter bookings)
  search: async (searchData: TripBookingSearchDTO): Promise<TripBookingViewModel[]> => {
    const resp = await apiRequest<TripBookingViewModelIEnumerableApiResponse>("/TripBooking/search", {
      method: "POST",
      body: JSON.stringify(searchData),
    });
    return resp?.data ?? [];
  },
  
  // GET /api/TripBooking/by-trip/{tripId}
  getByTrip: async (tripId: number | string): Promise<TripBookingViewModel[]> => {
    const resp = await apiRequest<TripBookingViewModelIEnumerableApiResponse>(`/TripBooking/by-trip/${tripId}`);
    return resp?.data ?? [];
  },
  
  // GET /api/TripBooking/by-student/{studentId}
  getByStudent: async (studentId: number | string): Promise<TripBookingViewModel[]> => {
    const resp = await apiRequest<TripBookingViewModelIEnumerableApiResponse>(`/TripBooking/by-student/${studentId}`);
    return resp?.data ?? [];
  },
  
  // GET /api/TripBooking/by-date/{date}
  getByDate: async (date: string): Promise<TripBookingViewModel[]> => {
    const resp = await apiRequest<TripBookingViewModelIEnumerableApiResponse>(`/TripBooking/by-date/${date}`);
    return resp?.data ?? [];
  },
  
  // GET /api/TripBooking/check-eligibility?tripId=&studentId=
  checkEligibility: async (tripId: number | string, studentId: number | string): Promise<boolean> => {
    const params = new URLSearchParams();
    params.append("tripId", String(tripId));
    params.append("studentId", String(studentId));
    const resp = await apiRequest<BooleanApiResponse>(`/TripBooking/check-eligibility?${params.toString()}`);
    return resp?.data ?? false;
  },

  // GET /api/TripBooking/has-booked/{tripId} - Check if user has booked a specific trip
  hasBooked: async (tripId: number | string): Promise<boolean> => {
    const resp = await apiRequest<BooleanApiResponse>(`/TripBooking/has-booked/${tripId}`);
    return resp?.data ?? false;
  },
};

// Legacy Booking API - kept for backward compatibility
export const bookingAPI = {
  getAll: () => apiRequest<unknown[]>("/Bookings"),
  getById: (id: string) => apiRequest<any>(`/Bookings/${id}`),
  getByStudent: (studentId: string) =>
    apiRequest<unknown[]>(`/Bookings?studentId=${studentId}`),
  getByTrip: (tripId: string) =>
    apiRequest<unknown[]>(`/Bookings?tripId=${tripId}`),
  create: (bookingData: Record<string, unknown>) =>
    apiRequest<unknown>("/Bookings", {
      method: "POST",
      body: JSON.stringify(bookingData),
    }),
  update: (id: string, bookingData: Record<string, unknown>) =>
    apiRequest<unknown>(`/Bookings/${id}`, {
      method: "PATCH",
      body: JSON.stringify(bookingData),
    }),
  delete: (id: string) =>
    apiRequest<any>(`/Bookings/${id}`, {
      method: "DELETE",
    }),
};

// Attendance API - use global endpoints
export const attendanceAPI = {
  getAll: () => apiRequest<unknown[]>("/Attendance"),
  getById: (id: string) => apiRequest<any>(`/Attendance/${id}`),
  getByTrip: (tripId: string) =>
    apiRequest<unknown[]>(`/Attendance?tripId=${tripId}`),
  getByStudent: (studentId: string) =>
    apiRequest<unknown[]>(`/Attendance?studentId=${studentId}`),
  create: (attendanceData: Record<string, unknown>) =>
    apiRequest<unknown>("/Attendance", {
      method: "POST",
      body: JSON.stringify(attendanceData),
    }),
  update: (id: string, attendanceData: Record<string, unknown>) =>
    apiRequest<unknown>(`/Attendance/${id}`, {
      method: "PATCH",
      body: JSON.stringify(attendanceData),
    }),
  delete: (id: string) =>
    apiRequest<any>(`/Attendance/${id}`, {
      method: "DELETE",
    }),
};

// Settings API - use global endpoints
export interface SystemSettingsResponse {
  systemName: string;
  logo: string;
  primaryColor: string;
  secondaryColor: string;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  language: "en" | "ar";
}

/** Only fields the server actually stores. */
export interface UpdateSettingsPayload {
  systemName?: string;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
  language?: "en" | "ar";
}

/**
 * These three were stubs: `get` returned a hardcoded object, `update` was a
 * no-op that reported success, and `getMaintenanceMode` always answered
 * `false`. The admin Settings page therefore appeared to save and never did,
 * and the maintenance-mode login block in useAuth could never fire.
 *
 * `getMaintenanceMode` is called from the login page before authenticating, so
 * it must not throw on a network failure — a settings lookup failing is not a
 * reason to lock everyone out. `get` is defensive for the same reason: the
 * dashboard reads branding from it on every load.
 */
export const settingsAPI = {
  get: async (): Promise<SystemSettingsResponse | null> => {
    try {
      return await apiRequest<SystemSettingsResponse>("/Settings");
    } catch {
      return null;
    }
  },
  update: (settingsData: UpdateSettingsPayload): Promise<{ success: boolean; message?: string }> =>
    apiRequest<{ success: boolean; message?: string }>("/Settings", {
      method: "PUT",
      body: JSON.stringify(settingsData),
    }),
  getMaintenanceMode: async (): Promise<{ maintenanceMode: boolean }> => {
    try {
      return await apiRequest<{ maintenanceMode: boolean }>("/Settings/maintenance-mode");
    } catch {
      // Fail open: an unreachable settings endpoint must not block sign-in.
      return { maintenanceMode: false };
    }
  },
};

// Admin system-level operations (Admin-only, backend-enforced) - use global endpoints
export interface PurgeDatabaseResponseData {
  atomic: boolean;
  deleted: Record<string, number>;
  preserved: {
    admin: { id: string; phoneNumber: string };
    settings: boolean;
  };
}

export const adminSystemAPI = {
  // POST /api/Admin/System/purge - hard-deletes all application data except the
  // current admin's own account and system settings. Backend re-validates the
  // confirmation phrase and the admin's current password.
  purgeDatabase: (payload: { confirmationPhrase: string; password: string }) =>
    apiRequest<{ success: boolean; message: string | null; data: PurgeDatabaseResponseData }>(
      "/Admin/System/purge",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),
};

// Student-specific API calls - use global endpoints
export const studentAPI = {
  // Get all students using GET /api/Users/students-data
  getAll: async () => {
    const resp = await apiRequest<any>("/Users/students-data");
    const list = resp?.data ?? resp ?? [];
    return Array.isArray(list) ? list : [];
  },

  // Get student by ID using GET /api/Users/students-data/{id}
  getById: async (id: string | number) => {
    const resp = await apiRequest<any>(`/Users/students-data/${id}`);
    const item = resp?.data ?? resp ?? null;
    return item ?? null;
  },

  // Get students by role using existing role endpoint
  getByRole: async () => {
    const resp = await apiRequest<any>("/Users/by-role/Student");
    const list = resp?.data ?? resp ?? [];
    return Array.isArray(list) ? list : [];
  },

  // GET /api/Users/students-overview - Admin-only joined registration+subscription+payment view (legacy)
  getOverview: async (): Promise<StudentOverviewRow[]> => {
    const resp = await apiRequest<StudentOverviewApiResponse>("/Users/students-overview");
    return resp?.data ?? [];
  },
  // GET /api/Users/children-overview - Admin-only: one row per child + guardian + subscription/payment
  getChildrenOverview: async (): Promise<any[]> => {
    const resp = await apiRequest<{ data: any[] }>("/Users/children-overview");
    return resp?.data ?? [];
  },
  // GET /api/Users/guardians-overview - Admin-only: one row per guardian
  getGuardiansOverview: async (): Promise<any[]> => {
    const resp = await apiRequest<{ data: any[] }>("/Users/guardians-overview");
    return resp?.data ?? [];
  },
};


// Student Dashboard API - use global endpoints
export const studentDashboardAPI = {
  getStats: (studentId: string) =>
    apiRequest<any>(`/StudentDashboard/${studentId}/stats`),
  getRecentTrips: (studentId: string) =>
    apiRequest<unknown[]>(`/StudentDashboard/${studentId}/recent-trips`),
  getUpcomingTrips: (studentId: string) =>
    apiRequest<unknown[]>(`/StudentDashboard/${studentId}/upcoming-trips`),
  getPaymentHistory: (studentId: string) =>
    apiRequest<unknown[]>(`/StudentDashboard/${studentId}/payments`),
};


// Routes.
//
// The backend now returns the standard ApiResponse envelope from every route
// endpoint (it previously returned bare arrays/objects from this one service,
// inconsistently with the rest of the API). These helpers unwrap `.data`, so
// callers keep receiving plain routes and route arrays as before.
export const routeAPI = {
  getAll: async (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    isActive?: boolean;
  }): Promise<any[]> => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
    if (params?.search) qs.set("search", params.search);
    if (params?.isActive !== undefined) qs.set("isActive", String(params.isActive));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const resp = await apiRequest<{ data: any[] | null }>(`/Routes${suffix}`);
    return resp?.data ?? [];
  },

  getById: async (id: string | number): Promise<any> => {
    const resp = await apiRequest<{ data: any }>(`/Routes/${id}`);
    return resp?.data ?? null;
  },

  create: async (routeData: Record<string, unknown>): Promise<any> => {
    const resp = await apiRequest<{ data: any }>("/Routes", {
      method: "POST",
      body: JSON.stringify(routeData),
    });
    return resp?.data ?? null;
  },

  update: async (id: string | number, routeData: Record<string, unknown>): Promise<any> => {
    const resp = await apiRequest<{ data: any }>(`/Routes/${id}`, {
      method: "PUT",
      body: JSON.stringify(routeData),
    });
    return resp?.data ?? null;
  },

  // 409s when any bus or student still references the route — deactivate instead.
  delete: (id: string | number): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/Routes/${id}`, { method: "DELETE" }),

  activate: (id: string | number): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/Routes/${id}/activate`, { method: "PUT" }),

  deactivate: (id: string | number): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/Routes/${id}/deactivate`, { method: "PUT" }),

  /** Buses serving a route, each with occupancy vs capacity. */
  getBuses: async (id: string | number): Promise<any[]> => {
    const resp = await apiRequest<{ data: any[] | null }>(`/Routes/${id}/buses`);
    return resp?.data ?? [];
  },

  /** Server-paginated students on a route. `count` is the TOTAL, not the page. */
  getStudents: async (
    id: string | number,
    params?: { page?: number; pageSize?: number; search?: string; busId?: number },
  ): Promise<{ data: any[]; total: number }> => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
    if (params?.search) qs.set("search", params.search);
    if (params?.busId !== undefined) qs.set("busId", String(params.busId));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const resp = await apiRequest<{ data: any[] | null; count?: number | null }>(
      `/Routes/${id}/students${suffix}`,
    );
    return { data: resp?.data ?? [], total: resp?.count ?? 0 };
  },
};

// Student Subscription API - use global endpoints
export const studentSubscriptionAPI = {
  // GET /api/StudentSubscription/my-active-subscription
  getMyActiveSubscription: async (): Promise<StudentSubscriptionViewModel | null> => {
    const resp = await apiRequest<StudentSubscriptionViewModelApiResponse>("/StudentSubscription/my-active-subscription");
    return resp?.data ?? null;
  },

  // GET /api/StudentSubscription/my-subscriptions
  getMySubscriptions: async (): Promise<StudentSubscriptionViewModel[]> => {
    const resp = await apiRequest<StudentSubscriptionViewModelIEnumerableApiResponse>("/StudentSubscription/my-subscriptions");
    return resp?.data ?? [];
  },

  // GET /api/StudentSubscription/my-children-subscriptions - Guardian: all children's subscriptions
  getChildrenSubscriptions: async (): Promise<StudentSubscriptionViewModel[]> => {
    const resp = await apiRequest<StudentSubscriptionViewModelIEnumerableApiResponse>("/StudentSubscription/my-children-subscriptions");
    return resp?.data ?? [];
  },

  // GET /api/StudentSubscription/{id}
  getById: async (id: number | string): Promise<StudentSubscriptionViewModel | null> => {
    const resp = await apiRequest<StudentSubscriptionViewModelApiResponse>(`/StudentSubscription/${id}`);
    return resp?.data ?? null;
  },

  // GET /api/StudentSubscription/by-student/{studentId}
  getByStudent: async (studentId: number | string): Promise<StudentSubscriptionViewModel[]> => {
    const resp = await apiRequest<StudentSubscriptionViewModelIEnumerableApiResponse>(`/StudentSubscription/by-student/${studentId}`);
    return resp?.data ?? [];
  },

  // GET /api/StudentSubscription/by-plan/{planId}
  getByPlan: async (planId: number | string): Promise<StudentSubscriptionViewModel[]> => {
    const resp = await apiRequest<StudentSubscriptionViewModelIEnumerableApiResponse>(`/StudentSubscription/by-plan/${planId}`);
    return resp?.data ?? [];
  },

  // GET /api/StudentSubscription/by-status/{status}
  getByStatus: async (status: SubscriptionStatus): Promise<StudentSubscriptionViewModel[]> => {
    const resp = await apiRequest<StudentSubscriptionViewModelIEnumerableApiResponse>(`/StudentSubscription/by-status/${status}`);
    return resp?.data ?? [];
  },

  // GET /api/StudentSubscription/expiring-soon
  getExpiringSoon: async (): Promise<StudentSubscriptionViewModel[]> => {
    const resp = await apiRequest<StudentSubscriptionViewModelIEnumerableApiResponse>("/StudentSubscription/expiring-soon");
    return resp?.data ?? [];
  },

  // GET /api/StudentSubscription/expired
  getExpired: async (): Promise<StudentSubscriptionViewModel[]> => {
    const resp = await apiRequest<StudentSubscriptionViewModelIEnumerableApiResponse>("/StudentSubscription/expired");
    return resp?.data ?? [];
  },

  // PUT /api/StudentSubscription/{id}/activate
  activate: (id: number | string): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/StudentSubscription/${id}/activate`, {
      method: "PUT",
    }),

  // PUT /api/StudentSubscription/{id}/suspend
  suspend: (id: number | string, suspendData: SuspendSubscriptionDTO): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>(`/StudentSubscription/${id}/suspend`, {
      method: "PUT",
      body: JSON.stringify(suspendData),
    }),

  // PUT /api/StudentSubscription/by-student/{studentId}/reset — Admin-only.
  // Cancels the student's active subscription and rejects any pending
  // payment so they're free to pick a plan again. Records are preserved.
  resetForStudent: (
    studentId: number | string
  ): Promise<{ success: boolean; message: string | null; data: { subscriptionsReset: number; paymentsReset: number } | null }> =>
    apiRequest<{ success: boolean; message: string | null; data: { subscriptionsReset: number; paymentsReset: number } | null }>(
      `/StudentSubscription/by-student/${studentId}/reset`,
      { method: "PUT" }
    ),

  // POST /api/StudentSubscription/request-cancellation - guardian asks to cancel
  // one child's active subscription. { childId, reason }. Nothing is cancelled
  // until an admin approves.
  requestCancellation: (dto: RequestCancellationDTO & { childId: number }): Promise<BooleanApiResponse> =>
    apiRequest<BooleanApiResponse>("/StudentSubscription/request-cancellation", {
      method: "POST",
      body: JSON.stringify(dto),
    }),

  // GET /api/StudentSubscription/cancellation-requests - Admin-only queue
  getCancellationRequests: async (status = "Pending"): Promise<CancellationRequestViewModel[]> => {
    const resp = await apiRequest<{ data: CancellationRequestViewModel[] | null; success: boolean }>(
      `/StudentSubscription/cancellation-requests?status=${encodeURIComponent(status)}`
    );
    return resp?.data ?? [];
  },

  // PUT /api/StudentSubscription/{id}/cancellation-review - Admin approves/rejects
  reviewCancellation: (
    id: number | string,
    dto: ReviewCancellationDTO
  ): Promise<{ success: boolean; message: string | null; data: { refunded: boolean; refundAmount: number; paymentId: number | null } | null }> =>
    apiRequest(`/StudentSubscription/${id}/cancellation-review`, {
      method: "PUT",
      body: JSON.stringify(dto),
    }),
};

// ==================== Voting / Surveys ====================
export const votingAPI = {
  getAll: async (): Promise<any> => {
    const resp = await apiRequest<any>("/Voting");
    return resp;
  },
  getActive: async (): Promise<any> => {
    const resp = await apiRequest<any>("/Voting/active");
    return resp;
  },
  getById: async (id: string): Promise<any> => {
    const resp = await apiRequest<any>(`/Voting/${id}`);
    return resp;
  },
  getResults: async (id: string): Promise<any> => {
    const resp = await apiRequest<any>(`/Voting/${id}/results`);
    return resp;
  },
  getResultsByDate: async (id: string, dateKey: string): Promise<any> => {
    const resp = await apiRequest<any>(`/Voting/${id}/results/${dateKey}`);
    return resp;
  },
  hasVoted: async (id: string): Promise<any> => {
    const resp = await apiRequest<any>(`/Voting/${id}/has-voted`);
    return resp;
  },
  create: async (data: any): Promise<any> => {
    return apiRequest<any>("/Voting", { method: "POST", body: JSON.stringify(data) });
  },
  update: async (id: string, data: any): Promise<any> => {
    return apiRequest<any>(`/Voting/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  toggleActive: async (id: string): Promise<any> => {
    return apiRequest<any>(`/Voting/${id}/toggle-active`, { method: "PUT" });
  },
  delete: async (id: string): Promise<any> => {
    return apiRequest<any>(`/Voting/${id}`, { method: "DELETE" });
  },
  submitVote: async (data: { surveyId: string; answers: Array<{ questionIndex: number; answer: string }> }): Promise<any> => {
    return apiRequest<any>("/Voting/submit", { method: "POST", body: JSON.stringify(data) });
  },
};
