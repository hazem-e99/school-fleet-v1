export interface SchoolViewModel {
  id: number;
  name: string | null;
  isActive: boolean;
}

export interface CreateSchoolDTO {
  name: string;
  isActive?: boolean;
}

export interface UpdateSchoolDTO {
  name?: string | null;
  isActive?: boolean | null;
}

export interface SchoolViewModelApiResponse {
  data: SchoolViewModel;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}

export interface SchoolViewModelIEnumerableApiResponse {
  data: SchoolViewModel[] | null;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}
