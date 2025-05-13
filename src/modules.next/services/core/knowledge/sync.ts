import { Logger } from "../../../services/logger";
import { EventEmitter } from "./events";
import { TaskQueue, TaskPriority, TaskStatus, TaskProgress } from "./queue";
import { ragflow } from "../../../services/ragflow";
import { KnowledgeBaseDocument, DocumentMetadata } from "./types";

// 在Zotero 7中，我们改用Zotero.File直接获取文件大小
// 不再使用OS.File模块，避免模块导入问题

// Sync Types
export interface SyncConfig {
  collectionId: string;
  datasetId: string;
  syncInterval?: number; // milliseconds
  autoSync?: boolean;
  batchSize?: number; // 批处理大小
  retryCount?: number; // 重试次数
  retryDelay?: number; // 重试延迟(ms)
}

export interface SyncStatus {
  state: "idle" | "syncing" | "error" | "paused";
  lastSync?: number;
  error?: Error;
  progress?: TaskProgress;
  stats?: SyncStats;
}

interface SyncStats {
  startTime: number;
  endTime?: number;
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
  errors: Array<{
    error: Error;
    timestamp: number;
    documentId?: string;
  }>;
  avgProcessingTime?: number; // 平均处理时间(ms)
  retryCount: number; // 重试次数
}

// 事件缓冲相关接口
interface BufferedEvent {
  type: string;
  itemId: number;
  timestamp: number;
  retryCount: number;
  error?: Error;
}

interface BufferConfig {
  maxSize: number; // 最大缓冲事件数
  flushDelay: number; // 延迟处理时间(ms)
  maxRetries: number; // 最大重试次数
  retryDelay: number; // 基础重试延迟(ms)
}

// 资源统计相关接口
interface ResourceStats {
  memoryUsage: number;
  activeConnections: number;
  pendingTasks: number;
}

export type SyncEvent =
  | { type: "syncStarted"; collectionId: string }
  | { type: "syncCompleted"; collectionId: string; stats: SyncStats }
  | { type: "syncError"; collectionId: string; error: Error }
  | { type: "syncProgress"; collectionId: string; progress: TaskProgress }
  | { type: "syncPaused"; collectionId: string }
  | { type: "syncResumed"; collectionId: string }
  | { type: "documentAdded"; collectionId: string; documentId: string }
  | { type: "documentDeleted"; collectionId: string; documentId: string }
  | { type: "documentModified"; collectionId: string; documentId: string }
  | { type: "batchProcessed"; collectionId: string; count: number };

export class SyncManager {
  private configs = new Map<string, SyncConfig>();
  private status = new Map<string, SyncStatus>();
  private eventEmitter = new EventEmitter();
  private readonly ERROR_CONTEXT = "SyncManager";
  private syncQueue: TaskQueue;
  private maxConcurrentSyncs = 3;
  private activeSyncs = 0;

  constructor() {
    this.syncQueue = new TaskQueue();
  }

  public addConfig(config: SyncConfig): void {
    const defaultConfig = {
      batchSize: 10,
      retryCount: 3,
      retryDelay: 1000,
      ...config,
    };

    this.configs.set(config.collectionId, defaultConfig);
    this.status.set(config.collectionId, {
      state: "idle",
      stats: {
        startTime: 0,
        totalFiles: 0,
        processedFiles: 0,
        failedFiles: 0,
        errors: [],
        retryCount: 0,
      },
    });

    if (config.autoSync) {
      this.setupAutoSync(config);
    }
  }

  public removeConfig(collectionId: string): void {
    this.configs.delete(collectionId);
    this.status.delete(collectionId);
  }

  public getConfig(collectionId: string): SyncConfig | undefined {
    return this.configs.get(collectionId);
  }

