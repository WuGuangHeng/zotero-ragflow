﻿import { Logger } from "../../../services/logger";
import { ragflow } from "../../../services/ragflow";
import {
  KnowledgeBaseStatusType,
  KnowledgeBaseStatus as KBStatus,
} from "../../../services/types/common";
import { EventEmitter, KnowledgeBaseEvent } from "./events";
import { TaskQueue, TaskPriority, TaskStatus, TaskProgress } from "./queue";
import { KnowledgeBaseStatus, WatcherConfig } from "./types";
import { Watcher } from "./watcher";
import { ApiErrorCode } from "../../../services/types/common";
import {
  SyncManager,
  SyncConfig,
  SyncStatus,
  SyncEvent,
  syncManager,
  collectionWatcher,
  SyncExecutor,
} from "./sync";

export class KnowledgeBaseManager {
  private static instance: KnowledgeBaseManager;
  private watchers: Map<string, Watcher> = new Map();
  private taskQueue: TaskQueue;
  private taskProgressHandlers: Map<string, (progress: TaskProgress) => void> =
    new Map();
  private statusCache: Map<string, KnowledgeBaseStatus> = new Map();
  private eventEmitter: EventEmitter;
  private pollingInterval: number = 5000;
  private pollingTimer?: number;
  private readonly ERROR_CONTEXT = "KnowledgeBaseManager";
  private maxRetries: number = 3;
  private retryDelay: number = 1000;
  private errorCountMap: Map<string, number> = new Map();

  // 新增的同步管理相关属性
  private syncManager: SyncManager;
  private syncExecutor: SyncExecutor;
  private syncConfigs: Map<string, SyncConfig> = new Map();
  private syncStatuses: Map<string, SyncStatus> = new Map();

  /** 状态转换事件工厂 */
  private readonly StatusTransitions = {
    toReady: (id: string): KnowledgeBaseEvent => ({ type: "toReady", id }),
    toProcessing: (id: string): KnowledgeBaseEvent => ({
      type: "toProcessing",
      id,
    }),
    toError: (id: string, error?: Error): KnowledgeBaseEvent => ({
      type: "toError",
      id,
      error,
    }),
    toNone: (id: string): KnowledgeBaseEvent => ({ type: "toNone", id }),
  };

  private constructor() {
    this.taskQueue = new TaskQueue();
    this.eventEmitter = new EventEmitter();

    // 初始化同步管理器
    this.syncManager = syncManager;
    this.syncExecutor = new SyncExecutor();

    // 注册同步事件监听
    this.setupSyncEventListeners();

    this.startPolling();
  }

  /**
   * 设置同步事件监听
   */
  private setupSyncEventListeners(): void {
    // 监听同步开始事件
    this.syncManager.on("syncStarted", (event) => {
      Logger.info({
        message: "Sync started",
        context: this.ERROR_CONTEXT,
        data: { collectionId: event.collectionId },
      });
    });

    // 监听同步完成事件
    this.syncManager.on(
      "syncCompleted",
      (event: { type: "syncCompleted"; collectionId: string; stats: any }) => {
        Logger.info({
          message: "Sync completed",
          context: this.ERROR_CONTEXT,
          data: {
            collectionId: event.collectionId,
            stats: event.stats,
          },
        });

        // 同步完成后更新知识库状态
        this.updateKnowledgeBaseStatus(event.collectionId);
      },
    );

    // 监听同步错误事件
    this.syncManager.on(
      "syncError",
      (event: { type: "syncError"; collectionId: string; error: Error }) => {
        Logger.error({
          message: "Sync error",
          context: this.ERROR_CONTEXT,
          error: event.error,
          data: { collectionId: event.collectionId },
        });

        // 触发错误处理
        this.handleError(event.collectionId, event.error);
      },
    );

    // 监听同步进度事件
    this.syncManager.on(
      "syncProgress",
      (event: {
        type: "syncProgress";
        collectionId: string;
        progress: TaskProgress;
      }) => {
        // 将同步进度传递给任务进度处理器
        const handler = this.taskProgressHandlers.get(
          `sync-${event.collectionId}`,
        );
        if (handler) {
          handler(event.progress);
        }
      },
    );
  }

  public static getInstance(): KnowledgeBaseManager {
    if (!KnowledgeBaseManager.instance) {
      KnowledgeBaseManager.instance = new KnowledgeBaseManager();
    }
    return KnowledgeBaseManager.instance;
  }

