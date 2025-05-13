import { LogLevel, LogOptions } from "./types/common";

/**
 * 日志管理器
 */
class LogManager {
  private static instance: LogManager;
  private enabled = true;
  private minLevel: LogLevel = "info";
  private buffer: LogOptions[] = [];
  private maxBufferSize = 1000;

  private constructor() {
    // 私有构造函数，防止直接实例化
  }

  public static getInstance(): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager();
    }
    return LogManager.instance;
  }

  /**
   * 设置日志级别
   */
  public setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * 启用/禁用日志
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * 设置缓冲区大小
   */
  public setBufferSize(size: number): void {
    this.maxBufferSize = size;
    if (this.buffer.length > size) {
      this.buffer = this.buffer.slice(-size);
    }
  }

  /**
   * 记录调试信息
   */
  public debug(options: Omit<LogOptions, "level">): void {
    this.log({ ...options, level: "debug" });
  }

  /**
   * 记录一般信息
   */
  public info(options: Omit<LogOptions, "level">): void {
    this.log({ ...options, level: "info" });
  }

  /**
   * 记录警告信息
   */
  public warn(options: Omit<LogOptions, "level">): void {
    this.log({ ...options, level: "warn" });
  }

  /**
   * 记录错误信息
   */
  public error(options: Omit<LogOptions, "level">): void {
    this.log({ ...options, level: "error" });
  }

  /**
   * 记录日志
   */
  private log(options: LogOptions): void {
    if (!this.enabled || !this.shouldLog(options.level)) return;

    const entry: LogOptions = {
      ...options,
      timestamp: options.timestamp ?? Date.now()
    };

    // 添加到缓冲区
    this.buffer.push(entry);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    // 控制台输出
    this.consoleOutput(entry);
  }

  /**
   * 判断是否应该记录该级别的日志
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  // /**
  //  * 控制台输出
  //  */
  // private consoleOutput(entry: LogOptions): void {
  //   const time = new Date(entry.timestamp || Date.now()).toISOString();
  //   const context = entry.context ? `[${entry.context}] ` : "";
  //   const message = `${time} ${context}${entry.message}`;

  //   switch (entry.level) {
  //     case "debug":
  //       console.debug(message, entry.data || "");
  //       break;
  //     case "info":
  //       console.info(message, entry.data || "");
  //       break;
  //     case "warn":
  //       console.warn(message, entry.data || "");
  //       break;
  //     case "error":
  //       console.error(message, entry.data || "", entry.error || "");
  //       break;
  //   }
  // }
  /**
 * 控制台输出
 */
  private consoleOutput(entry: LogOptions): void {
    const time = new Date(entry.timestamp || Date.now()).toISOString();
    const context = entry.context ? `[${entry.context}] ` : "";
    const message = `${time} ${context}${entry.message}`;
    const data = entry.data ? ` ${JSON.stringify(entry.data)}` : "";
    const error = entry.error ? ` ${JSON.stringify(entry.error)}` : "";

    // 使用Zotero.debug()替代console
    switch (entry.level) {
      case "debug":
        Zotero.debug(`[DEBUG] ${message}${data}`);
        break;
      case "info":
        Zotero.debug(`[INFO] ${message}${data}`);
        break;
      case "warn":
        Zotero.debug(`[WARN] ${message}${data}`);
        break;
      case "error":
        Zotero.debug(`[ERROR] ${message}${data}${error}`);
        break;
    }
  }

  /**
   * 获取日志缓冲区
   */
  public getBuffer(): LogOptions[] {
    return [...this.buffer];
  }

  /**
   * 清空日志缓冲区
   */
  public clearBuffer(): void {
    this.buffer = [];
  }

  /**
   * 导出日志
   */
  public exportLogs(): string {
    return JSON.stringify(this.buffer, null, 2);
  }
}

/**
 * 导出单例实例
 */
export const Logger = LogManager.getInstance();
