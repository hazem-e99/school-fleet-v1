export type UserRole = 'admin' | 'guardian' | 'student' | 'supervisor' | 'movement-manager' | 'driver' | 'conductor';

export interface User {
  id: string | number;
  profileId?: string | number;
  firstName?: string;
  lastName?: string;
  name?: string; // Keep for backward compatibility
  fullName?: string;
  password?: string;
  role: UserRole;
  phoneNumber?: string;
  phone?: string; // Keep for backward compatibility
  nationalId?: string;
  status?: 'active' | 'inactive' | 'suspended';
  avatar?: string;
  profilePictureUrl?: string; // API field
  createdAt?: string;
  updatedAt?: string;
  // New fields from LoginViewModel
  token?: string;
  expiration?: string;
  // Additional fields for compatibility
  department?: string;
  preferredArea?: string;
  academicYear?: string;
  subscriptionStatus?: 'active' | 'expired' | 'none';
}

// StudentViewModel from Swagger API
export interface StudentViewModel {
  id: number;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  nationalId?: string;
  profilePictureUrl?: string;
  status: 'Active' | 'Inactive' | 'Suspended';
  role: 'Student' | 'Driver' | 'Conductor' | 'MovementManager' | 'Admin';
  studentProfileId: number;
  studentAcademicNumber?: string;
  department?: string;
  preferredArea?: string;
  yearOfStudy?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
}

export interface Student extends User {
  role: 'student';
  studentId?: string;
  studentAcademicNumber?: string;
  department: string;
  preferredArea?: string;
  academicYear: string;
  subscriptionStatus: 'active' | 'expired' | 'none';
  subscriptionExpiry?: string;
  paymentMethod?: 'cash' | 'bank';
  pickupPoint?: string;
  // Additional fields for compatibility
  yearOfStudy?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
}

export interface Driver extends User {
  role: 'driver';
  licenseNumber: string;
  experience?: number;
  assignedBusId?: string;
  currentRouteId?: string;
}

export interface Supervisor extends User {
  role: 'supervisor';
  assignedBusId?: string;
  assignedRouteId?: string;
}

export interface MovementManager extends User {
  role: 'movement-manager';
  permissions?: string[];
}

export interface Admin extends User {
  role: 'admin';
  permissions?: string[];
}

export interface Guardian extends User {
  role: 'guardian';
}

/** A child (rider) managed by a guardian. `id` slots into downstream `studentId` fields. */
export interface Child {
  id: number;
  guardianId: number;
  guardianName?: string | null;
  guardianPhone?: string | null;
  name: string;
  /** Alias of `name`, kept so existing UI reading child.fullName keeps working. */
  fullName: string;
  schoolName: string;
  pickupAreaName: string;
  gender?: 'Male' | 'Female' | null;
  dateOfBirth?: string | null;
  status: 'Active' | 'Inactive';
  activeSubscription?: {
    id: number;
    subscriptionPlanId: number;
    subscriptionPlanName: string | null;
    subscriptionPlanPrice: number;
    startDate: string | null;
    endDate: string | null;
    status: string;
    cancellationStatus: string;
  } | null;
  createdAt?: string | null;
}

export interface CreateChildDTO {
  name: string;
  schoolName: string;
  pickupAreaName: string;
  gender?: 'Male' | 'Female';
  dateOfBirth?: string;
}

export type UpdateChildDTO = Partial<CreateChildDTO>;
