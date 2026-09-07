/**
 * One entry in the audit trail.
 *
 * `before`/`after` are free-form snapshots of whatever changed, so the shape
 * varies by `entityType` — the UI renders them generically rather than
 * pretending to know each one.
 */
export interface AuditLogViewModel {
  entityType: string;
  entityId: number;
  action: string;
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  actorId: number | null;
  actorName: string | null;
  actorRole: string | null;
  note: string | null;
  at: string | null;
}

export interface AuditLogViewModelIEnumerableApiResponse {
  data: AuditLogViewModel[] | null;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}

export interface StringIEnumerableApiResponse {
  data: string[] | null;
  count?: number | null;
  message?: string | null;
  success: boolean;
  timestamp: string;
  errorCode?: any;
  requestId?: string | null;
}
