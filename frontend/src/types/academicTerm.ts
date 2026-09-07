/** One configurable payment deadline inside a term. */
export interface TermDueDate {
  label: string;
  /** ISO date string. */
  date: string;
}

/**
 * Admin-managed academic calendar. Applies to Term and Annual subscription
 * plans only — Monthly plans stay rolling on durationInDays.
 */
export interface AcademicTermViewModel {
  id: number;
  name: string | null;
  startDate: string | null;
  endDate: string | null;
  paymentDueDate: string | null;
  dueDateRules: TermDueDate[];
  isActive: boolean;
}

export interface CreateAcademicTermDTO {
  name: string;
  startDate: string;
  endDate: string;
  paymentDueDate?: string;
  dueDateRules?: TermDueDate[];
  isActive?: boolean;
}

export interface UpdateAcademicTermDTO {
  name?: string | null;
  startDate?: string;
  endDate?: string;
  paymentDueDate?: string;
  dueDateRules?: TermDueDate[];
  isActive?: boolean | null;
}

export interface AcademicTermViewModelApiResponse {
  data: AcademicTermViewModel;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}

export interface AcademicTermViewModelIEnumerableApiResponse {
  data: AcademicTermViewModel[] | null;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}
