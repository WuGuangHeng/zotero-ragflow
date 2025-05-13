﻿import { Logger } from "../../../services/logger";
import {
  KnowledgeBaseStatus as KBStatus,
  ApiErrorCode,
} from "../../../services/types/common";
import { TaskQueue, TaskPriority, TaskStatus, TaskProgress } from "./queue";
import {
  KnowledgeBaseStatus,
  KnowledgeBaseTask,
  WatcherConfig,
  RequiredWatcherConfig,
  WatcherEvent,
} from "./types";

export class Watcher {
  private config: RequiredWatcherConfig;
  private timer?: number;
  private readonly ERROR_CONTEXT = "Watcher";
  private maxRetries: number = 3;
  private retryDelay: number = 1000;
  private errorCount: number = 0;
  private lastError?: Error;
  private lastStatus?: KnowledgeBaseStatus;
  private taskQueue: TaskQueue = new TaskQueue();
  private checkTaskId?: string;

  private lastTask?: KnowledgeBaseTask;
  private readonly DEFAULT_INTERVAL = 5000;
  private readonly MIN_INTERVAL = 1000;
  private readonly MAX_INTERVAL = 60000;

  constructor(config: WatcherConfig) {
    this.validateConfig(config);

    const defaultHandlers = {
      onStatusChanged: (id: string, status: KnowledgeBaseStatus) => {},
      onTaskUpdated: (id: string, task: KnowledgeBaseTask) => {},
      onError: (id: string, error: Error) => {},
    };

    this.config = {
      id: config.id,
      name: config.name,
      interval: this.normalizeInterval(config.interval),
      handlers: {
        ...defaultHandlers,
        ...config.handlers,
      },
    };

    Logger.info({
      message: "Watcher initialized",
      context: this.ERROR_CONTEXT,
      data: {
        id: this.id,
        name: this.name,
        interval: this.interval,
      },
    });
  }

  /**
   * 验证配置参数
   * @throws {Error} 当配置无效时抛出错误
   */
  private validateConfig(config: WatcherConfig): void {
    if (!config.id) {
      throw new Error("Watcher ID is required");
    }
    if (!config.name) {
      throw new Error("Watcher name is required");
    }
    if (
      config.interval &&
      (typeof config.interval !== "number" ||
        config.interval < this.MIN_INTERVAL ||
        config.interval > this.MAX_INTERVAL)
    ) {
      throw new Error(
        `Invalid interval: must be between ${this.MIN_INTERVAL} and ${this.MAX_INTERVAL}`,
      );
    }
  }

  /**
   * 规范化轮询间隔
   */
  private normalizeInterval(interval?: number): number {
    if (!interval) return this.DEFAULT_INTERVAL;
    return Math.min(Math.max(interval, this.MIN_INTERVAL), this.MAX_INTERVAL);
  }

  public get id(): string {
    return this.config.id;
  }

  public get name(): string {
    return this.config.name;
  }

  public get interval(): number {
    return this.config.interval;
  }

  /**
   * 获取 Zotero 窗口对象，用于计时器等功能
   * @returns Zotero 主窗口对象或 null
   */
  private getZoteroWindow(): Window | null {
    // 尝试不同的方法获取 window 对象
    if (typeof Zotero.getMainWindow === "function") {
      return Zotero.getMainWindow();
    } else if (typeof Zotero.getActiveZoteroPane === "function") {
      const pane = Zotero.getActiveZoteroPane();
      return pane ? pane.ownerDocument.defaultView : null;
    }

    // 如果上述方法都失败，返回 null
    return null;
  }

  /**
   * 启动观察器并开始状态监控
   */
  public start(): void {
    if (this.timer) {
      this.stop();
    }

    const createCheckTask = () => ({
      id: `check-${this.id}-${Date.now()}`,
      priority: TaskPriority.High,
      onProgress: (progress: TaskProgress) => {
        Logger.debug({
          message: "Check progress",
          context: this.ERROR_CONTEXT,
          data: { id: this.id, progress },
        });
      },
      onError: (error: Error) => {
        Logger.error({
          message: "Check task failed",
          context: this.ERROR_CONTEXT,
          error,
          data: { id: this.id },
        });
      },
    });

    // 获取 Zotero 窗口对象
    const win = this.getZoteroWindow();

    if (win) {
      this.timer = win.setInterval(() => {
        const checkTask = createCheckTask();
        this.checkTaskId = checkTask.id;

        this.taskQueue
          .enqueue(async () => this.check(), checkTask)
          .catch((error) => {
            Logger.error({
              message: "Failed to enqueue check task",
              context: this.ERROR_CONTEXT,
              error: error as Error,
              data: { id: this.id },
            });
          });
      }, this.interval) as unknown as number;
    } else {
      // 如果无法获取窗口对象，记录警告日志
      Logger.warn({
        message: "Cannot get window object for setInterval in Watcher.start",
        context: this.ERROR_CONTEXT,
        data: { id: this.id },
      });

      // 立即执行一次检查，但不设置定时器
      const checkTask = createCheckTask();
      this.checkTaskId = checkTask.id;

      this.taskQueue
        .enqueue(async () => this.check(), checkTask)
        .catch((error) => {
          Logger.error({
            message: "Failed to enqueue initial check task",
            context: this.ERROR_CONTEXT,
            error: error as Error,
            data: { id: this.id },
          });
        });
    }

    Logger.info({
      message: "Watcher started",
      context: this.ERROR_CONTEXT,
      data: { id: this.id },
    });
  }

