/**
 * 会话错误类型
 */
export enum ErrorType {
  NOT_FOUND = "SESSION_NOT_FOUND",
  CREATE_FAILED = "SESSION_CREATE_FAILED",
  DELETE_FAILED = "SESSION_DELETE_FAILED",
  UPDATE_FAILED = "SESSION_UPDATE_FAILED",
  SEND_FAILED = "MESSAGE_SEND_FAILED",
  CLEAR_FAILED = "CLEAR_DATA_FAILED",
  STORAGE_ERROR = "STORAGE_ERROR",
  INVALID_DATA = "INVALID_DATA",
  
  // 助手相关错误
  ASSISTANT_NOT_FOUND = "ASSISTANT_NOT_FOUND",
  ASSISTANT_CREATE_FAILED = "ASSISTANT_CREATE_FAILED",
  ASSISTANT_UPDATE_FAILED = "ASSISTANT_UPDATE_FAILED",
  ASSISTANT_DELETE_FAILED = "ASSISTANT_DELETE_FAILED"
}

/**
 * 会话错误类
 */
export class SessionError extends Error {
  constructor(
    public readonly type: ErrorType,
    public readonly details?: string
  ) {
    super(details || type);
    this.name = "SessionError";
  }
}

/**
 * 存储错误类型
 */
export enum StorageErrorType {
  INIT_FAILED = "STORAGE_INIT_FAILED",
  READ_FAILED = "STORAGE_READ_FAILED",
  WRITE_FAILED = "STORAGE_WRITE_FAILED",
  DELETE_FAILED = "STORAGE_DELETE_FAILED",
  CLEAR_FAILED = "STORAGE_CLEAR_FAILED",
  INVALID_DATA = "STORAGE_INVALID_DATA",
  NOT_FOUND = "STORAGE_NOT_FOUND"
}

/**
 * 存储错误类
 */
export class StorageError extends Error {
  constructor(
    public readonly type: StorageErrorType,
    public readonly details?: string
  ) {
    super(details || type);
    this.name = "StorageError";
  }
}
