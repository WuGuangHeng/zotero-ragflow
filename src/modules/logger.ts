interface LogPayload {
  message: string;
  error?: unknown;
  data?: Record<string, unknown>;
}

type LogLevel = "error" | "warn" | "info" | "debug";

export class Logger {
  /**
   * 格式化消息
   */
  private static formatMessage(level: LogLevel, message: string | LogPayload): string {
    if (typeof message === "string") {
      return `[RAGFlow][${level.toUpperCase()}] ${message}`;
    }

    let formattedMessage = `[RAGFlow][${level.toUpperCase()}] ${message.message}`;
    if (message.data) {
      formattedMessage += `\nData: ${JSON.stringify(message.data, null, 2)}`;
    }
    if (message.error) {
      const errorDetails = message.error instanceof Error 
        ? `${message.error.message}\n${message.error.stack}` 
        : String(message.error);
      formattedMessage += `\nError: ${errorDetails}`;
    }
    return formattedMessage;
  }

  /**
   * 输出调试信息
   */
  public static debug(message: string | LogPayload): void {
    Zotero.debug(this.formatMessage("debug", message));
  }

  /**
   * 输出普通信息
   */
  public static info(message: string | LogPayload): void {
    // 对于普通信息，使用debug级别输出
    Zotero.debug(this.formatMessage("info", message));
  }

  /**
   * 输出警告信息
   */
  public static warn(message: string | LogPayload): void {
    Zotero.log(this.formatMessage("warn", message), "warning");
  }

  /**
   * 输出错误信息
   */
  public static error(message: string | LogPayload, error?: Error | unknown): void {
    // 处理旧格式调用
    if (typeof message === "string" && error) {
      const payload: LogPayload = {
        message,
        error
      };
      message = payload;
    }

    // 错误信息使用error级别输出
    Zotero.log(this.formatMessage("error", message), "error");

    // 处理错误对象
    if (typeof message === "object" && message.error) {
      const errorObj = message.error instanceof Error 
        ? message.error 
        : new Error(String(message.error));
      Zotero.logError(errorObj);
    }
  }

  /**
   * 输出原始日志
   */
  public static raw(message: string): void {
    Zotero.debug(message);
  }
}
