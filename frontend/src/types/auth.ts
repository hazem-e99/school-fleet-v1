// Authentication Types

// LoginDTO - Request schema
export interface LoginDTO {
  phoneNumber: string;     // pattern: ^01[0-2,5]{1}[0-9]{8}$
  password: string;        // minLength: 1
  rememberMe?: boolean;    // optional
}

// LoginViewModel - Response schema
export interface LoginViewModel {
  id: number;
  profileId: number;
  token: string | null;
  phoneNumber: string | null;
  fullName: string | null;
  role: string | null;
  expiration: string;      // ISO date string
}

// LoginResponse - Full API response
export interface LoginResponse {
  data: LoginViewModel;
  count: number;
  message: string;
  success: boolean;
  timestamp: string;       // ISO date string
  errorCode: string;
  requestId: string;
}

// StaffRegistrationDTO - Request schema for Admin, Driver, Staff
export interface StaffRegistrationDTO {
  firstName: string;       // minLength: 2, maxLength: 20
  lastName: string;        // minLength: 2, maxLength: 20
  nationalId: string;      // pattern: ^\d{14}$
  phoneNumber: string;     // pattern: ^01[0-2,5]{1}[0-9]{8}$
  role: 'Admin' | 'Conductor' | 'Driver' | 'MovementManager';
}

// StaffRegistrationResponse - Full API response
export interface StaffRegistrationResponse {
  data: boolean;
  count: number;
  message: string;
  success: boolean;
  timestamp: string;       // ISO date string
  errorCode: string;
  requestId: string;
}

// There is no self-service password reset. An admin resets a user's password
// via PUT /api/Users/:id/reset-password (see userAPI.adminResetPassword).
