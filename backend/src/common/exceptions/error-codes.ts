/**
 * Stable, machine-readable error codes returned in the `errorCode` field of every
 * error response. The frontend should switch on these instead of matching message text.
 */
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  INVALID_ID: 'INVALID_ID',

  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_ACCOUNT_SUSPENDED: 'AUTH_ACCOUNT_SUSPENDED',
  AUTH_TOKEN_MISSING: 'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  UNAUTHORIZED: 'UNAUTHORIZED',

  PERMISSION_DENIED: 'PERMISSION_DENIED',

  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',

  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  PHONE_ALREADY_REGISTERED: 'PHONE_ALREADY_REGISTERED',
  NATIONAL_ID_ALREADY_REGISTERED: 'NATIONAL_ID_ALREADY_REGISTERED',
  PASSWORD_MISMATCH: 'PASSWORD_MISMATCH',
  CURRENT_PASSWORD_INCORRECT: 'CURRENT_PASSWORD_INCORRECT',
  CONFIRMATION_PHRASE_MISMATCH: 'CONFIRMATION_PHRASE_MISMATCH',
  PURGE_FAILED: 'PURGE_FAILED',

  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',

  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  FILE_REQUIRED: 'FILE_REQUIRED',

  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/** Fallback mapping from HTTP status to an error code, used for exceptions that don't specify one. */
export const statusToErrorCode = (status: number): ErrorCode => {
  switch (status) {
    case 400:
      return ErrorCodes.BAD_REQUEST;
    case 401:
      return ErrorCodes.UNAUTHORIZED;
    case 403:
      return ErrorCodes.PERMISSION_DENIED;
    case 404:
      return ErrorCodes.RESOURCE_NOT_FOUND;
    case 409:
      return ErrorCodes.CONFLICT;
    case 422:
      return ErrorCodes.VALIDATION_ERROR;
    case 429:
      return ErrorCodes.RATE_LIMITED;
    case 503:
      return ErrorCodes.SERVICE_UNAVAILABLE;
    default:
      return ErrorCodes.INTERNAL_SERVER_ERROR;
  }
};
