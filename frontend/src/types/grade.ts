/** A single grade in the admin-managed catalog (KG1, Grade 1, ...). */
export interface GradeLevelViewModel {
  id: number;
  name: string | null;
  /** Explicit sort key — grade names do not sort correctly alphabetically. */
  order: number;
  isActive: boolean;
}

export interface CreateGradeLevelDTO {
  name: string;
  order?: number;
  isActive?: boolean;
}

export interface UpdateGradeLevelDTO {
  name?: string | null;
  order?: number | null;
  isActive?: boolean | null;
}

export interface GradeLevelViewModelApiResponse {
  data: GradeLevelViewModel;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}

export interface GradeLevelViewModelIEnumerableApiResponse {
  data: GradeLevelViewModel[] | null;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}

/** A named set of grades that a pricing rule attaches to, e.g. "KG1 → Grade 2". */
export interface GradeGroupViewModel {
  id: number;
  name: string | null;
  gradeLevelIds: number[];
  /** Resolved server-side for display, ordered by each grade's own `order`. */
  gradeLevelNames: string[];
  gradeCount: number;
  isActive: boolean;
}

export interface CreateGradeGroupDTO {
  name: string;
  gradeLevelIds: number[];
  isActive?: boolean;
}

export interface UpdateGradeGroupDTO {
  name?: string | null;
  gradeLevelIds?: number[];
  isActive?: boolean | null;
}

export interface GradeGroupViewModelApiResponse {
  data: GradeGroupViewModel;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}

export interface GradeGroupViewModelIEnumerableApiResponse {
  data: GradeGroupViewModel[] | null;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}
