/**
 * A guardian's request to move a child to a different route.
 *
 * Guardians never reassign directly — an admin reviews and applies. The route
 * and bus actually applied are carried separately from the ones requested,
 * because an admin may approve onto a different bus than the guardian named.
 */
export interface RouteChangeRequestViewModel {
  id: number;
  childId: number;
  childName: string | null;
  guardianId: number;
  guardianName: string | null;
  guardianPhone: string | null;
  currentRouteId: number | null;
  currentRouteName: string | null;
  currentBusId: number | null;
  currentBusNumber: string | null;
  requestedRouteId: number;
  requestedRouteName: string | null;
  preferredBusId: number | null;
  preferredBusNumber: string | null;
  reason: string | null;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled' | string;
  adminNotes: string | null;
  reviewedById: number | null;
  reviewedAt: string | null;
  appliedRouteId: number | null;
  appliedRouteName: string | null;
  appliedBusId: number | null;
  appliedBusNumber: string | null;
  createdAt: string | null;
}

/** A bus on the requested route, with why it can or cannot take the child. */
export interface EligibleBusViewModel {
  id: number;
  busNumber: string | null;
  capacity: number;
  status: string;
  assignedStudents: number;
  availableSeats: number;
  isEligible: boolean;
  /** Populated only when isEligible is false. */
  ineligibleReason: string | null;
}

export interface CreateRouteChangeRequestDTO {
  childId: number;
  requestedRouteId: number;
  preferredBusId?: number;
  reason?: string;
}

export interface ReviewRouteChangeRequestDTO {
  status: 'Approved' | 'Rejected';
  adminNotes?: string;
  assignedBusId?: number;
  allowOverCapacity?: boolean;
}

export interface RouteChangeRequestViewModelApiResponse {
  data: RouteChangeRequestViewModel;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}

export interface RouteChangeRequestViewModelIEnumerableApiResponse {
  data: RouteChangeRequestViewModel[] | null;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}

export interface EligibleBusViewModelIEnumerableApiResponse {
  data: EligibleBusViewModel[] | null;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}