  /**
   * 设置状态轮询间隔
   * @param interval 轮询间隔（毫秒），最小5000ms
   */
  public setPollingInterval(interval: number): void {
    if (interval < 5000) {
      interval = 5000; // 设置最小限制
    }

    this.pollingInterval = interval;
    Logger.info({
      message: `Polling interval updated to ${interval}ms`,
      context: this.ERROR_CONTEXT,
    });

    // 重启轮询以应用新间隔
    this.startPolling();
  }

  /**
   * 启动轮询检查知识库状态
   */
  private startPolling(): void {
    this.stopPolling();

    this.pollingTimer = setInterval(async () => {
      try {
        await this.updateAllStatus();
      } catch (error) {
        Logger.error({
          message: "Failed to update knowledge base status",
          context: this.ERROR_CONTEXT,
          error: error as Error,
          data: {
            errorCode:
              (error instanceof Error && (error as any).code) ||
              ApiErrorCode.SystemError,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          },
        });
      }
    }, this.pollingInterval) as unknown as number;
  }

  /**
   * 停止轮询
   */
  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = undefined;
    }
  }

  /**
   * 添加知识库观察器
   * @param config 观察器配置
   */
  public addWatcher(config: WatcherConfig): void {
    if (this.watchers.has(config.id)) {
      Logger.warn({
        message: "Watcher already exists",
        context: this.ERROR_CONTEXT,
        data: { id: config.id },
      });
      return;
    }

    const watcher = new Watcher(config);
    this.watchers.set(config.id, watcher);
    watcher.start();

    Logger.info({
      message: "Watcher added successfully",
      context: this.ERROR_CONTEXT,
      data: { id: config.id, action: "addWatcher" },
    });
  }

  /**
   * 添加同步配置
   * @param config 同步配置
   */
  public addSyncConfig(config: SyncConfig): void {
    this.syncManager.addConfig(config);
    this.syncConfigs.set(config.collectionId, config);

    Logger.info({
      message: "Sync config added",
      context: this.ERROR_CONTEXT,
      data: {
        collectionId: config.collectionId,
        datasetId: config.datasetId,
        autoSync: config.autoSync,
      },
    });

    // 添加任务进度处理器
    this.addProgressHandler(`sync-${config.collectionId}`, (progress) => {
      Logger.info({
        message: "Sync progress",
        context: this.ERROR_CONTEXT,
        data: { collectionId: config.collectionId, progress },
      });
    });
  }

  /**
   * 移除同步配置
   * @param collectionId 集合ID
   */
  public removeSyncConfig(collectionId: string): void {
    this.syncManager.removeConfig(collectionId);
    this.syncConfigs.delete(collectionId);
    this.removeProgressHandler(`sync-${collectionId}`);

    Logger.info({
      message: "Sync config removed",
      context: this.ERROR_CONTEXT,
      data: { collectionId },
    });
  }

  /**
   * 获取同步配置
   * @param collectionId 集合ID
   */
  public getSyncConfig(collectionId: string): SyncConfig | undefined {
    return this.syncConfigs.get(collectionId);
  }

  /**
   * 获取同步状态
   * @param collectionId 集合ID
   */
  public getSyncStatus(collectionId: string): SyncStatus | undefined {
    return this.syncManager.getStatus(collectionId);
  }

  /**
   * 移除知识库观察器
   * @param id 知识库ID
   */
  public removeWatcher(id: string): void {
    const watcher = this.watchers.get(id);
    if (watcher) {
      watcher.stop();
      this.watchers.delete(id);

      Logger.info({
        message: "Watcher removed successfully",
        context: this.ERROR_CONTEXT,
        data: { id, action: "removeWatcher" },
      });
    }
  }

  /**
   * 获取知识库观察器
   */
  public getWatcher(id: string): Watcher | undefined {
    return this.watchers.get(id);
  }

  /**
   * 获取知识库状态
   * @param id 知识库ID
   * @returns 知识库状态信息
   * @throws {Error} 当获取状态失败时抛出错误
   */
  public async getStatus(id: string): Promise<KnowledgeBaseStatus> {
    try {
      const status = await ragflow.getKnowledgeBaseStatus(id);
      const currentStatus: KnowledgeBaseStatus = {
        id,
        status,
        timestamp: Date.now(),
      };

      this.statusCache.set(id, currentStatus);
      return currentStatus;
    } catch (error) {
      Logger.error({
        message: "Failed to get knowledge base status",
        context: this.ERROR_CONTEXT,
        error: error as Error,
        data: { id },
      });

      // 如果请求失败，返回缓存的状态，如果没有缓存则返回 none 状态
      return (
        this.statusCache.get(id) || {
          id,
          status: KBStatus.None,
          timestamp: Date.now(),
        }
      );
    }
  }

  /**
   * 更新所有知识库状态
   */
  private async updateAllStatus(): Promise<void> {
    // 创建批量状态更新任务
    const batchTask = {
      id: `status-update-${Date.now()}`,
      priority: TaskPriority.High,
      onProgress: (progress: TaskProgress) => {
        Logger.info({
          message: "Batch status update progress",
          context: this.ERROR_CONTEXT,
          data: { progress },
        });
      },
      onError: (error: Error) => {
        Logger.error({
          message: "Batch status update failed",
          context: this.ERROR_CONTEXT,
          error,
          data: { taskId: batchTask.id },
        });
      },
    };

    await this.taskQueue.enqueue(async () => {
      const watchers = Array.from(this.watchers.values());
      const total = watchers.length;
      let processed = 0;

      for (const watcher of watchers) {
        try {
          const status = await this.getStatus(watcher.id);
          const previousStatus = this.statusCache.get(watcher.id);

          // 处理状态转换
          if (previousStatus?.status !== status.status) {
            // 重置错误计数
            if (status.status === KBStatus.Ready) {
              this.errorCountMap.delete(watcher.id);
            }

            // 触发相应的状态转换事件
            switch (status.status) {
              case KBStatus.Ready:
                this.eventEmitter.emit(
                  "statusChanged",
                  this.StatusTransitions.toReady(watcher.id),
                );
                break;
              case KBStatus.Processing:
                this.eventEmitter.emit(
                  "statusChanged",
                  this.StatusTransitions.toProcessing(watcher.id),
                );
                break;
              case KBStatus.Error:
                this.handleError(
                  watcher.id,
                  new Error("Knowledge base entered error state"),
                );
                break;
              case KBStatus.None:
                this.eventEmitter.emit(
                  "statusChanged",
                  this.StatusTransitions.toNone(watcher.id),
                );
                break;
            }
          }

          this.statusCache.set(watcher.id, status);
          processed++;

          // 更新进度
          const progress: TaskProgress = {
            current: processed,
            total,
            percent: Math.round((processed / total) * 100),
            message: `已更新 ${processed}/${total} 个知识库状态`,
          };
          batchTask.onProgress(progress);
        } catch (error) {
          Logger.error({
            message: "Failed to update knowledge base status",
            context: this.ERROR_CONTEXT,
            error: error as Error,
            data: { id: watcher.id },
          });
        }
      }
    }, batchTask);
  }

  /**
   * 监听状态变化事件
   * @param callback 状态变更回调函数，接收 KnowledgeBaseEvent 类型的事件对象
   */
  public onStatusChanged(callback: (event: KnowledgeBaseEvent) => void): void {
    this.eventEmitter.on<KnowledgeBaseEvent>("statusChanged", callback);
  }

  /**
   * 移除状态变化事件监听
   * @param callback 需要移除的回调函数
   */
  public offStatusChanged(callback: (event: KnowledgeBaseEvent) => void): void {
    this.eventEmitter.off<KnowledgeBaseEvent>("statusChanged", callback);
  }

  /**
   * 处理错误并进行重试
   * @param id 知识库ID
   * @param error 错误对象
   */
  private async handleError(id: string, error: Error): Promise<void> {
    const errorCount = (this.errorCountMap.get(id) || 0) + 1;
    this.errorCountMap.set(id, errorCount);

    Logger.error({
      message: `Knowledge base error (attempt ${errorCount}/${this.maxRetries})`,
      context: this.ERROR_CONTEXT,
      error,
      data: {
        id,
        errorCount,
        errorCode: (error as any).code || ApiErrorCode.SystemError,
      },
    });

    // 触发错误事件
    this.eventEmitter.emit(
      "statusChanged",
      this.StatusTransitions.toError(id, error),
    );

    // 如果未超过最大重试次数，尝试重试
    if (errorCount < this.maxRetries) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.retryDelay * errorCount),
      );
      await this.updateAllStatus();
    } else {
      Logger.error({
        message: "Maximum retry attempts reached",
        context: this.ERROR_CONTEXT,
        data: {
          id,
          maxRetries: this.maxRetries,
          lastError: error.message,
        },
      });
    }
  }

  /**
   * 检查知识库是否就绪
   * @param id 知识库ID
   * @returns 是否处于就绪状态
   */
  public isReady(id: string): boolean {
    const status = this.statusCache.get(id);
    return status?.status === KBStatus.Ready;
  }

  /**
   * 判断知识库是否处理中
   * @param id 知识库ID
   * @returns 是否处于处理中状态
   */
  public isProcessing(id: string): boolean {
    const status = this.statusCache.get(id);
    return status?.status === KBStatus.Processing;
  }

  /**
   * 获取错误状态的知识库列表
   * @returns 处于错误状态的知识库ID列表
   */
  public getErrorKnowledgeBases(): string[] {
    return Array.from(this.statusCache.entries())
      .filter(([_, status]) => status.status === KBStatus.Error)
      .map(([id]) => id);
  }

  /**
   * 手动触发同步
   * @param collectionId 集合ID
   * @param options 同步选项
   */
  public async manualSync(
    collectionId: string,
    options?: {
      force?: boolean;
      priority?: TaskPriority;
      batchSize?: number;
    },
  ): Promise<void> {
    try {
      await this.syncManager.manualSync(collectionId, options);

      Logger.info({
        message: "Manual sync started",
        context: this.ERROR_CONTEXT,
        data: { collectionId, options },
      });
    } catch (error) {
      Logger.error({
        message: "Failed to start manual sync",
        context: this.ERROR_CONTEXT,
        error: error instanceof Error ? error : new Error(String(error)),
        data: { collectionId },
      });
      throw error;
    }
  }

  /**
   * 暂停同步
   * @param collectionId 集合ID
   */
  public pauseSync(collectionId: string): void {
    this.syncManager.pauseSync(collectionId);

    Logger.info({
      message: "Sync paused",
      context: this.ERROR_CONTEXT,
      data: { collectionId },
    });
  }

  /**
   * 恢复同步
   * @param collectionId 集合ID
   */
  public resumeSync(collectionId: string): void {
    this.syncManager.resumeSync(collectionId);

    Logger.info({
      message: "Sync resumed",
      context: this.ERROR_CONTEXT,
      data: { collectionId },
    });
  }

  /**
   * 取消同步
   * @param collectionId 集合ID
   */
  public cancelSync(collectionId: string): void {
    this.syncManager.cancelSync(collectionId);

    Logger.info({
      message: "Sync cancelled",
      context: this.ERROR_CONTEXT,
      data: { collectionId },
    });
  }

  /**
   * 更新知识库状态
   * 当同步完成后调用，以确保状态信息最新
   */
  private async updateKnowledgeBaseStatus(collectionId: string): Promise<void> {
    const config = this.syncConfigs.get(collectionId);
    if (!config || !config.datasetId) return;

    try {
      // 强制更新知识库状态
      const status = await this.getStatus(config.datasetId);

      Logger.info({
        message: "Knowledge base status updated after sync",
        context: this.ERROR_CONTEXT,
        data: {
          collectionId,
          datasetId: config.datasetId,
          status: status.status,
        },
      });
    } catch (error) {
      Logger.error({
        message: "Failed to update knowledge base status after sync",
        context: this.ERROR_CONTEXT,
        error: error instanceof Error ? error : new Error(String(error)),
        data: {
          collectionId,
          datasetId: config.datasetId,
        },
      });
    }
  }

  /**
   * 任务队列相关方法
   */
  public getTaskProgress(taskId: string): TaskProgress | undefined {
    return this.taskQueue.getTaskProgress(taskId);
  }

  public getTaskStatus(taskId: string): TaskStatus | undefined {
    return this.taskQueue.getTaskStatus(taskId);
  }

  public pauseTask(taskId: string): boolean {
    return this.taskQueue.pauseTask(taskId);
  }

  public resumeTask(taskId: string): boolean {
    return this.taskQueue.resumeTask(taskId);
  }

  public cancelTask(taskId: string): boolean {
    return this.taskQueue.cancelTask(taskId);
  }

  public getTaskInfo(taskId: string) {
    return this.taskQueue.getTaskInfo(taskId);
  }

  /**
   * 获取所有运行中的任务数量
   */
  public getRunningTasks(): number {
    return this.taskQueue.runningTaskCount;
  }

  /**
   * 添加任务进度处理器
   */
  public addProgressHandler(
    taskId: string,
    handler: (progress: TaskProgress) => void,
  ): void {
    this.taskProgressHandlers.set(taskId, handler);
  }

  /**
   * 移除任务进度处理器
   */
  public removeProgressHandler(taskId: string): void {
    this.taskProgressHandlers.delete(taskId);
  }

  /**
   * 批量任务处理
   * @param tasks 任务列表
   * @param priority 任务优先级
   */
  public async processBatchTasks(
    tasks: Array<{ id: string; task: () => Promise<void> }>,
    priority: TaskPriority = TaskPriority.Normal,
  ): Promise<void> {
    const batchId = `batch-${Date.now()}`;
    const total = tasks.length;
    let processed = 0;

    const batchConfig = {
      id: batchId,
      priority,
      onProgress: (progress: TaskProgress) => {
        Logger.info({
          message: "Batch task progress",
          context: this.ERROR_CONTEXT,
          data: { batchId, progress },
        });
      },
      onError: (error: Error) => {
        Logger.error({
          message: "Batch task failed",
          context: this.ERROR_CONTEXT,
          error,
          data: { batchId },
        });
      },
    };

    await this.taskQueue.enqueue(async () => {
      for (const { id, task } of tasks) {
        try {
          await task();
          processed++;

          const progress: TaskProgress = {
            current: processed,
            total,
            percent: Math.round((processed / total) * 100),
            message: `已处理 ${processed}/${total} 个任务`,
          };
          batchConfig.onProgress(progress);
        } catch (error) {
          Logger.error({
            message: "Task failed in batch",
            context: this.ERROR_CONTEXT,
            error: error as Error,
            data: { batchId, taskId: id },
          });
        }
      }
    }, batchConfig);
  }

  /**
   * 批量同步文件
   * @param collectionId 集合ID
   * @param files 文件信息列表
   */
  public async batchSyncFiles(
    collectionId: string,
    files: Array<{
      path: string;
      name: string;
      mimeType: string;
      metadata?: any;
    }>,
  ): Promise<void> {
    const config = this.syncConfigs.get(collectionId);
    if (!config) {
      throw new Error(`No sync config found for collection: ${collectionId}`);
    }

    const tasks = files.map((file, index) => ({
      type: "add",
      data: {
        attachment: {
          getFilePath: () => file.path,
          getFilename: () => file.name,
          attachmentContentType: file.mimeType,
          id: `temp-${Date.now()}-${index}`,
          getSource: () => null,
          metadata: file.metadata,
        },
        config,
      },
    }));

    try {
      const batchId = `batch-sync-${collectionId}-${Date.now()}`;

      // 将进度处理和资源更新转发到知识库管理器
      await this.syncExecutor.executeSyncTasks(tasks, config, {
        onProgress: (progress) => {
          const handler = this.taskProgressHandlers.get(batchId);
          if (handler) {
            handler(progress);
          }
        },
        onResourceUpdate: (stats) => {
          Logger.info({
            message: "Sync resource stats updated",
            context: this.ERROR_CONTEXT,
            data: {
              collectionId,
              stats,
            },
          });
        },
      });

      Logger.info({
        message: "Batch file sync completed",
        context: this.ERROR_CONTEXT,
        data: {
          collectionId,
          fileCount: files.length,
        },
      });

      // 更新知识库状态
      await this.updateKnowledgeBaseStatus(collectionId);
    } catch (error) {
      Logger.error({
        message: "Batch file sync failed",
        context: this.ERROR_CONTEXT,
        error: error instanceof Error ? error : new Error(String(error)),
        data: {
          collectionId,
          fileCount: files.length,
        },
      });
      throw error;
    }
  }

  /**
   * 销毁管理器
   */
  public dispose(): void {
    try {
      this.stopPolling();

      // 停止所有观察器
      for (const watcher of this.watchers.values()) {
        try {
          watcher.stop();
        } catch (error) {
          Logger.warn({
            message: "Failed to stop watcher",
            context: this.ERROR_CONTEXT,
            error: error as Error,
            data: { id: watcher.id },
          });
        }
      }

      // 移除同步事件监听
      this.syncManager.off("syncStarted", () => {});
      this.syncManager.off("syncCompleted", () => {});
      this.syncManager.off("syncError", () => {});
      this.syncManager.off("syncProgress", () => {});

      // 清理资源
      this.watchers.clear();
      this.statusCache.clear();
      this.syncConfigs.clear();
      this.syncStatuses.clear();
      this.eventEmitter.removeAllListeners();

      // 记录销毁成功日志
      Logger.info({
        message: "Knowledge base manager disposed",
        context: this.ERROR_CONTEXT,
        data: { action: "dispose" },
      });

      KnowledgeBaseManager.instance = undefined!;
    } catch (error) {
      Logger.error({
        message: "Failed to dispose knowledge base manager",
        context: this.ERROR_CONTEXT,
        error: error as Error,
        data: {
          errorCode:
            (error instanceof Error && (error as any).code) ||
            ApiErrorCode.SystemError,
        },
      });
      throw error;
    }
  }
}