  /**
   * 停止观察器并清理任务
   */
  public stop(): void {
    if (this.timer) {
      // 获取 Zotero 窗口对象
      const win = this.getZoteroWindow();

      if (win) {
        win.clearInterval(this.timer);
      } else {
        // 无法获取窗口对象，记录警告
        Logger.warn({
          message: "Cannot get window object for clearInterval in Watcher.stop",
          context: this.ERROR_CONTEXT,
          data: { id: this.id },
        });
      }

      this.timer = undefined;

      if (this.checkTaskId) {
        this.taskQueue.cancelTask(this.checkTaskId);
        this.checkTaskId = undefined;
      }

      Logger.info({
        message: "Watcher stopped",
        context: this.ERROR_CONTEXT,
        data: { id: this.id },
      });
    }
  }

  /**
   * 销毁观察器并清理所有资源
   */
  public dispose(): void {
    this.stop();
    this.taskQueue.clear();
    this.lastStatus = undefined;
    this.lastTask = undefined;
    this.lastError = undefined;
  }

  /**
   * 检查知识库状态和任务
   * @emits statusChanged 当状态发生变化时
   * @emits taskUpdated 当任务状态更新时
   */
  private async check(): Promise<void> {
    const statusTask = {
      id: `status-${this.id}-${Date.now()}`,
      priority: TaskPriority.High,
      onProgress: (progress: TaskProgress) => {
        Logger.debug({
          message: "Status check progress",
          context: this.ERROR_CONTEXT,
          data: { id: this.id, progress },
        });
      },
    };

    try {
      await this.taskQueue.enqueue(async () => this.checkStatus(), statusTask);

      const taskCheckTask = {
        id: `task-${this.id}-${Date.now()}`,
        priority: TaskPriority.Low,
        onProgress: (progress: TaskProgress) => {
          Logger.debug({
            message: "Task check progress",
            context: this.ERROR_CONTEXT,
            data: { id: this.id, progress },
          });
        },
      };

      await this.taskQueue.enqueue(
        async () => this.checkTasks(),
        taskCheckTask,
      );
    } catch (error) {
      await this.handleError(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * 检查和更新知识库状态
   * @throws {Error} 当状态检查失败时
   */
  private async checkStatus(): Promise<void> {
    try {
      const status: KnowledgeBaseStatus = {
        id: this.id,
        name: this.name,
        status: KBStatus.Ready,
        timestamp: Date.now(),
      };

      if (this.isStatusChanged(status)) {
        Logger.info({
          message: "Knowledge base status changed",
          context: this.ERROR_CONTEXT,
          data: {
            id: this.id,
            from: this.lastStatus?.status,
            to: status.status,
            timestamp: status.timestamp,
          },
        });
      }

      this.lastStatus = status;
      this.resetErrorState();

      this.emit({
        type: "status",
        id: this.id,
        status,
      });
    } catch (error) {
      throw new Error(
        `Status check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 检查知识库任务执行状态
   * @throws {Error} 当任务检查失败时
   */
  private async checkTasks(): Promise<void> {
    try {
      const task: KnowledgeBaseTask = {
        id: crypto.randomUUID(),
        type: "general",
        status: "processing",
        progress: 50,
        total: 100,
      };

      if (this.isTaskChanged(task)) {
        Logger.info({
          message: "Knowledge base task updated",
          context: this.ERROR_CONTEXT,
          data: {
            id: this.id,
            taskId: task.id,
            status: task.status,
            progress: `${task.progress}/${task.total}`,
          },
        });

        this.lastTask = task;
        this.emit({
          type: "task",
          id: this.id,
          task,
        });
      }
    } catch (error) {
      throw new Error(
        `Task check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Task Queue 管理方法

  /**
   * 暂停指定任务
   * @param taskId 任务ID
   * @returns 是否成功暂停
   */
  public pauseTask(taskId: string): boolean {
    return this.taskQueue.pauseTask(taskId);
  }

  /**
   * 恢复指定任务
   * @param taskId 任务ID
   * @returns 是否成功恢复
   */
  public resumeTask(taskId: string): boolean {
    return this.taskQueue.resumeTask(taskId);
  }

  /**
   * 取消指定任务
   * @param taskId 任务ID
   * @returns 是否成功取消
   */
  public cancelTask(taskId: string): boolean {
    return this.taskQueue.cancelTask(taskId);
  }

  /**
   * 获取任务详细信息
   */
  public getTaskInfo(taskId: string) {
    return this.taskQueue.getTaskInfo(taskId);
  }

  /**
   * 获取任务进度信息
   */
  public getTaskProgress(taskId: string): TaskProgress | undefined {
    return this.taskQueue.getTaskProgress(taskId);
  }

  /**
   * 获取任务当前状态
   */
  public getTaskStatus(taskId: string): TaskStatus | undefined {
    return this.taskQueue.getTaskStatus(taskId);
  }

  /**
   * 获取当前运行中的任务数量
   */
  public getRunningTaskCount(): number {
    return this.taskQueue.runningTaskCount;
  }

  // 工具方法

  /**
   * 检查状态是否发生变化
   */
  private isStatusChanged(newStatus: KnowledgeBaseStatus): boolean {
    if (!this.lastStatus) return true;
    return this.lastStatus.status !== newStatus.status;
  }

  /**
   * 检查任务是否发生变化
   */
  private isTaskChanged(newTask: KnowledgeBaseTask): boolean {
    if (!this.lastTask) return true;
    return (
      this.lastTask.id !== newTask.id ||
      this.lastTask.status !== newTask.status ||
      this.lastTask.progress !== newTask.progress
    );
  }

  /**
   * 获取最后一个任务信息
   */
  public getLastTask(): KnowledgeBaseTask | undefined {
    return this.lastTask;
  }

  /**
   * 处理错误并进行重试
   */
  private async handleError(error: Error): Promise<void> {
    this.errorCount++;
    this.lastError = error;

    Logger.error({
      message: `Watcher check failed (attempt ${this.errorCount}/${this.maxRetries})`,
      context: this.ERROR_CONTEXT,
      error,
      data: {
        id: this.id,
        errorCount: this.errorCount,
        errorCode: (error as any).code || ApiErrorCode.SystemError,
      },
    });

    this.emit({
      type: "error",
      id: this.id,
      error,
    });

    if (this.errorCount < this.maxRetries) {
      // 获取Zotero窗口对象
      const win = this.getZoteroWindow();

      // 使用Promise进行延迟
      await new Promise((resolve) => {
        if (win) {
          win.setTimeout(resolve, this.retryDelay * this.errorCount);
        } else {
          // 如果无法获取窗口对象，立即解析Promise
          Logger.warn({
            message: "Cannot get window object for setTimeout in handleError",
            context: this.ERROR_CONTEXT,
            data: { id: this.id },
          });
          resolve(undefined);
        }
      });

      await this.check();
    } else {
      Logger.error({
        message: "Maximum retry attempts reached",
        context: this.ERROR_CONTEXT,
        data: {
          id: this.id,
          maxRetries: this.maxRetries,
          lastError: error.message,
        },
      });
    }
  }

  /**
   * 重置错误计数器
   */
  private resetErrorState(): void {
    if (this.errorCount > 0) {
      this.errorCount = 0;
      this.lastError = undefined;
      Logger.info({
        message: "Watcher recovered from error state",
        context: this.ERROR_CONTEXT,
        data: { id: this.id },
      });
    }
  }

  /**
   * 获取最后一次错误
   */
  public getLastError(): Error | undefined {
    return this.lastError;
  }

  /**
   * 获取最后一次状态
   */
  public getLastStatus(): KnowledgeBaseStatus | undefined {
    return this.lastStatus;
  }

  /**
   * 发送事件
   */
  private emit(event: WatcherEvent): void {
    try {
      switch (event.type) {
        case "status":
          this.config.handlers.onStatusChanged(event.id, event.status);
          break;
        case "task":
          this.config.handlers.onTaskUpdated(event.id, event.task);
          break;
        case "error":
          this.config.handlers.onError(event.id, event.error);
          break;
      }
    } catch (error) {
      Logger.error({
        message: "Failed to emit watcher event",
        context: this.ERROR_CONTEXT,
        error: error instanceof Error ? error : new Error(String(error)),
        data: { id: this.id, event },
      });
    }
  }

  /**
   * 检查观察器是否运行中
   */
  public isRunning(): boolean {
    return this.timer !== undefined;
  }
}
