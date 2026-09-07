/** When one instalment falls due. */
export interface InstallmentDueRule {
  type: 'FixedDate' | 'OffsetDays' | 'TermStartOffset' | 'TermDueDate' | string;
  date: string | null;
  offsetDays: number | null;
  termDueDateIndex: number | null;
}

export interface InstallmentDefinition {
  index: number;
  percentage: number | null;
  amount: number | null;
  dueRule: InstallmentDueRule;
  gracePeriodDays: number;
}

/**
 * An admin-defined payment schedule template. The actual schedule is
 * materialised per child, and a snapshot of this is frozen onto the
 * subscription, so editing a plan never rewrites a schedule already sold.
 */
export interface InstallmentPlanViewModel {
  id: number;
  name: string | null;
  /** Empty means every subscription plan. */
  applicablePlanIds: number[];
  applicablePlanNames: string[];
  allocationType: 'Percentage' | 'Fixed' | string;
  installmentCount: number;
  installments: InstallmentDefinition[];
  activateOnFirstInstallment: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  isActive: boolean;
}

export interface CreateInstallmentPlanDTO {
  name: string;
  applicablePlanIds?: number[];
  allocationType: string;
  installments: Array<{
    index: number;
    percentage?: number;
    amount?: number;
    dueRule: { type: string; date?: string; offsetDays?: number; termDueDateIndex?: number };
    gracePeriodDays?: number;
  }>;
  activateOnFirstInstallment?: boolean;
  effectiveFrom: string;
  effectiveTo?: string;
  isActive?: boolean;
}

export type UpdateInstallmentPlanDTO = Partial<CreateInstallmentPlanDTO>;

/** One row of a child's actual schedule. */
export interface StudentInstallmentViewModel {
  id: number;
  studentSubscriptionId: number;
  childId: number;
  index: number;
  dueDate: string | null;
  gracePeriodDays: number;
  amount: number;
  paidAmount: number;
  outstanding: number;
  /** 'Overdue' is derived server-side from dueDate + grace, never stored. */
  status: 'Pending' | 'PartiallyPaid' | 'Paid' | 'Cancelled' | 'Overdue' | string;
  isOverdue: boolean;
  paymentIds: number[];
}

export interface InstallmentPlanViewModelApiResponse {
  data: InstallmentPlanViewModel;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}

export interface InstallmentPlanViewModelIEnumerableApiResponse {
  data: InstallmentPlanViewModel[] | null;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}

export interface StudentInstallmentViewModelIEnumerableApiResponse {
  data: StudentInstallmentViewModel[] | null;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}
