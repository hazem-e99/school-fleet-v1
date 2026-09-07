import type { StudentInstallmentViewModel } from './installment';

/**
 * The admin child detail view, assembled server-side in one request.
 *
 * Every monetary field is read from a stored snapshot — the page performs no
 * arithmetic of its own, which is the same rule the guardian purchase flow
 * follows.
 */
export interface ChildDetailChild {
  id: number;
  name: string;
  email: string | null;
  schoolName: string | null;
  pickupAreaName: string | null;
  gradeLevelId: number | null;
  gradeLevelName: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  status: string;
  registeredAt: string | null;
}

export interface ChildDetailGuardian {
  id: number;
  name: string;
  phoneNumber: string | null;
}

export interface ChildDetailSibling {
  id: number;
  name: string;
  /** True for the child being viewed, so the family list can mark them. */
  isSelf: boolean;
  gradeLevelName: string | null;
  routeName: string | null;
  busNumber: string | null;
  hasActiveSubscription: boolean;
}

export interface ChildDetailAssignment {
  routeId: number | null;
  routeName: string | null;
  /** Null when the child is on no route. */
  routeIsActive: boolean | null;
  busId: number | null;
  busNumber: string | null;
  busStatus: string | null;
  busCapacity: number | null;
  busAssignedStudents: number | null;
  busAvailableSeats: number | null;
}

export interface ChildDetailSubscription {
  id: number;
  subscriptionPlanId: number;
  subscriptionPlanName: string | null;
  subscriptionType: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  status: string;
  cancellationStatus: string;
  /** What was actually charged — snapshot first, live plan price as fallback. */
  price: number;
  /** False for legacy rows created before pricing snapshots existed. */
  hasSnapshot: boolean;
  basePrice: number | null;
  pricingRuleId: number | null;
  pricingRuleName: string | null;
  gradeLevelName: string | null;
  gradeGroupName: string | null;
  academicTermId: number | null;
  termName: string | null;
  siblingPosition: number | null;
  discountRuleId: number | null;
  discountType: string | null;
  discountValue: number | null;
  discountAmount: number;
  discountReason: string | null;
  finalPrice: number | null;
  installmentPlanId: number | null;
  installmentPlanName: string | null;
  activateOnFirstInstallment: boolean | null;
  paidAmount: number | null;
  remainingAmount: number | null;
  nextDueDate: string | null;
  paymentState: string | null;
  installments: StudentInstallmentViewModel[];
}

export interface ChildDetailPayment {
  id: number;
  amount: number;
  originalAmount: number | null;
  discountAmount: number | null;
  status: string;
  paymentMethod: string | null;
  paymentChannel: string | null;
  paymentReferenceCode: string | null;
  subscriptionPlanName: string | null;
  childCount: number;
  installmentIds: number[];
  refundAmount: number | null;
  reviewedAt: string | null;
  createdAt: string | null;
}

export interface ChildDetailRouteRequest {
  id: number;
  currentRouteName: string | null;
  currentBusNumber: string | null;
  requestedRouteName: string | null;
  preferredBusNumber: string | null;
  appliedRouteName: string | null;
  appliedBusNumber: string | null;
  reason: string | null;
  status: string;
  adminNotes: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
}

export interface ChildDetailAuditEntry {
  action: string;
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  actorId: number | null;
  actorRole: string | null;
  note: string | null;
  at: string | null;
}

export interface ChildDetailViewModel {
  child: ChildDetailChild;
  guardian: ChildDetailGuardian | null;
  siblings: ChildDetailSibling[];
  assignment: ChildDetailAssignment;
  subscriptions: ChildDetailSubscription[];
  payments: ChildDetailPayment[];
  routeChangeRequests: ChildDetailRouteRequest[];
  assignmentHistory: ChildDetailAuditEntry[];
}

export interface ChildDetailViewModelApiResponse {
  data: ChildDetailViewModel;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}
