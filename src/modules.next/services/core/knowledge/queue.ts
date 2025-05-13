﻿﻿﻿﻿﻿import { Logger } from "../../../services/logger";
import { ApiErrorCode } from "../../../services/types/common";

/** 任务优先级 */
export enum TaskPriority {
  High = 0,
  Normal = 1,
  Low = 2
}

/** 任务状态 */
export enum TaskStatus {
  Pending = "pending",
  Running = "running",
  Completed = "completed",
  Failed = "failed",
  Paused = "paused",
  Cancelled = "cancelled"
}

/** 任务进度信息 */
export interface TaskProgress {
  current: number;
  total: number;
  percent: number;
  message?: string;
}

/** 任务配置 */
export interface TaskConfig {
  id: string;
  priority: TaskPriority;
  maxRetries?: number;
  onProgress?: (progress: TaskProgress) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: TaskStatus) => void;
}

/** 任务项 */
interface TaskItem {
  id: string;
  task: () => Promise<void>;
  config: TaskConfig;
  status: TaskStatus;
  retryCount: number;
  error?: Error;
  progress?: TaskProgress;
  startTime?: number;
  endTime?: number;
  pauseTime?: number;
}

export class TaskQueue {
  private queue: TaskItem[] = [];
  private isProcessing = false;
  private readonly ERROR_CONTEXT = "TaskQueue";
  private readonly DEFAULT_MAX_RETRIES = 3;
  private readonly MAX_CONCURRENT_TASKS = 3;
  private runningTasks = 0;

  /**
   * 添加任务到队列
   */
  public async enqueue(
    task: () => Promise<void>,
    config: TaskConfig
  ): Promise<void> {
    const taskItem: TaskItem = {
      id: config.id,
      task,
      config,
      status: TaskStatus.Pending,
      retryCount: 0
    };

    // 根据优先级插入队列
    const insertIndex = this.queue.findIndex(item => 
      item.config.priority > config.priority
    );
    
    if (insertIndex === -1) {
      this.queue.push(taskItem);
    } else {
      this.queue.splice(insertIndex, 0, taskItem);
    }

    Logger.info({
      message: "Task enqueued",
      context: this.ERROR_CONTEXT,
      data: { 
        taskId: config.id,
        priority: TaskPriority[config.priority],
        queueLength: this.queue.length
      }
    });
    
    if (!this.isProcessing) {
      await this.processQueue();
    }
  }

  /**
   * 处理任务队列
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.queue.length > 0 && this.runningTasks < this.MAX_CONCURRENT_TASKS) {
        const taskItem = this.queue[0];
        if (taskItem.status === TaskStatus.Pending) {
          await this.executeTask(taskItem);
        }
      }
    } finally {
      this.isProcessing = false;
      this.checkAndContinueProcessing();
    }
  }

  /**
   * 执行单个任务
   */
  /**
   * 更新任务状态并通知
   */
  private updateTaskStatus(taskItem: TaskItem, status: TaskStatus): void {
    const oldStatus = taskItem.status;
    taskItem.status = status;

    if (oldStatus !== status) {
      taskItem.config.onStatusChange?.(status);
      Logger.info({
        message: "Task status changed",
        context: this.ERROR_CONTEXT,
        data: { 
          taskId: taskItem.id,
          from: oldStatus,
          to: status
        }
      });
    }
  }

  /**
   * 更新任务进度
   */
  private updateTaskProgress(taskItem: TaskItem, progress: TaskProgress): void {
    taskItem.progress = progress;
    taskItem.config.onProgress?.(progress);
  }

  /**
   * 执行单个任务
   */
  private async executeTask(taskItem: TaskItem): Promise<void> {
    this.runningTasks++;
    taskItem.startTime = Date.now();
    this.updateTaskStatus(taskItem, TaskStatus.Running);

    try {
      await taskItem.task();
      taskItem.endTime = Date.now();
      this.updateTaskStatus(taskItem, TaskStatus.Completed);
      taskItem.config.onComplete?.();

      // 更新最终进度
      this.updateTaskProgress(taskItem, {
        current: 100,
        total: 100,
        percent: 100,
        message: "任务完成"
      });

      Logger.info({
        message: "Task completed successfully",
        context: this.ERROR_CONTEXT,
        data: { 
          taskId: taskItem.id,
          duration: taskItem.endTime - taskItem.startTime
        }
      });
    } catch (error) {
      taskItem.error = error instanceof Error ? error : new Error(String(error));
      await this.handleTaskError(taskItem);
    } finally {
      this.runningTasks--;
      this.queue = this.queue.filter(item => item.id !== taskItem.id);
      this.checkAndContinueProcessing();
    }
  }