  public getStatus(collectionId: string): SyncStatus | undefined {
    return this.status.get(collectionId);
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

  private setupAutoSync(config: SyncConfig): void {
    const interval = config.syncInterval || 5 * 60 * 1000; // Default: 5 minutes
    const win = this.getZoteroWindow();

    if (win) {
      win.setInterval(() => {
        this.sync(config.collectionId).catch((error) => {
          Logger.error({
            message: "Auto sync failed",
            context: this.ERROR_CONTEXT,
            error,
            data: { collectionId: config.collectionId },
          });
        });
      }, interval);
    } else {
      // 如果无法获取 window 对象，记录警告并使用替代方案（例如一次性同步）
      Logger.warn({
        message: "Cannot get window object for setInterval in setupAutoSync",
        context: this.ERROR_CONTEXT,
        data: { collectionId: config.collectionId },
      });

      // 立即执行一次同步，但不设置自动同步
      this.sync(config.collectionId).catch((error) => {
        Logger.error({
          message: "Initial sync failed when window not available",
          context: this.ERROR_CONTEXT,
          error,
          data: { collectionId: config.collectionId },
        });
      });
    }
  }

  /**
   * 获取同步统计信息
   */
  public getSyncStats(collectionId: string): SyncStats | undefined {
    return this.status.get(collectionId)?.stats;
  }

  /**
   * 更新同步统计信息
   */
  private updateSyncStats(
    collectionId: string,
    updates: Partial<SyncStats>,
  ): void {
    const status = this.status.get(collectionId);
    if (status && status.stats) {
      status.stats = {
        ...status.stats,
        ...updates,
      };

      // 计算平均处理时间
      if (
        status.stats.processedFiles > 0 &&
        status.stats.startTime &&
        status.stats.endTime
      ) {
        status.stats.avgProcessingTime =
          (status.stats.endTime - status.stats.startTime) /
          status.stats.processedFiles;
      }
    }
  }

  /**
   * 更新同步进度
   */
  private updateProgress(collectionId: string, progress: TaskProgress): void {
    const status = this.status.get(collectionId);
    if (status) {
      status.progress = progress;
      this.eventEmitter.emit("syncProgress", {
        type: "syncProgress",
        collectionId,
        progress,
      });
    }
  }

  /**
   * 手动触发同步
   */
  public async manualSync(
    collectionId: string,
    options?: {
      force?: boolean; // 是否强制同步，忽略正在进行的同步
      priority?: TaskPriority; // 同步任务优先级
      batchSize?: number; // 覆盖默认批处理大小
    },
  ): Promise<void> {
    const config = this.configs.get(collectionId);
    if (!config) {
      throw new Error(`No sync config found for collection: ${collectionId}`);
    }

    const status = this.status.get(collectionId)!;
    if (status.state === "syncing" && !options?.force) {
      throw new Error(`Collection ${collectionId} is already syncing`);
    }

    if (this.activeSyncs >= this.maxConcurrentSyncs) {
      Logger.warn({
        message: "Max concurrent syncs reached, queuing sync request",
        context: this.ERROR_CONTEXT,
        data: { collectionId, activeSyncs: this.activeSyncs },
      });
    }

    // 更新同步配置
    if (options?.batchSize) {
      config.batchSize = options.batchSize;
    }

    // 初始化或重置同步统计
    this.updateSyncStats(collectionId, {
      startTime: Date.now(),
      totalFiles: 0,
      processedFiles: 0,
      failedFiles: 0,
      errors: [],
      retryCount: 0,
    });

    await this.sync(collectionId);
  }

  /**
   * 暂停同步
   */
  public pauseSync(collectionId: string): void {
    const status = this.status.get(collectionId);
    if (status?.state === "syncing") {
      this.syncQueue.pauseTask(`sync-${collectionId}`);
      status.state = "paused";
      this.eventEmitter.emit("syncPaused", {
        type: "syncPaused",
        collectionId,
      });
    }
  }

  /**
   * 恢复同步
   */
  public resumeSync(collectionId: string): void {
    const status = this.status.get(collectionId);
    if (status?.state === "paused") {
      this.syncQueue.resumeTask(`sync-${collectionId}`);
      status.state = "syncing";
      this.eventEmitter.emit("syncResumed", {
        type: "syncResumed",
        collectionId,
      });
    }
  }

  /**
   * 取消同步
   */
  public cancelSync(collectionId: string): void {
    const status = this.status.get(collectionId);
    if (status?.state === "syncing" || status?.state === "paused") {
      this.syncQueue.cancelTask(`sync-${collectionId}`);
      status.state = "idle";
      status.error = new Error("Sync cancelled by user");

      // 更新统计信息
      if (status.stats) {
        status.stats.endTime = Date.now();
      }

      this.eventEmitter.emit("syncError", {
        type: "syncError",
        collectionId,
        error: status.error,
      });

      this.activeSyncs--;
    }
  }

  public async sync(collectionId: string): Promise<void> {
    const config = this.configs.get(collectionId);
    if (!config) {
      throw new Error(`No sync config found for collection: ${collectionId}`);
    }

    const status = this.status.get(collectionId)!;
    if (status.state === "syncing") {
      return; // Already syncing
    }

    try {
      status.state = "syncing";
      status.error = undefined;
      this.eventEmitter.emit("syncStarted", {
        type: "syncStarted",
        collectionId,
      });

      await this.executeSyncTask(config);

      status.state = "idle";
      status.lastSync = Date.now();

      // 更新统计信息
      if (status.stats) {
        status.stats.endTime = Date.now();
      }

      this.eventEmitter.emit("syncCompleted", {
        type: "syncCompleted",
        collectionId,
        stats: status.stats!,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      status.state = "error";
      status.error = err;

      // 更新统计信息
      if (status.stats) {
        status.stats.endTime = Date.now();
        status.stats.errors.push({
          error: err,
          timestamp: Date.now(),
        });
      }

      this.eventEmitter.emit("syncError", {
        type: "syncError",
        collectionId,
        error: err,
      });
      throw err;
    }
  }

  private async executeSyncTask(config: SyncConfig): Promise<void> {
    const taskId = `sync-${config.collectionId}-${Date.now()}`;
    this.activeSyncs++;

    await this.syncQueue.enqueue(
      async () => {
        // Get documents from Zotero collection
        const collection = await Zotero.Collections.get(config.collectionId);
        const items = await collection.getItems();

        // Set initial progress
        this.updateProgress(config.collectionId, {
          current: 0,
          total: items.length,
          percent: 0,
          message: "开始同步",
        });

        // Update stats
        this.updateSyncStats(config.collectionId, {
          totalFiles: items.length,
        });

        // Process items in batches
        const batchSize = config.batchSize || 10;
        let processedCount = 0;
        let failedCount = 0;
        const totalItems = items.length;

        for (let i = 0; i < items.length; i += batchSize) {
          const batch = items.slice(i, i + batchSize);

          // Process batch
          for (const item of batch) {
            if (item.isRegularItem()) {
              const attachments = item.getAttachments();
              for (const attachmentId of attachments) {
                const attachment = await Zotero.Items.get(attachmentId);
                if (attachment.isFileAttachment()) {
                  try {
                    await this.processAttachment(attachment, config);
                    processedCount++;
                  } catch (error) {
                    failedCount++;
                    // Update error stats
                    this.updateSyncStats(config.collectionId, {
                      failedFiles: failedCount,
                      errors: [
                        ...(this.status.get(config.collectionId)?.stats
                          ?.errors || []),
                        {
                          error:
                            error instanceof Error
                              ? error
                              : new Error(String(error)),
                          timestamp: Date.now(),
                          documentId: attachmentId.toString(),
                        },
                      ],
                    });
                  }

                  // Update progress
                  this.updateProgress(config.collectionId, {
                    current: processedCount,
                    total: totalItems,
                    percent: Math.round((processedCount / totalItems) * 100),
                    message: `处理文件 ${processedCount}/${totalItems}`,
                  });

                  // Update processed files count
                  this.updateSyncStats(config.collectionId, {
                    processedFiles: processedCount,
                  });
                }
              }
            }
          }

          // Emit batch processed event
          this.eventEmitter.emit("batchProcessed", {
            type: "batchProcessed",
            collectionId: config.collectionId,
            count: batch.length,
          });
        }

        this.activeSyncs--;
      },
      {
        id: taskId,
        priority: TaskPriority.Normal,
        onProgress: (progress) => {
          this.eventEmitter.emit("syncProgress", {
            type: "syncProgress",
            collectionId: config.collectionId,
            progress,
          });
        },
      },
    );
  }

  private async processAttachment(
    attachment: any,
    config: SyncConfig,
  ): Promise<void> {
    let path = "";
    let filename = "";
    let mimeType = "";

    try {
      // 获取附件信息，并记录每一步
      try {
        path = attachment.getFilePath();
        Logger.debug({
          message: "Got file path for attachment",
          context: this.ERROR_CONTEXT,
          data: { path, attachmentId: attachment.id },
        });

        // 使用 attachmentFilename 属性替代弃用的 getFilename()
        filename = attachment.attachmentFilename || attachment.getFilename();
        Logger.debug({
          message: "Got filename for attachment",
          context: this.ERROR_CONTEXT,
          data: { filename, attachmentId: attachment.id },
        });

        mimeType = attachment.attachmentContentType;
        Logger.debug({
          message: "Got mime type for attachment",
          context: this.ERROR_CONTEXT,
          data: { mimeType, attachmentId: attachment.id },
        });
      } catch (infoError) {
        Logger.error({
          message: "Failed to get attachment information",
          context: this.ERROR_CONTEXT,
          error:
            infoError instanceof Error
              ? infoError
              : new Error(String(infoError)),
          data: { attachmentId: attachment.id },
        });
        throw new Error(
          `Failed to get attachment information: ${infoError instanceof Error ? infoError.message : String(infoError)}`,
        );
      }

      // 验证文件是否存在且可读
      try {
        const fileExists = await Zotero.File.pathExists(path);
        if (!fileExists) {
          throw new Error(`File does not exist at path: ${path}`);
        }

        // 使用Zotero.File.getBinaryContentsAsync来获取文件内容并计算大小
        const fileContents = await Zotero.File.getBinaryContentsAsync(path);
        const fileSize = fileContents.length;
        if (fileSize <= 0) {
          throw new Error(`File is empty or cannot be read: ${path}`);
        }

        Logger.debug({
          message: "Verified file exists and is readable",
          context: this.ERROR_CONTEXT,
          data: { path, fileSize, attachmentId: attachment.id },
        });
      } catch (fileError) {
        Logger.error({
          message: "File validation failed",
          context: this.ERROR_CONTEXT,
          error:
            fileError instanceof Error
              ? fileError
              : new Error(String(fileError)),
          data: { path, attachmentId: attachment.id },
        });
        throw fileError;
      }

      // Get parent item metadata - 使用新的 API 方式
      const parentItemID = attachment.parentItemID || null;
      const parentItem = parentItemID
        ? await Zotero.Items.get(parentItemID)
        : null;
      const metadata: DocumentMetadata = {
        title: parentItem?.getField("title") || filename,
        author: parentItem?.getField("author"),
        date: parentItem?.getField("date"),
        tags: parentItem?.getTags().map((tag: any) => tag.tag) || [],
        type: attachment.attachmentContentType,
        size: (await Zotero.File.getBinaryContentsAsync(path)).length,
        itemType: parentItem?.itemType,
        itemId: parentItem?.id,
        attachmentId: attachment.id,
      };

      // 上传文件到 RAGFlow 并添加详细日志
      try {
        Logger.info({
          message: "Starting RAGFlow upload",
          context: this.ERROR_CONTEXT,
          data: {
            filename,
            path,
            mimeType,
            attachmentId: attachment.id,
            datasetId: config.datasetId,
          },
        });

        await ragflow.uploadFiles(
          [
            {
              path,
              name: filename,
              mimeType,
            },
          ],
          config.datasetId,
        );

        Logger.info({
          message: "RAGFlow upload completed successfully",
          context: this.ERROR_CONTEXT,
          data: {
            filename,
            attachmentId: attachment.id,
            datasetId: config.datasetId,
          },
        });
      } catch (uploadError) {
        Logger.error({
          message: "RAGFlow upload failed",
          context: this.ERROR_CONTEXT,
          error:
            uploadError instanceof Error
              ? uploadError
              : new Error(String(uploadError)),
          data: {
            filename,
            path,
            mimeType,
            attachmentId: attachment.id,
            datasetId: config.datasetId,
          },
        });
        throw uploadError;
      }

      Logger.info({
        message: "Attachment processed successfully",
        context: this.ERROR_CONTEXT,
        data: {
          filename,
          collectionId: config.collectionId,
          datasetId: config.datasetId,
          metadata,
        },
      });
    } catch (error) {
      Logger.error({
        message: "Failed to process attachment",
        context: this.ERROR_CONTEXT,
        error: error instanceof Error ? error : new Error(String(error)),
        data: {
          attachmentId: attachment.id,
          collectionId: config.collectionId,
          path,
          filename,
          mimeType,
        },
      });
      throw error;
    }
  }

  public on<T extends SyncEvent>(
    event: T["type"],
    callback: (event: T) => void,
  ): void {
    this.eventEmitter.on(event, callback);
  }

  public off<T extends SyncEvent>(
    event: T["type"],
    callback: (event: T) => void,
  ): void {
    this.eventEmitter.off(event, callback);
  }
}

export class CollectionWatcher {
  private readonly ERROR_CONTEXT = "CollectionWatcher";
  private eventEmitter = new EventEmitter();
  private syncManager: SyncManager;
  private eventBuffer: BufferedEvent[] = [];
  private bufferTimer?: number;
  private isRecovering: boolean = false;
  private readonly bufferConfig: BufferConfig = {
    maxSize: 100, // 最大缓冲事件数
    flushDelay: 1000, // 延迟处理时间(ms)
    maxRetries: 3, // 最大重试次数
    retryDelay: 1000, // 基础重试延迟(ms)
  };

  // 数据集ID映射 (Zotero集合ID -> RAGFlow数据集ID)
  private datasetIdMap = new Map<string, string>();
  // 文档ID映射 (Zotero附件ID -> RAGFlow文档ID)
  private documentIdMap = new Map<string, string>();

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

  constructor(syncManager: SyncManager) {
    this.syncManager = syncManager;
    this.initialize(); // 加载ID映射
    this.setupEventListeners();
  }

  public setupEventListeners(): void {
    Logger.info({
      message: "Setting up collection watcher event listeners",
      context: this.ERROR_CONTEXT,
    });

    try {
      // 确保在可能的错误情况下不会破坏当前功能
      if (
        typeof Zotero.Notifier === "undefined" ||
        typeof Zotero.Notifier.registerObserver !== "function"
      ) {
        throw new Error("Zotero Notifier API not available");
      }

      // 添加try-catch以防单个注册失败
      try {
        // Listen for item modifications
        Zotero.Notifier.registerObserver(this, ["item"], "sync-watcher");
        Logger.info({
          message: "Registered item observer",
          context: this.ERROR_CONTEXT,
        });
      } catch (itemError) {
        Logger.error({
          message: "Failed to register item observer",
          context: this.ERROR_CONTEXT,
          error:
            itemError instanceof Error
              ? itemError
              : new Error(String(itemError)),
        });
      }

      try {
        // Listen for collection changes
        Zotero.Notifier.registerObserver(this, ["collection"], "sync-watcher");
        Logger.info({
          message: "Registered collection observer",
          context: this.ERROR_CONTEXT,
        });
      } catch (collectionError) {
        Logger.error({
          message: "Failed to register collection observer",
          context: this.ERROR_CONTEXT,
          error:
            collectionError instanceof Error
              ? collectionError
              : new Error(String(collectionError)),
        });
      }

      Logger.info({
        message: "Collection watcher setup completed",
        context: this.ERROR_CONTEXT,
      });
    } catch (error) {
      Logger.error({
        message: "Failed to setup collection watcher",
        context: this.ERROR_CONTEXT,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      // 不抛出错误，以避免中断主流程
    }
  }

  notify(
    event: string,
    type: string,
    ids: Array<number>,
    extraData: any,
  ): void {
    // 添加详细日志，记录接收到的Zotero事件
    Logger.info({
      message: `CollectionWatcher.notify received event from Zotero`,
      context: this.ERROR_CONTEXT,
      data: {
        eventType: event,
        objectType: type,
        ids: ids,
        extraDataKeys: extraData ? Object.keys(extraData) : [],
      },
    });

    if (type === "item") {
      // Buffer item events for batch processing
      Logger.info({
        message: `Buffering ${ids.length} item events`,
        context: this.ERROR_CONTEXT,
        data: { event, ids },
      });
      ids.forEach((id) => this.bufferEvent(event, id));
    } else if (type === "collection") {
      // Collection events are processed immediately
      Logger.info({
        message: `Processing ${ids.length} collection events immediately`,
        context: this.ERROR_CONTEXT,
        data: { event, ids },
      });
      this.handleCollectionEvent(event, ids);
    } else {
      // 记录未处理的事件类型
      Logger.warn({
        message: `Received unhandled object type in CollectionWatcher.notify`,
        context: this.ERROR_CONTEXT,
        data: { objectType: type, event, ids },
      });
    }
  }

  private bufferEvent(event: string, itemId: number): void {
    // Add event to buffer
    this.eventBuffer.push({
      type: event,
      itemId,
      timestamp: Date.now(),
      retryCount: 0,
    });

    // Schedule buffer flush
    if (this.eventBuffer.length >= this.bufferConfig.maxSize) {
      this.flushBuffer();
    } else if (!this.bufferTimer) {
      const win = this.getZoteroWindow();
      if (win) {
        this.bufferTimer = win.setTimeout(() => {
          this.flushBuffer();
        }, this.bufferConfig.flushDelay) as unknown as number;
      } else {
        // 如果无法获取 window，立即执行刷新
        Logger.warn({
          message:
            "Cannot get window object for setTimeout, flushing immediately",
          context: this.ERROR_CONTEXT,
        });
        this.flushBuffer();
      }
    }
  }

  private async flushBuffer(): Promise<void> {
    if (this.bufferTimer) {
      const win = this.getZoteroWindow();
      if (win) {
        win.clearTimeout(this.bufferTimer);
      }
      this.bufferTimer = undefined;
    }

    if (this.eventBuffer.length === 0) return;

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    // Group events by type for batch processing
    const groupedEvents = events.reduce(
      (acc, event) => {
        if (!acc[event.type]) {
          acc[event.type] = new Set();
        }
        acc[event.type].add(event.itemId);
        return acc;
      },
      {} as Record<string, Set<number>>,
    );

    // Process each group
    for (const [eventType, itemIds] of Object.entries(groupedEvents)) {
      try {
        await this.handleItemEvent(eventType, Array.from(itemIds));
      } catch (error) {
        Logger.error({
          message: "Failed to process event group",
          context: this.ERROR_CONTEXT,
          error: error instanceof Error ? error : new Error(String(error)),
          data: { eventType, itemIds: Array.from(itemIds) },
        });

        // Re-buffer failed events with retry count
        const failedEvents = events
          .filter(
            (e) =>
              e.type === eventType && Array.from(itemIds).includes(e.itemId),
          )
          .filter((e) => e.retryCount < this.bufferConfig.maxRetries)
          .map((e) => ({
            ...e,
            retryCount: e.retryCount + 1,
            error: error instanceof Error ? error : new Error(String(error)),
          }));

        if (failedEvents.length > 0) {
          this.eventBuffer.push(...failedEvents);

          // Start recovery process if not already running
          if (!this.isRecovering) {
            this.startErrorRecovery();
          }
        }
      }
    }
  }

  private async startErrorRecovery(): Promise<void> {
    if (this.isRecovering) return;
    this.isRecovering = true;

    try {
      while (this.eventBuffer.length > 0) {
        const failedEvents = this.eventBuffer.filter((e) => e.error);
        if (failedEvents.length === 0) break;

        // Group events by retry count for exponential backoff
        const retryGroups = failedEvents.reduce(
          (acc, event) => {
            if (!acc[event.retryCount]) {
              acc[event.retryCount] = [];
            }
            acc[event.retryCount].push(event);
            return acc;
          },
          {} as Record<number, BufferedEvent[]>,
        );

        // Process each retry group with exponential backoff
        for (const [retryCount, events] of Object.entries(retryGroups)) {
          const delay =
            this.bufferConfig.retryDelay * Math.pow(2, Number(retryCount) - 1);

          Logger.info({
            message: `Retrying failed events after ${delay}ms delay`,
            context: this.ERROR_CONTEXT,
            data: {
              retryCount,
              eventCount: events.length,
              delay,
            },
          });

          const win = this.getZoteroWindow();
          await new Promise((resolve) => {
            if (win) {
              win.setTimeout(resolve, delay);
            } else {
              // 如果无法获取 window，立即解析 Promise
              Logger.warn({
                message:
                  "Cannot get window object for setTimeout, resolving delay immediately",
                context: this.ERROR_CONTEXT,
              });
              resolve(undefined);
            }
          });

          for (const event of events) {
            try {
              await this.handleItemEvent(event.type, [event.itemId]);

              // Remove successful event from buffer
              this.eventBuffer = this.eventBuffer.filter(
                (e) => !(e.type === event.type && e.itemId === event.itemId),
              );

              Logger.info({
                message: "Event retry successful",
                context: this.ERROR_CONTEXT,
                data: { event },
              });
            } catch (error) {
              Logger.error({
                message: `Retry failed (${event.retryCount}/${this.bufferConfig.maxRetries})`,
                context: this.ERROR_CONTEXT,
                error:
                  error instanceof Error ? error : new Error(String(error)),
                data: { event },
              });

              // If reached max retries, remove from buffer
              if (event.retryCount >= this.bufferConfig.maxRetries) {
                this.eventBuffer = this.eventBuffer.filter(
                  (e) => !(e.type === event.type && e.itemId === event.itemId),
                );

                Logger.warn({
                  message: "Max retries reached, abandoning event",
                  context: this.ERROR_CONTEXT,
                  data: { event },
                });
              }
            }
          }
        }

        // Break if no more failed events
        if (this.eventBuffer.filter((e) => e.error).length === 0) {
          break;
        }
      }
    } finally {
      this.isRecovering = false;
      Logger.info({
        message: "Error recovery process completed",
        context: this.ERROR_CONTEXT,
        data: { remainingEvents: this.eventBuffer.length },
      });
    }
  }

  /**
   * 用于保存已处理过的文件信息，以便检测文件是否真正变更
   * key: attachmentId, value: {lastModified, size, hash}
   */
  private processedFilesCache = new Map<
    string,
    {
      lastModified: number;
      size: number;
      path: string;
    }
  >();

  /**
   * 判断文件是否真实变更
   * @param item 附件项
   * @param attachmentId 附件ID
   * @returns 如果文件内容变更则返回true，否则返回false
   */
  private async hasFileContentChanged(
    item: any,
    attachmentId: string,
  ): Promise<boolean> {
    try {
      const path = item.getFilePath();
      // 用Zotero的API获取文件修改时间和大小
      const fileExists = await Zotero.File.pathExists(path);
      if (!fileExists) {
        // 如果文件不存在，认为已变更
        return true;
      }

      // 获取文件内容的大小
      const fileContent = await Zotero.File.getBinaryContentsAsync(path);
      const currentSize = fileContent.length;

      // 获取文件修改时间
      const fileInfo = await Zotero.File.getFileInfo(path);
      const currentModTime = fileInfo
        ? fileInfo.lastModified || Date.now()
        : Date.now();

      // 检查缓存中是否有此文件记录
      const cachedInfo = this.processedFilesCache.get(attachmentId);
      if (!cachedInfo) {
        // 如果没有缓存记录，则认为是新文件，保存信息并返回true
        this.processedFilesCache.set(attachmentId, {
          lastModified: currentModTime,
          size: currentSize,
          path: path,
        });
        return true;
      }

      // 如果文件路径变了，认为文件变更
      if (cachedInfo.path !== path) {
        this.processedFilesCache.set(attachmentId, {
          lastModified: currentModTime,
          size: currentSize,
          path: path,
        });
        return true;
      }

      // 检查文件大小和修改时间是否变化
      const sizeChanged = cachedInfo.size !== currentSize;
      const timeChanged =
        Math.abs(cachedInfo.lastModified - currentModTime) > 1000; // 允许1秒误差

      // 更新缓存
      if (sizeChanged || timeChanged) {
        this.processedFilesCache.set(attachmentId, {
          lastModified: currentModTime,
          size: currentSize,
          path: path,
        });
        return true;
      }

      return false;
    } catch (error) {
      Logger.warn({
        message: "Error checking file changes, assuming file has changed",
        context: this.ERROR_CONTEXT,
        error: error instanceof Error ? error : new Error(String(error)),
        data: { attachmentId },
      });
      return true; // 发生错误时，保险起见当作文件已变更
    }
  }

  private async handleItemEvent(
    event: string,
    ids: Array<number>,
  ): Promise<void> {
    Logger.info({
      message: "Processing item events",
      context: this.ERROR_CONTEXT,
      data: { event, itemCount: ids.length },
    });

    try {
      for (const id of ids) {
        // 获取Zotero项目对象
        let item;
        try {
          item = await Zotero.Items.get(id);
          // 有时候项目可能在处理前已被删除
          if (!item) {
            Logger.warn({
              message: "Item not found, might have been deleted",
              context: this.ERROR_CONTEXT,
              data: { itemId: id, event },
            });
            continue;
          }
        } catch (itemError) {
          Logger.warn({
            message: "Failed to get item, skipping",
            context: this.ERROR_CONTEXT,
            error:
              itemError instanceof Error
                ? itemError
                : new Error(String(itemError)),
            data: { itemId: id, event },
          });
          continue;
        }

        // 处理文件附件
        if (item.isFileAttachment()) {
          const collectionId = await this.getItemCollectionId(item);
          if (collectionId) {
            const config = this.syncManager.getConfig(collectionId.toString());
            if (config) {
              const attachmentId = id.toString();

              switch (event) {
                case "add":
                  await this.handleDocumentAdded(
                    collectionId,
                    attachmentId,
                    item,
                    config,
                  );
                  break;
                case "modify":
                  // 检查文件是否真正变更
                  const hasChanged = await this.hasFileContentChanged(
                    item,
                    attachmentId,
                  );

                  if (hasChanged) {
                    Logger.info({
                      message: "File content changed, updating document",
                      context: this.ERROR_CONTEXT,
                      data: { collectionId, attachmentId },
                    });
                    await this.handleDocumentModified(
                      collectionId,
                      attachmentId,
                      item,
                      config,
                      true, // 指示文件内容已变更
                    );
                  } else {
                    Logger.info({
                      message: "Only metadata changed, skipping file upload",
                      context: this.ERROR_CONTEXT,
                      data: { collectionId, attachmentId },
                    });
                    // 仅元数据变更，不重新上传文件
                    await this.handleDocumentModified(
                      collectionId,
                      attachmentId,
                      item,
                      config,
                      false, // 指示仅元数据变更
                    );
                  }
                  break;
                case "delete":
                  await this.handleDocumentDeleted(
                    collectionId,
                    attachmentId,
                    config,
                  );
                  // 从缓存中删除文件信息
                  this.processedFilesCache.delete(attachmentId);
                  break;
              }
            }
          }
        }
        // 处理常规条目变更（可能包含附件）
        else if (item.isRegularItem()) {
          // 只有在modify事件时才检查附件更新，避免add和delete事件重复处理
          if (event === "modify") {
            const collectionIds = item.getCollections();
            for (const collectionId of collectionIds) {
              const config = this.syncManager.getConfig(
                collectionId.toString(),
              );
              if (config) {
                const attachments = item.getAttachments();
                for (const attachmentId of attachments) {
                  const attachment = await Zotero.Items.get(attachmentId);
                  if (attachment && attachment.isFileAttachment()) {
                    // 父条目元数据变更，仅更新元数据不重新上传文件
                    await this.handleDocumentModified(
                      collectionId,
                      attachmentId.toString(),
                      attachment,
                      config,
                      false, // 仅更新元数据
                    );
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      Logger.error({
        message: "Failed to handle item event",
        context: this.ERROR_CONTEXT,
        error: error instanceof Error ? error : new Error(String(error)),
        data: { event, ids },
      });
      throw error;
    }
  }

  private async handleCollectionEvent(
    event: string,
    ids: Array<number>,
  ): Promise<void> {
    try {
      for (const id of ids) {
        const config = this.syncManager.getConfig(id.toString());

        if (config) {
          switch (event) {
            case "add":
              // 当新集合添加时，检查是否需要进行初始同步
              await this.handleCollectionAdded(id, config);
              break;
            case "modify":
              // 获取集合对象（在修改事件中，集合对象仍然存在）
              const collection = await Zotero.Collections.get(id);
              await this.handleCollectionModified(collection, config);
              break;
            case "delete":
              await this.handleCollectionDeleted(id.toString(), config);
              break;
          }
        } else if (event === "add") {
          // 当新集合添加但没有关联配置时，记录但不处理
          Logger.info({
            message: "New collection added but not configured for sync",
            context: this.ERROR_CONTEXT,
            data: { collectionId: id },
          });
        }
      }
    } catch (error) {
      Logger.error({
        message: "Failed to handle collection event",
        context: this.ERROR_CONTEXT,
        error: error instanceof Error ? error : new Error(String(error)),
        data: { event, ids },
      });
    }
  }

  private async getItemCollectionId(item: any): Promise<string | undefined> {
    const collections = item.getCollections();
    return collections.length > 0 ? collections[0] : undefined;
  }

  /**
   * 处理新集合添加事件
   * @param collectionId 集合ID
   * @param config 同步配置
   */
  private async handleCollectionAdded(
    collectionId: number,
    config: SyncConfig,
  ): Promise<void> {
    try {
      const collection = await Zotero.Collections.get(collectionId);

      Logger.info({
        message: "Collection added",
        context: this.ERROR_CONTEXT,
        data: {
          collectionId,
          collectionName: collection.name,
        },
      });

      // 可以在这里执行初始同步或其他初始化操作
      // 如果集合已经配置了同步，这里通常会触发一次完整同步
      await this.syncManager.sync(collectionId.toString());
    } catch (error) {
      Logger.error({
        message: "Failed to handle collection addition",
        context: this.ERROR_CONTEXT,
        error: error instanceof Error ? error : new Error(String(error)),
        data: { collectionId },
      });
      throw error;
    }
  }

  /**
   * 初始化或更新数据集ID映射
   * @param collectionId Zotero集合ID
   * @param datasetId RAGFlow数据集ID
   */
  private setDatasetIdMapping(collectionId: string, datasetId: string): void {
    this.datasetIdMap.set(collectionId, datasetId);
    this.saveIdMappings();
  }

  /**
   * 获取数据集ID
   * @param collectionId Zotero集合ID
   * @returns RAGFlow数据集ID或undefined
   */
  private getDatasetId(collectionId: string): string | undefined {
    return this.datasetIdMap.get(collectionId);
  }

  /**
   * 设置文档ID映射
   * @param zoteroDocId Zotero附件ID
   * @param ragflowDocId RAGFlow文档ID
   */
  private setDocumentIdMapping(
    zoteroDocId: string,
    ragflowDocId: string,
  ): void {
    this.documentIdMap.set(zoteroDocId, ragflowDocId);
    this.saveIdMappings();
  }

  /**
   * 获取RAGFlow文档ID
   * @param zoteroDocId Zotero附件ID
   * @returns RAGFlow文档ID或undefined
   */
  private getRagflowDocumentId(zoteroDocId: string): string | undefined {
    return this.documentIdMap.get(zoteroDocId);
  }

  /**
   * 删除文档ID映射
   * @param zoteroDocId Zotero附件ID
   */
  private removeDocumentIdMapping(zoteroDocId: string): void {
    this.documentIdMap.delete(zoteroDocId);
    this.saveIdMappings();
  }

  /**
   * 保存ID映射到偏好设置
   */
  private saveIdMappings(): void {
    try {
      // 使用Zotero的偏好设置API持久化存储
      const datasetMappings = Object.fromEntries(this.datasetIdMap);
      const documentMappings = Object.fromEntries(this.documentIdMap);

      const mappingsJson = JSON.stringify({
        datasets: datasetMappings,
        documents: documentMappings,
      });

      Zotero.Prefs.set("ragflow.idMappings", mappingsJson);

      Logger.debug({
        message: "ID mappings saved",
        context: this.ERROR_CONTEXT,
        data: {
          datasetCount: this.datasetIdMap.size,
          documentCount: this.documentIdMap.size,
        },
      });
    } catch (error) {
      Logger.error({
        message: "Failed to save ID mappings",
        context: this.ERROR_CONTEXT,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * 加载ID映射
   */
  private loadIdMappings(): void {
    try {
      const mappingsJson = Zotero.Prefs.get("ragflow.idMappings");

      if (mappingsJson) {
        const mappings = JSON.parse(mappingsJson);

        if (mappings.datasets) {
          this.datasetIdMap = new Map(Object.entries(mappings.datasets));
        }

        if (mappings.documents) {
          this.documentIdMap = new Map(Object.entries(mappings.documents));
        }

        Logger.info({
          message: "ID mappings loaded",
          context: this.ERROR_CONTEXT,
          data: {
            datasetCount: this.datasetIdMap.size,
            documentCount: this.documentIdMap.size,
          },
        });
      } else {
        Logger.info({
          message: "No ID mappings found, using empty maps",
          context: this.ERROR_CONTEXT,
        });
      }
    } catch (error) {
      Logger.error({
        message: "Failed to load ID mappings",
        context: this.ERROR_CONTEXT,
        error: error instanceof Error ? error : new Error(String(error)),
      });

      // 重置为空映射
      this.datasetIdMap = new Map();
      this.documentIdMap = new Map();
    }
  }

  /**
   * 在初始化后立即加载ID映射
   */
  public initialize(): void {
    this.loadIdMappings();
  }

  private async handleDocumentAdded(
    collectionId: string,
    zoteroDocId: string,
    item: any,
    config: SyncConfig,
  ): Promise<void> {
    try {
      // 获取文件信息
      const path = item.getFilePath();
      // 使用 attachmentFilename 属性替代弃用的 getFilename()
      const filename = item.attachmentFilename || item.getFilename();
      const mimeType = item.attachmentContentType;

      // 检查文件类型是否支持
      const isHTML =
        mimeType === "text/html" ||
        path.toLowerCase().endsWith(".html") ||
        path.toLowerCase().endsWith(".htm");
      const isSnapshot =
        filename.includes("Snapshot") || path.includes("Snapshot");

      if (isHTML || isSnapshot) {
        Logger.warn({
          message: "Skipping unsupported file type for RAGFlow",
          context: this.ERROR_CONTEXT,
          data: {
            mimeType,
            filename,
            isHTML,
            isSnapshot,
            collectionId,
            zoteroDocId,
          },
        });
        return; // 直接返回，不处理不支持的文件类型
      }

      // 获取父条目元数据 - 使用新的 API 方式
      const parentItemID = item.parentItemID || null;
      const parentItem = parentItemID
        ? await Zotero.Items.get(parentItemID)
        : null;
      const metadata = {
        title: parentItem?.getField("title") || filename,
        author: parentItem?.getField("author"),
        date: parentItem?.getField("date"),
        tags: parentItem?.getTags().map((tag: any) => tag.tag) || [],
        type: item.attachmentContentType,
        size: (await Zotero.File.getBinaryContentsAsync(path)).length,
        itemType: parentItem?.itemType,
        itemId: parentItem?.id,
        attachmentId: item.id,
      };

      // 上传到 RAGFlow，使用单文件上传方法，获取生成的文档ID
      try {
        Logger.info({
          message: "Starting document upload to RAGFlow",
          context: this.ERROR_CONTEXT,
          data: {
            collectionId,
            zoteroDocId,
            filename,
            mimeType,
            datasetId: config.datasetId,
          },
        });

        // 使用uploadSingleFile避免创建新数据集
        const ragflowDocId = await ragflow.uploadSingleFile(config.datasetId, {
          path,
          name: filename,
          mimeType,
        });

        // 保存Zotero附件ID到RAGFlow文档ID的映射关系
        this.setDocumentIdMapping(zoteroDocId, ragflowDocId);

        Logger.info({
          message: "Document added to RAGFlow successfully",
          context: this.ERROR_CONTEXT,
          data: {
            collectionId,
            zoteroDocId,
            ragflowDocId,
            filename,
            metadataKeys: Object.keys(metadata),
          },
        });

        this.eventEmitter.emit("documentAdded", {
          type: "documentAdded",
          collectionId,
          documentId: zoteroDocId,
        });
      } catch (uploadError) {
        Logger.error({
          message: "File upload to RAGFlow failed",
          context: this.ERROR_CONTEXT,
          error:
            uploadError instanceof Error
              ? uploadError
              : new Error(String(uploadError)),
          data: {
            collectionId,
            zoteroDocId,
            filename,
            pathExists: await Zotero.File.pathExists(path),
            fileSize: (await Zotero.File.getBinaryContentsAsync(path)).length,
          },
        });
        throw uploadError;
      }
    } catch (error) {
      Logger.error({
        message: "Failed to handle document addition",
        context: this.ERROR_CONTEXT,
        error: error instanceof Error ? error : new Error(String(error)),
        data: { collectionId, zoteroDocId },
      });
      throw error;
    }
  }

  private async handleDocumentDeleted(
    collectionId: string,
    zoteroDocId: string,
    config: SyncConfig,
  ): Promise<void> {
    try {
      // 获取RAGFlow文档ID
      const ragflowDocId = this.getRagflowDocumentId(zoteroDocId);

      if (!ragflowDocId) {
        Logger.warn({
          message: "No RAGFlow document ID mapping found for Zotero document",
          context: this.ERROR_CONTEXT,
          data: { collectionId, zoteroDocId, datasetId: config.datasetId },
        });

        // 无映射关系时直接返回，但仍需发送事件
        this.eventEmitter.emit("documentDeleted", {
          type: "documentDeleted",
          collectionId,
          documentId: zoteroDocId,
        });
        return;
      }

      // 从 RAGFlow 删除文档，使用实际的RAGFlow文档ID
      await ragflow.deleteDocument(config.datasetId, ragflowDocId);

      // 删除ID映射关系
      this.removeDocumentIdMapping(zoteroDocId);

      Logger.info({
        message: "Document deleted from RAGFlow",
        context: this.ERROR_CONTEXT,
        data: {
          collectionId,
          zoteroDocId,
          ragflowDocId,
          datasetId: config.datasetId,
        },
      });

      this.eventEmitter.emit("documentDeleted", {
        type: "documentDeleted",
        collectionId,
        documentId: zoteroDocId,
      });
    } catch (error) {
      Logger.error({
        message: "Failed to handle document deletion",
        context: this.ERROR_CONTEXT,
        error: error instanceof Error ? error : new Error(String(error)),
        data: {
          collectionId,
          zoteroDocId,
          datasetId: config.datasetId,
          errorDetails: error instanceof Error ? error.message : String(error),
        },
      });

      // 如果是因为文档不存在导致的错误，只记录不抛出
      if (error instanceof Error && error.message.includes("not found")) {
        Logger.warn({
          message: "Document not found in dataset, skipping deletion",
          context: this.ERROR_CONTEXT,
          data: {
            collectionId,
            zoteroDocId,
            datasetId: config.datasetId,
          },
        });

        // 删除ID映射关系，避免保留无效映射
        this.removeDocumentIdMapping(zoteroDocId);
        return;
      }

      throw error;
    }
  }

  private async handleDocumentModified(
    collectionId: string,
    zoteroDocId: string,
    item: any,
    config: SyncConfig,
    contentChanged: boolean = true,
  ): Promise<void> {
    try {
      // 获取文件信息
      const path = item.getFilePath();
      // 使用 attachmentFilename 属性替代弃用的 getFilename()
      const filename = item.attachmentFilename || item.getFilename();
      const mimeType = item.attachmentContentType;

      // 检查文件类型是否支持
      const isHTML =
        mimeType === "text/html" ||
        path.toLowerCase().endsWith(".html") ||
        path.toLowerCase().endsWith(".htm");
      const isSnapshot =
        filename.includes("Snapshot") || path.includes("Snapshot");

      if (isHTML || isSnapshot) {
        Logger.warn({
          message: "Skipping unsupported file type for RAGFlow",
          context: this.ERROR_CONTEXT,
          data: {
            mimeType,
            filename,
            isHTML,
            isSnapshot,
            collectionId,
            zoteroDocId,
          },
        });
        return; // 直接返回，不处理不支持的文件类型
      }

      // 获取父条目元数据（可能已更新）- 使用新的 API 方式
      const parentItemID = item.parentItemID || null;
      const parentItem = parentItemID
        ? await Zotero.Items.get(parentItemID)
        : null;
      const metadata = {
        title: parentItem?.getField("title") || filename,
        author: parentItem?.getField("author"),
        date: parentItem?.getField("date"),
        tags: parentItem?.getTags().map((tag: any) => tag.tag) || [],
        type: item.attachmentContentType,
        size: (await Zotero.File.getBinaryContentsAsync(path)).length,
        itemType: parentItem?.itemType,
        itemId: parentItem?.id,
        attachmentId: item.id,
        lastModified: Date.now(),
      };

      // 获取RAGFlow文档ID
      const ragflowDocId = this.getRagflowDocumentId(zoteroDocId);

      // 如果内容未变更，且只是元数据更新，就跳过文件上传操作
      if (!contentChanged) {
        Logger.info({
          message: "Content unchanged, skipping file upload",
          context: this.ERROR_CONTEXT,
          data: {
            collectionId,
            zoteroDocId,
            ragflowDocId: ragflowDocId || "unknown",
            filename,
          },
        });

        // 仍然发送修改事件，但不进行网络请求
        this.eventEmitter.emit("documentModified", {
          type: "documentModified",
          collectionId,
          documentId: zoteroDocId,
        });
        return;
      }

      // 如果内容已经变更，需要更新文档
      try {
        if (ragflowDocId) {
          // 使用RAGFlow文档ID更新文档
          Logger.info({
            message: "Updating document with mapped RAGFlow ID",
            context: this.ERROR_CONTEXT,
            data: {
              collectionId,
              zoteroDocId,
              ragflowDocId,
              filename,
            },
          });

          // 使用updateDocument方法更新文档内容
          await ragflow.updateDocument(
            config.datasetId,
            ragflowDocId,
            path,
            filename,
            mimeType,
          );

          Logger.info({
            message: "Document updated in RAGFlow",
            context: this.ERROR_CONTEXT,
            data: {
              collectionId,
              zoteroDocId,
              ragflowDocId,
              filename,
              metadataUpdated: Object.keys(metadata),
            },
          });
        } else {
          // 没有找到映射的RAGFlow文档ID，可能是首次更新或映射丢失
          Logger.warn({
            message:
              "No RAGFlow document ID mapping found, uploading as new document",
            context: this.ERROR_CONTEXT,
            data: { collectionId, zoteroDocId, filename },
          });

          // 使用单文件上传API
          const newRagflowDocId = await ragflow.uploadSingleFile(
            config.datasetId,
            {
              path,
              name: filename,
              mimeType,
            },
          );

          // 保存新的ID映射
          this.setDocumentIdMapping(zoteroDocId, newRagflowDocId);

          Logger.info({
            message: "Document uploaded as new to RAGFlow",
            context: this.ERROR_CONTEXT,
            data: {
              collectionId,
              zoteroDocId,
              newRagflowDocId,
              filename,
            },
          });
        }

        this.eventEmitter.emit("documentModified", {
          type: "documentModified",
          collectionId,
          documentId: zoteroDocId,
        });
      } catch (error) {
        // 如果更新失败且错误原因是文档不存在，尝试重新创建
        if (
          error instanceof Error &&
          (error.message.includes("not found") ||
            error.message.includes("文档不存在"))
        ) {
          Logger.warn({
            message: "Document not found when updating, will upload as new",
            context: this.ERROR_CONTEXT,
            data: { collectionId, zoteroDocId, ragflowDocId },
          });

          // 使用单文件上传API
          const newRagflowDocId = await ragflow.uploadSingleFile(
            config.datasetId,
            {
              path,
              name: filename,
              mimeType,
            },
          );

          // 更新ID映射
          this.setDocumentIdMapping(zoteroDocId, newRagflowDocId);

          Logger.info({
            message: "Document re-created in RAGFlow",
            context: this.ERROR_CONTEXT,
            data: {
              collectionId,
              zoteroDocId,
              oldRagflowDocId: ragflowDocId,
              newRagflowDocId,
              filename,
            },
          });

          this.eventEmitter.emit("documentModified", {
            type: "documentModified",
            collectionId,
            documentId: zoteroDocId,
          });
        } else {
          throw error; // 如果是其他错误，继续抛出
        }
      }
    } catch (error) {
      Logger.error({
        message: "Failed to handle document modification",
        context: this.ERROR_CONTEXT,
        error: error instanceof Error ? error : new Error(String(error)),
        data: {
          collectionId,
          zoteroDocId,
          errorDetails: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  private async handleCollectionModified(
    collection: any,
    config: SyncConfig,
  ): Promise<void> {
    try {
      // 获取集合的新名称
      const newName = collection.name;

      // 更新 RAGFlow 数据集
      await ragflow.updateDataset(config.datasetId, {
        name: newName,
      });

      Logger.info({
        message: "Collection renamed in RAGFlow",
        context: this.ERROR_CONTEXT,
        data: {
          collectionId: collection.id,
          newName,
          datasetId: config.datasetId,
        },
      });

      // 如果有必要，可以在这里添加事件发送
    } catch (error) {
      Logger.error({
        message: "Failed to handle collection modification",
        context: this.ERROR_CONTEXT,
        error: error instanceof Error ? error : new Error(String(error)),
        data: {
          collectionId: collection.id,
          datasetId: config.datasetId,
          errorDetails: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  private async handleCollectionDeleted(
    collectionId: string,
    config: SyncConfig,
  ): Promise<void> {
    try {
      // 从 RAGFlow 删除数据集
      await ragflow.deleteDataset(config.datasetId);

      // 从同步管理器移除配置
      this.syncManager.removeConfig(collectionId);

      Logger.info({
        message: "Collection deleted from RAGFlow",
        context: this.ERROR_CONTEXT,
        data: {
          collectionId,
          datasetId: config.datasetId,
        },
      });

      // 如果有必要，可以在这里添加事件发送
    } catch (error) {
      Logger.error({
        message: "Failed to handle collection deletion",
        context: this.ERROR_CONTEXT,
        error: error instanceof Error ? error : new Error(String(error)),
        data: {
          collectionId,
          datasetId: config.datasetId,
          errorDetails: error instanceof Error ? error.message : String(error),
        },
      });

      // 如果是因为数据集不存在导致的错误，只记录不抛出
      if (error instanceof Error && error.message.includes("not found")) {
        Logger.warn({
          message: "Dataset not found, already deleted or never created",
          context: this.ERROR_CONTEXT,
          data: { collectionId, datasetId: config.datasetId },
        });

        // 仍然需要移除配置
        this.syncManager.removeConfig(collectionId);
        return;
      }

      throw error;
    }
  }

  public on<T extends SyncEvent>(
    event: T["type"],
    callback: (event: T) => void,
  ): void {
    this.eventEmitter.on(event, callback);
  }

  public off<T extends SyncEvent>(
    event: T["type"],
    callback: (event: T) => void,
  ): void {
    this.eventEmitter.off(event, callback);
  }
}

export class SyncExecutor {
  private readonly ERROR_CONTEXT = "SyncExecutor";
  private taskQueue: TaskQueue;
  private resources = new Map<string, any>();
  private resourceStats: ResourceStats = {
    memoryUsage: 0,
    activeConnections: 0,
    pendingTasks: 0,
  };

  constructor() {
    this.taskQueue = new TaskQueue();
  }

  public async executeSyncTasks(
    tasks: Array<{ type: string; data: any }>,
    config: SyncConfig,
    options?: {
      onProgress?: (progress: TaskProgress) => void;
      onResourceUpdate?: (stats: ResourceStats) => void;
    },
  ): Promise<void> {
    try {
      const totalTasks = tasks.length;
      let completedTasks = 0;

      this.resourceStats.pendingTasks = totalTasks;
      options?.onResourceUpdate?.(this.resourceStats);

      Logger.info({
        message: "Starting sync task execution",
        context: this.ERROR_CONTEXT,
        data: {
          collectionId: config.collectionId,
          taskCount: totalTasks,
        },
      });

      for (const task of tasks) {
        const taskResourceKey = `${task.type}-${JSON.stringify(task.data)}`;

        await this.taskQueue.enqueue(
          async () => {
            // Track resource usage
            this.resourceStats.activeConnections++;
            options?.onResourceUpdate?.(this.resourceStats);

            try {
              // Register task resources for tracking
              this.resources.set(taskResourceKey, {
                startTime: Date.now(),
                type: task.type,
                data: task.data,
                connection: null,
                buffer: null,
              });

              await this.createSyncTask(task.type, task.data)();
              completedTasks++;

              // Report progress
              if (options?.onProgress) {
                options.onProgress({
                  current: completedTasks,
                  total: totalTasks,
                  percent: Math.round((completedTasks / totalTasks) * 100),
                  message: `完成任务 ${completedTasks}/${totalTasks}`,
                });
              }
            } finally {
              // Cleanup resources after task completion
              this.resourceStats.activeConnections--;
              this.resourceStats.pendingTasks--;
              options?.onResourceUpdate?.(this.resourceStats);
              await this.cleanupTaskResources(taskResourceKey);
            }
          },
          {
            id: `sync-task-${config.collectionId}-${Date.now()}`,
            priority: TaskPriority.Normal,
            onProgress: options?.onProgress,
          },
        );
      }

      Logger.info({
        message: "Sync task execution completed",
        context: this.ERROR_CONTEXT,
        data: {
          collectionId: config.collectionId,
          completedTasks,
          totalTasks,
        },
      });
    } finally {
      // Final cleanup
      await this.cleanupAllResources();
    }
  }

  /**
   * 清理任务相关资源
   */
  private async cleanupTaskResources(resourceKey: string): Promise<void> {
    try {
      const resource = this.resources.get(resourceKey);
      if (resource) {
        // Close any open connections
        if (resource.connection) {
          await resource.connection.close?.();
        }
        // Release any held memory
        if (resource.buffer) {
          resource.buffer = null;
        }
        this.resources.delete(resourceKey);

        // Update memory usage approximation
        this.updateMemoryUsage();

        Logger.debug({
          message: "Task resources cleaned up",
          context: this.ERROR_CONTEXT,
          data: {
            resourceKey,
            resourceType: resource.type,
            duration: Date.now() - resource.startTime,
          },
        });
      }
    } catch (error) {
      Logger.warn({
        message: "Failed to cleanup task resources",
        context: this.ERROR_CONTEXT,
        error: error instanceof Error ? error : new Error(String(error)),
        data: { resourceKey },
      });
    }
  }

  /**
   * 清理所有资源
   */
  private async cleanupAllResources(): Promise<void> {
    try {
      const resourceKeys = Array.from(this.resources.keys());

      Logger.info({
        message: "Cleaning up all resources",
        context: this.ERROR_CONTEXT,
        data: { resourceCount: resourceKeys.length },
      });

      for (const key of resourceKeys) {
        await this.cleanupTaskResources(key);
      }

      // Reset stats
      this.resourceStats = {
        memoryUsage: 0,
        activeConnections: 0,
        pendingTasks: 0,
      };
    } catch (error) {
      Logger.error({
        message: "Failed to cleanup all resources",
        context: this.ERROR_CONTEXT,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * 更新内存使用统计
   */
  private updateMemoryUsage(): void {
    // This is a simple approximation
    this.resourceStats.memoryUsage = this.resources.size * 1024; // Assume 1KB per resource
  }

  /**
   * 获取资源统计信息
   */
  public getResourceStats(): ResourceStats {
    return { ...this.resourceStats };
  }

  private createSyncTask(type: string, data: any): () => Promise<void> {
    switch (type) {
      case "add":
        return async () => {
          const { attachment, config } = data;
          const path = attachment.getFilePath();
          // 使用 attachmentFilename 属性替代弃用的 getFilename()
          const filename =
            attachment.attachmentFilename || attachment.getFilename();
          const mimeType = attachment.attachmentContentType;

          await ragflow.uploadFiles(
            [
              {
                path,
                name: filename,
                mimeType,
              },
            ],
            config.datasetId,
          );
        };
      case "delete":
        return async () => {
          await ragflow.deleteDocument(data.datasetId, data.documentId);
        };
      case "modify":
        return async () => {
          const { attachment, config, documentId } = data;
          const path = attachment.getFilePath();
          const filename =
            attachment.attachmentFilename || attachment.getFilename();
          const mimeType = attachment.attachmentContentType;

          // 检查文件类型是否支持
          const isHTML =
            mimeType === "text/html" ||
            path.toLowerCase().endsWith(".html") ||
            path.toLowerCase().endsWith(".htm");
          const isSnapshot =
            filename.includes("Snapshot") || path.includes("Snapshot");

          if (isHTML || isSnapshot) {
            Logger.warn({
              message:
                "Skipping unsupported file type for RAGFlow in sync task",
              context: this.ERROR_CONTEXT,
              data: { mimeType, filename, isHTML, isSnapshot, documentId },
            });
            return; // 直接返回，不处理不支持的文件类型
          }

          try {
            // 使用新的updateDocument方法更新文档
            await ragflow.updateDocument(
              config.datasetId,
              documentId,
              path,
              filename,
              mimeType,
            );
          } catch (error) {
            // 如果文档不存在，尝试作为新文件上传
            if (
              error instanceof Error &&
              (error.message.includes("not found") ||
                error.message.includes("文档不存在"))
            ) {
              Logger.warn({
                message:
                  "Document not found when updating in sync task, will upload as new",
                context: this.ERROR_CONTEXT,
                data: { documentId },
              });
              await ragflow.uploadFiles(
                [{ path, name: filename, mimeType }],
                config.datasetId,
              );
            } else {
              throw error; // 如果是其他错误，继续抛出
            }
          }
        };
      default:
        throw new Error(`Unknown sync task type: ${type}`);
    }
  }
}

// Export singleton instances
export const syncManager = new SyncManager();
export const collectionWatcher = new CollectionWatcher(syncManager);
