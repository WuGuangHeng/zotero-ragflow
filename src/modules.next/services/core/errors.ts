/**
 * Error codes
 */
export enum ServiceErrorCode {
  // General errors
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
  NETWORK_ERROR = "NETWORK_ERROR",
  TIMEOUT_ERROR = "TIMEOUT_ERROR",
  INVALID_RESPONSE = "INVALID_RESPONSE",

  // Authentication/Authorization errors
  AUTH_ERROR = "AUTH_ERROR",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",

  // Knowledge base errors
  KB_NOT_FOUND = "KB_NOT_FOUND",
  KB_NOT_READY = "KB_NOT_READY",
  KB_PROCESSING = "KB_PROCESSING",
  KB_ERROR = "KB_ERROR",

  // Session errors
  SESSION_NOT_FOUND = "SESSION_NOT_FOUND",
  SESSION_EXPIRED = "SESSION_EXPIRED",
  SESSION_ERROR = "SESSION_ERROR",

  // Document errors
  DOCUMENT_NOT_FOUND = "DOCUMENT_NOT_FOUND",
  DOCUMENT_UPLOAD_ERROR = "DOCUMENT_UPLOAD_ERROR",
  DOCUMENT_PROCESS_ERROR = "DOCUMENT_PROCESS_ERROR",
  INVALID_DOCUMENT = "INVALID_DOCUMENT",

  // Chat/Message errors
  CHAT_ERROR = "CHAT_ERROR",
  MESSAGE_ERROR = "MESSAGE_ERROR",
  INVALID_MESSAGE = "INVALID_MESSAGE",
  TOKEN_LIMIT = "TOKEN_LIMIT",

  // Storage errors
  STORAGE_ERROR = "STORAGE_ERROR",
  STORAGE_FULL = "STORAGE_FULL",
  STORAGE_CORRUPTED = "STORAGE_CORRUPTED"
}

/**
 * Service error class
 */
export class ServiceError extends Error {
  constructor(
    public code: ServiceErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = "ServiceError";
  }

  public toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details
    };
  }
}

/**
 * Helper function to check if error is a specific error code
 */
export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}

/**
 * Helper function to check if error has a specific error code
 */
export function hasErrorCode(error: unknown, code: ServiceErrorCode): boolean {
  return isServiceError(error) && error.code === code;
}

/**
 * Create service error from API error response
 */
export function createServiceError(response: { code: number; message: string; details?: any }): ServiceError {
  let code: ServiceErrorCode;
  
  switch (response.code) {
    case 401:
      code = ServiceErrorCode.UNAUTHORIZED;
      break;
    case 403:
      code = ServiceErrorCode.FORBIDDEN;
      break;
    case 404:
      code = ServiceErrorCode.KB_NOT_FOUND;
      break;
    case 408:
      code = ServiceErrorCode.TIMEOUT_ERROR;
      break;
    case 500:
      code = ServiceErrorCode.UNKNOWN_ERROR;
      break;
    default:
      code = ServiceErrorCode.UNKNOWN_ERROR;
  }

  return new ServiceError(code, response.message, response.details);
}

/**
 * Create service error from Error object
 */
export function fromError(error: Error, code = ServiceErrorCode.UNKNOWN_ERROR): ServiceError {
  return new ServiceError(code, error.message);
}