  /**
   * 处理任务错误
   */
  private async handleTaskError(taskItem: TaskItem): Promise<void> {
    taskItem.retryCount++;
    const maxRetries = taskItem.config.maxRetries ?? this.DEFAULT_MAX_RETRIES;

    Logger.error({
      message: `Task execution failed (attempt ${taskItem.retryCount}/${maxRetries})`,
      context: this.ERROR_CONTEXT,
      error: taskItem.error,
      data: { 
        taskId: taskItem.id,
        retryCount: taskItem.retryCount,
        errorCode: (taskItem.error as any).code || ApiErrorCode.SystemError
      }
    });

    if (taskItem.retryCount < maxRetries) {
      taskItem.status = TaskStatus.Pending;
      // 将任务移到队列末尾等待重试
      this.queue = this.queue.filter(item => item.id !== taskItem.id);
      this.queue.push(taskItem);
    } else {
      taskItem.status = TaskStatus.Failed;
      taskItem.config.onError?.(taskItem.error!);
    }
  }

  /**
   * 检查并继续处理队列
   */
  private checkAndContinueProcessing(): void {
    if (this.queue.length > 0 && !this.isProcessing) {
      this.processQueue().catch(error => {
        Logger.error({
          message: "Failed to process queue",
          context: this.ERROR_CONTEXT,
          error: error instanceof Error ? error : new Error(String(error))
        });
      });
    }
  }

  /**
   * 清空任务队列
   */
  public clear(): void {
    this.queue.forEach(item => {
      if (item.status === TaskStatus.Pending) {
        item.config.onError?.(new Error("Task cancelled"));
      }
    });
    this.queue = [];
    Logger.info({
      message: "Task queue cleared",
      context: this.ERROR_CONTEXT
    });
  }

  /**
   * 获取队列长度
   */
  public get length(): number {
    return this.queue.length;
  }

  /**
   * 检查是否正在处理任务
   */
  public get processing(): boolean {
    return this.isProcessing;
  }

  /**
   * 获取当前运行任务数量
   */
  public get runningTaskCount(): number {
    return this.runningTasks;
  }

  /**
   * 获取任务状态
   */
  public getTaskStatus(taskId: string): TaskStatus | undefined {
    const task = this.queue.find(item => item.id === taskId);
    return task?.status;
  }

  /**
   * 暂停任务
   */
  public pauseTask(taskId: string): boolean {
    const task = this.queue.find(item => item.id === taskId);
    if (task && task.status === TaskStatus.Running) {
      task.pauseTime = Date.now();
      this.updateTaskStatus(task, TaskStatus.Paused);
      return true;
    }
    return false;
  }

  /**
   * 恢复任务
   */
  public resumeTask(taskId: string): boolean {
    const task = this.queue.find(item => item.id === taskId);
    if (task && task.status === TaskStatus.Paused) {
      task.pauseTime = undefined;
      this.updateTaskStatus(task, TaskStatus.Pending);
      this.checkAndContinueProcessing();
      return true;
    }
    return false;
  }

  /**
   * 取消任务
   */
  public cancelTask(taskId: string): boolean {
    const task = this.queue.find(item => item.id === taskId);
    if (task && [TaskStatus.Pending, TaskStatus.Paused].includes(task.status)) {
      this.updateTaskStatus(task, TaskStatus.Cancelled);
      this.queue = this.queue.filter(item => item.id !== taskId);
      task.config.onError?.(new Error("Task cancelled by user"));
      return true;
    }
    return false;
  }

  /**
   * 获取任务进度
   */
  public getTaskProgress(taskId: string): TaskProgress | undefined {
    const task = this.queue.find(item => item.id === taskId);
    return task?.progress;
  }

  /**
   * 获取任务执行时长（毫秒）
   */
  public getTaskDuration(taskId: string): number | undefined {
    const task = this.queue.find(item => item.id === taskId);
    if (!task || !task.startTime) return undefined;
    
    if (task.endTime) {
      return task.endTime - task.startTime;
    }
    
    if (task.pauseTime) {
      return task.pauseTime - task.startTime;
    }
    
    return Date.now() - task.startTime;
  }

  /**
   * 获取任务错误信息
   */
  public getTaskError(taskId: string): Error | undefined {
    const task = this.queue.find(item => item.id === taskId);
    return task?.error;
  }

  /**
   * 获取任务详细信息
   */
  public getTaskInfo(taskId: string): {
    status: TaskStatus;
    progress?: TaskProgress;
    duration?: number;
    error?: Error;
    retryCount: number;
  } | undefined {
    const task = this.queue.find(item => item.id === taskId);
    if (!task) return undefined;

    return {
      status: task.status,
      progress: task.progress,
      duration: this.getTaskDuration(taskId),
      error: task.error,
      retryCount: task.retryCount
    };
  }
}
