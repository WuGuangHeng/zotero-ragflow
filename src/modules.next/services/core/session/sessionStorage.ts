import { Logger } from "../../../services/logger";
import { Session, ChatMessage } from "./types";
import { HybridStorage } from "./hybridStorage";
import { StorageError, StorageErrorType } from "./errors";

// 声明全局变量以避免TypeScript错误
declare const OS: any;
declare const IOUtils: any;

// Session类型去除messages字段
export type SessionMetadata = Omit<Session, "messages">;

/**
 * 会话存储类
 * 使用混合模式：
 * - 会话元数据存储在Prefs中
 * - 会话消息存储在文件系统中
 * - 如果文件系统访问失败，则仅使用内存存储
 */
export class SessionStorage extends HybridStorage<SessionMetadata> {
  private readonly messagesDir: string;
  // 当文件存储失败时的备选内存存储
  private memoryMessageStorage: Map<string, ChatMessage[]> = new Map();
  // 标记是否已尝试创建目录
  private hasTriedDirCreation: boolean = false;
  // 标记文件系统是否可用
  private isFileSystemAvailable: boolean = true;

  constructor(
    config: {
      storageKey?: string;
      baseDir?: string;
      maxSessions?: number;
    } = {},
  ) {
    super(
      config.storageKey || "ragflow.sessions",
      config.baseDir || "ragflow/sessions",
    );

    this.messagesDir = "ragflow/messages";
  }

  /**
   * 初始化存储
   */
  public async init(): Promise<void> {
    try {
      await super.init();

      // 确保消息目录存在 - 使用更健壮的方式
      try {
        await this.ensureMessagesDirectory();
      } catch (dirError) {
        // 仅记录错误，但允许继续初始化
        this.isFileSystemAvailable = false;
        Logger.warn({
          message:
            "Failed to create message directory, proceeding with in-memory only",
          context: "SessionStorage",
          error: dirError as Error,
        });
      }
    } catch (error) {
      Logger.error({
        message: "Failed to initialize session storage",
        context: "SessionStorage",
        error: error as Error,
      });
      throw new StorageError(StorageErrorType.INIT_FAILED);
    }
  }

  /**
   * 检查IOUtils是否可用
   */
  private isIOUtilsAvailable(): boolean {
    return typeof IOUtils !== "undefined" && IOUtils !== null;
  }

  /**
   * 检查是否运行在Windows系统上
   */
  private isWindowsPlatform(): boolean {
    try {
      // 尝试使用Zotero自带的平台检测方法
      if (Zotero.platform) {
        return Zotero.platform === "win";
      }

      // 备选方法：检查路径分隔符
      const osAPI = this.getOSAPI();
      if (osAPI && osAPI.Path && osAPI.Path.sep) {
        return osAPI.Path.sep === "\\";
      }

      // 第三种方法：检查Zotero.isWin
      if (typeof Zotero.isWin !== "undefined") {
        return !!Zotero.isWin;
      }
    } catch (e) {
      // 忽略任何错误
    }

    // 保守起见，默认不是Windows
    return false;
  }

  /**
   * 获取OS API对象，统一处理以避免重复声明
   */
  private getOSAPI(): any {
    // 尝试不同的方式获取OS对象
    if (Zotero.OS && Zotero.OS.Path && Zotero.OS.File) {
      return Zotero.OS;
    }

    // 尝试全局OS变量
    try {
      if (typeof OS !== "undefined" && OS && OS.Path && OS.File) {
        return OS;
      }
    } catch (e) {
      // 忽略错误
    }

    // 尝试从主窗口获取
    try {
      const mainWindow =
        (Zotero.getMainWindow && Zotero.getMainWindow()) ||
        (Zotero.getZoteroWindow && Zotero.getZoteroWindow());
      if (mainWindow && mainWindow.OS) {
        return mainWindow.OS;
      }
    } catch (e) {
      // 忽略错误
    }

    return null;
  }

  /**
   * 确保路径格式正确（处理Windows平台的特殊要求）
   */
  private normalizePath(path: string): string {
    const isWindows = this.isWindowsPlatform();

    // 对Windows平台做特殊处理
    if (isWindows) {
      // 确保所有斜杠是反斜杠
      return path.replace(/\//g, "\\");
    }

    // 其他平台使用正斜杠
    return path.replace(/\\/g, "/");
  }

  /**
   * 安全地连接路径片段
   */
  private joinPaths(...parts: string[]): string {
    const osAPI = this.getOSAPI();

    // 优先使用OS.Path.join，这是最可靠的
    if (osAPI && osAPI.Path && osAPI.Path.join) {
      return osAPI.Path.join(...parts);
    }

    // 创建合适的路径
    const isWindows = this.isWindowsPlatform();
    const separator = isWindows ? "\\" : "/";

    // 规范化并合并路径
    const normalizedParts = parts
      .map((part) =>
        part.replace(/[\/\\]+/g, separator).replace(/^[\/\\]+|[\/\\]+$/g, ""),
      )
      .filter(Boolean);

    return normalizedParts.join(separator);
  }

  /**
   * 确保消息目录存在
   */
  private async ensureMessagesDirectory(): Promise<void> {
    if (this.hasTriedDirCreation) {
      return; // 避免反复尝试创建目录
    }

    this.hasTriedDirCreation = true;

    try {
      // 获取Zotero数据目录
      const dataDir = this.getSafeDataDirectory();
      if (!dataDir) {
        this.isFileSystemAvailable = false;
        Logger.warn({
          message: "Zotero data directory not available",
          context: "SessionStorage",
        });
        return;
      }

      // 构建消息目录路径，确保格式正确
      const messagesPath = this.joinPaths(dataDir, this.messagesDir);
      const normalizedPath = this.normalizePath(messagesPath);

      // 方法1: 优先使用IOUtils (推荐的新API)
      if (this.isIOUtilsAvailable()) {
        try {
          await IOUtils.makeDirectory(normalizedPath, {
            createAncestors: true,
            ignoreExisting: true,
          });

          Logger.debug({
            message: "Messages directory created using IOUtils",
            context: "SessionStorage",
            data: { messagesDir: normalizedPath },
          });
          return;
        } catch (e) {
          Logger.warn({
            message: "Failed to create directory with IOUtils: " + String(e),
            context: "SessionStorage",
          });
        }
      }

      // 方法2: 尝试使用OS API
      const osAPI = this.getOSAPI();
      if (osAPI && osAPI.File && osAPI.File.makeDir) {
        try {
          await osAPI.File.makeDir(normalizedPath, {
            ignoreExisting: true,
            from: dataDir,
          });
          Logger.debug({
            message: "Messages directory created using OS API",
            context: "SessionStorage",
            data: { dirPath: normalizedPath },
          });
          return;
        } catch (e) {
          Logger.warn({
            message: "Failed to create directory with OS API: " + String(e),
            context: "SessionStorage",
          });
        }
      }

      // 方法3: 使用Zotero.File API作为最后的尝试
      if (Zotero.File && Zotero.File.createDirectoryIfMissing) {
        try {
          Zotero.File.createDirectoryIfMissing(normalizedPath);

          Logger.debug({
            message: "Messages directory created using Zotero.File API",
            context: "SessionStorage",
            data: { messagesDir: normalizedPath },
          });
          return;
        } catch (e) {
          Logger.warn({
            message:
              "Failed to create directory with Zotero.File API: " + String(e),
            context: "SessionStorage",
          });
        }
      }

      this.isFileSystemAvailable = false;
      Logger.warn({
        message: "No suitable API found for directory creation",
        context: "SessionStorage",
      });
    } catch (error) {
      this.isFileSystemAvailable = false;
      Logger.error({
        message: "Failed to ensure messages directory",
        context: "SessionStorage",
        error: error as Error,
      });
      // 不抛出异常，继续操作
    }
  }

  /**
   * 安全获取Zotero数据目录
   */
  private getSafeDataDirectory(): string | null {
    try {
      // 尝试各种可能的数据目录API
      if (Zotero.DataDirectory && Zotero.DataDirectory.dir) {
        return Zotero.DataDirectory.dir;
      }

      if (Zotero.getZoteroDirectory && Zotero.getZoteroDirectory().path) {
        return Zotero.getZoteroDirectory().path;
      }

      if (Zotero.Profile && Zotero.Profile.dir) {
        return Zotero.Profile.dir;
      }

      // 尝试其他可能的方式获取数据目录
      try {
        if (Zotero.Prefs && Zotero.Prefs.get) {
          // 检查是否有存储的数据目录路径
          const prefDir = Zotero.Prefs.get("dataDir");
          if (prefDir) {
            return prefDir;
          }
        }
      } catch (e) {
        // 忽略错误
      }

      return null;
    } catch (e) {
      Logger.warn({
        message: "Failed to get data directory: " + String(e),
        context: "SessionStorage",
      });
      return null;
    }
  }

  /**
   * 检查文件是否存在 (使用多种API尝试)
   */
  private async fileExists(path: string): Promise<boolean> {
    if (!this.isFileSystemAvailable) {
      return false;
    }

    try {
      // 规范化路径
      const normalizedPath = this.normalizePath(path);

      // 方法1: 使用IOUtils
      if (this.isIOUtilsAvailable()) {
        try {
          return await IOUtils.exists(normalizedPath);
        } catch (e) {
          // 继续尝试其他方法
        }
      }

      // 方法2: 使用OS.File
      const osAPI = this.getOSAPI();
      if (osAPI && osAPI.File && osAPI.File.exists) {
        try {
          return await osAPI.File.exists(normalizedPath);
        } catch (e) {
          // 继续尝试其他方法
        }
      }

      // 方法3: 使用Zotero.File
      try {
        if (Zotero.File) {
          // 不同版本的Zotero可能有不同的API
          if (typeof Zotero.File.exists === "function") {
            return Zotero.File.exists(normalizedPath);
          } else if (typeof Zotero.File.existsAsync === "function") {
            return await Zotero.File.existsAsync(normalizedPath);
          }
        }
      } catch (e) {
        // 继续尝试其他方法
      }

      // 方法4: 尝试通过读取文件来检查
      try {
        if (Zotero.File && Zotero.File.getContents) {
          Zotero.File.getContents(normalizedPath);
          return true;
        }
      } catch (e) {
        return false;
      }

      return false;
    } catch (e) {
      return false;
    }
  }

  /**
   * 获取所有会话（不含消息）
   */
  public async getSessions(): Promise<SessionMetadata[]> {
    const sessions = await this.getAll();
    return sessions.sort((a, b) => b.updated - a.updated);
  }

  /**
   * 获取完整会话（含消息）
   */
  public async getSession(sessionId: string): Promise<Session | null> {
    try {
      const sessionMeta = await this.get(sessionId);
      if (!sessionMeta) return null;

      const messages = await this.loadSessionMessages(sessionId);

      return {
        ...sessionMeta,
        messages,
      };
    } catch (error) {
      Logger.error({
        message: "Failed to get session",
        context: "SessionStorage",
        error: error as Error,
        data: { sessionId },
      });
      throw new StorageError(StorageErrorType.READ_FAILED);
    }
  }

  /**
   * 按助手ID获取会话
   */
  public async getSessionsByAssistant(
    assistantId: string,
  ): Promise<SessionMetadata[]> {
    const sessions = await this.getAll();
    return sessions
      .filter((session) => session.assistantId === assistantId)
      .sort((a, b) => b.updated - a.updated);
  }

  /**
   * 按知识库ID获取会话
   */
  public async getSessionsByKnowledgeBase(
    knowledgeBaseId: string,
  ): Promise<SessionMetadata[]> {
    const sessions = await this.getAll();
    return sessions
      .filter((session) => session.knowledgeBaseId === knowledgeBaseId)
      .sort((a, b) => b.updated - a.updated);
  }

  /**
   * 保存会话
   */
  public async saveSession(session: Session): Promise<void> {
    try {
      // 分离会话元数据和消息
      const { messages, ...sessionMeta } = session;

      // 记录调试信息
      Logger.debug({
        message: "Saving session metadata",
        context: "SessionStorage",
        data: { sessionId: session.id },
      });

      try {
        // 保存元数据到Prefs并立即同步
        await this.save(
          { ...sessionMeta, updated: Date.now() },
          true, // 立即同步
        );
      } catch (metadataError) {
        Logger.error({
          message: "Failed to save session metadata",
          context: "SessionStorage",
          error: metadataError as Error,
          data: { sessionId: session.id },
        });
        throw metadataError;
      }

      try {
        // 保存消息到文件
        await this.saveSessionMessages(session.id, messages);
      } catch (messagesError) {
        // 如果只是消息保存失败，记录警告但继续执行
        Logger.warn({
          message: "Failed to save session messages, but metadata saved",
          context: "SessionStorage",
          data: { sessionId: session.id },
        });
        // 不抛出异常，会话元数据更重要
      }

      Logger.info({
        message: "Session saved successfully",
        context: "SessionStorage",
        data: {
          sessionId: session.id,
          messageCount: messages.length,
        },
      });
    } catch (error) {
      Logger.error({
        message: "Failed to save session",
        context: "SessionStorage",
        error: error as Error,
        data: {
          sessionId: session.id,
          errorMsg: error instanceof Error ? error.message : String(error),
        },
      });
      throw new StorageError(StorageErrorType.WRITE_FAILED);
    }
  }

  /**
   * 删除会话
   */
  public async deleteSession(sessionId: string): Promise<void> {
    try {
      // 从Prefs删除元数据
      const deleted = await this.delete(sessionId);

      if (!deleted) {
        throw new StorageError(
          StorageErrorType.DELETE_FAILED,
          `Session not found: ${sessionId}`,
        );
      }

      try {
        // 删除消息文件
        await this.deleteSessionMessages(sessionId);
      } catch (e) {
        // 只记录警告，不影响删除操作
        Logger.warn({
          message:
            "Could not delete message file, but session metadata was removed",
          context: "SessionStorage",
          error: e as Error,
        });
      }

      // 如果使用了内存存储，也要清理
      this.memoryMessageStorage.delete(sessionId);

      // 立即同步元数据删除
      await this.sync();

      Logger.info({
        message: "Session deleted",
        context: "SessionStorage",
        data: { sessionId },
      });
    } catch (error) {
      Logger.error({
        message: "Failed to delete session",
        context: "SessionStorage",
        error: error as Error,
        data: { sessionId },
      });
      throw new StorageError(StorageErrorType.DELETE_FAILED);
    }
  }

  /**
   * 添加消息到会话
   */
  public async addMessage(
    sessionId: string,
    message: ChatMessage,
  ): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new StorageError(
          StorageErrorType.NOT_FOUND,
          `Session not found: ${sessionId}`,
        );
      }

      // 添加消息
      session.messages.push(message);
      session.updated = Date.now();

      // 保存更新后的会话
      await this.saveSession(session);

      Logger.info({
        message: "Message added to session",
        context: "SessionStorage",
        data: { sessionId, messageId: message.id },
      });
    } catch (error) {
      Logger.error({
        message: "Failed to add message",
        context: "SessionStorage",
        error: error as Error,
        data: { sessionId, messageId: message.id },
      });
      throw new StorageError(StorageErrorType.WRITE_FAILED);
    }
  }

  /**
   * 清空所有数据
   */
  public async clear(): Promise<void> {
    try {
      // 清空Prefs中的元数据
      await super.clear();

      // 清空内存存储
      this.memoryMessageStorage.clear();

      // 仅在文件系统可用时尝试清理文件
      if (this.isFileSystemAvailable) {
        try {
          const dataDir = this.getSafeDataDirectory();
          if (dataDir) {
            const messagesDir = this.joinPaths(dataDir, this.messagesDir);
            const normalizedDir = this.normalizePath(messagesDir);

            // 方法1: 使用IOUtils
            if (this.isIOUtilsAvailable()) {
              try {
                const children = await IOUtils.getChildren(normalizedDir);
                for (const childPath of children) {
                  if (childPath.endsWith(".json")) {
                    await IOUtils.remove(childPath);
                  }
                }
                Logger.debug({
                  message: "Cleared files using IOUtils",
                  context: "SessionStorage",
                });
                // 立即同步清空操作
                await this.sync();
                return;
              } catch (e) {
                Logger.warn({
                  message: "Failed to clear files using IOUtils",
                  context: "SessionStorage",
                  error: e as Error,
                });
              }
            }

            // 方法2: 使用Zotero.File API
            try {
              if (
                Zotero.File &&
                typeof Zotero.File.getDirectoryEntries === "function"
              ) {
                const files = Zotero.File.getDirectoryEntries(normalizedDir);
                for (const file of files) {
                  if (file.endsWith(".json")) {
                    try {
                      const filePath = this.joinPaths(messagesDir, file);
                      const normalizedFilePath = this.normalizePath(filePath);
                      if (typeof Zotero.File.remove === "function") {
                        Zotero.File.remove(normalizedFilePath);
                      }
                    } catch (e) {
                      // 忽略单个文件删除失败
                    }
                  }
                }
                Logger.debug({
                  message: "Cleared files using Zotero.File API",
                  context: "SessionStorage",
                });
              }
            } catch (e) {
              Logger.warn({
                message: "Failed to clear files using Zotero.File API",
                context: "SessionStorage",
                error: e as Error,
              });
            }

            // 方法3: 使用OS.File API
            const osAPI = this.getOSAPI();
            if (osAPI && osAPI.Path && osAPI.File) {
              try {
                const entries =
                  await osAPI.File.DirectoryIterator.iterate(normalizedDir);
                for await (const entry of entries) {
                  if (!entry.isDir && entry.name.endsWith(".json")) {
                    try {
                      await osAPI.File.remove(entry.path);
                    } catch (e) {
                      // 忽略单个文件删除失败
                    }
                  }
                }
                Logger.debug({
                  message: "Cleared files using OS.File API",
                  context: "SessionStorage",
                });
              } catch (e) {
                Logger.warn({
                  message: "Failed to clear files using OS.File API",
                  context: "SessionStorage",
                  error: e as Error,
                });
              }
            }
          }
        } catch (ioError) {
          Logger.warn({
            message: "Failed to clear message files",
            context: "SessionStorage",
            error: ioError as Error,
          });
        }
      }

      // 立即同步清空操作
      await this.sync();

      Logger.info({
        message: "Session storage cleared",
        context: "SessionStorage",
      });
    } catch (error) {
      Logger.error({
        message: "Failed to clear session storage",
        context: "SessionStorage",
        error: error as Error,
      });
      throw new StorageError(StorageErrorType.CLEAR_FAILED);
    }
  }

  /**
   * 加载会话消息
   */
  private async loadSessionMessages(sessionId: string): Promise<ChatMessage[]> {
    try {
      if (!sessionId) {
        Logger.warn({
          message: "Attempted to load messages with invalid session ID",
          context: "SessionStorage",
        });
        return [];
      }

      // 首先尝试从内存加载
      if (this.memoryMessageStorage.has(sessionId)) {
        Logger.debug({
          message: "Loaded messages from memory storage",
          context: "SessionStorage",
          data: { sessionId },
        });
        return this.memoryMessageStorage.get(sessionId) || [];
      }

      // 如果文件系统不可用，直接返回空数组
      if (!this.isFileSystemAvailable) {
        return [];
      }

      // 尝试从文件系统加载
      const dataDir = this.getSafeDataDirectory();
      if (!dataDir) {
        return [];
      }

      // 构建文件路径并规范化
      const filePath = this.joinPaths(
        dataDir,
        this.messagesDir,
        `${sessionId}.json`,
      );
      const normalizedPath = this.normalizePath(filePath);

      // 检查文件是否存在
      const exists = await this.fileExists(normalizedPath);
      if (!exists) {
        return [];
      }

      // 方法1: 使用IOUtils
      if (this.isIOUtilsAvailable()) {
        try {
          const messages = await IOUtils.readJSON(normalizedPath);
          return messages;
        } catch (e) {
          Logger.warn({
            message: "Failed to load with IOUtils.readJSON: " + String(e),
            context: "SessionStorage",
          });
        }
      }

      // 方法2: 使用Zotero.File.getContents
      try {
        if (Zotero.File && typeof Zotero.File.getContents === "function") {
          const content = Zotero.File.getContents(normalizedPath);
          if (content) {
            return JSON.parse(content);
          }
        }
      } catch (e) {
        Logger.warn({
          message: "Failed to load with Zotero.File.getContents: " + String(e),
          context: "SessionStorage",
        });
      }

      // 方法3: 使用Zotero.File.getContentsAsync
      try {
        if (Zotero.File && typeof Zotero.File.getContentsAsync === "function") {
          const content = await Zotero.File.getContentsAsync(normalizedPath);
          if (content) {
            return JSON.parse(content);
          }
        }
      } catch (e) {
        Logger.warn({
          message:
            "Failed to load with Zotero.File.getContentsAsync: " + String(e),
          context: "SessionStorage",
        });
      }

      // 方法4: 使用OS.File
      const osAPI = this.getOSAPI();
      if (osAPI && osAPI.File && osAPI.File.read) {
        try {
          const array = await osAPI.File.read(normalizedPath);
          const decoder = new TextDecoder();
          const content = decoder.decode(array);
          if (content) {
            return JSON.parse(content);
          }
        } catch (e) {
          Logger.warn({
            message: "Failed to load with OS.File.read: " + String(e),
            context: "SessionStorage",
          });
        }
      }

      return [];
    } catch (error) {
      Logger.warn({
        message: "Failed to load session messages, returning empty array",
        context: "SessionStorage",
        error: error as Error,
        data: { sessionId },
      });
      return [];
    }
  }

  /**
   * 保存会话消息
   */
  private async saveSessionMessages(
    sessionId: string,
    messages: ChatMessage[],
  ): Promise<void> {
    try {
      if (!sessionId) {
        throw new Error("Invalid session ID");
      }

      // 总是先保存到内存，确保数据不会丢失
      this.memoryMessageStorage.set(sessionId, [...messages]);

      // 如果文件系统不可用，就只使用内存存储
      if (!this.isFileSystemAvailable) {
        Logger.debug({
          message:
            "Messages saved to memory storage only (file system unavailable)",
          context: "SessionStorage",
          data: { sessionId, messageCount: messages.length },
        });
        return;
      }

      // 确保目录存在
      await this.ensureMessagesDirectory();

      // 序列化消息
      let content;
      try {
        content = JSON.stringify(messages);
      } catch (jsonError) {
        Logger.error({
          message: "Failed to stringify messages",
          context: "SessionStorage",
          error: jsonError as Error,
          data: { messageCount: messages.length },
        });
        throw jsonError;
      }

      const dataDir = this.getSafeDataDirectory();
      if (!dataDir) {
        throw new Error("Could not determine data directory");
      }

      // 构建文件路径
      const filePath = this.joinPaths(
        dataDir,
        this.messagesDir,
        `${sessionId}.json`,
      );
      const normalizedPath = this.normalizePath(filePath);

      // 方法1: 使用IOUtils
      if (this.isIOUtilsAvailable()) {
        try {
          await IOUtils.writeJSON(normalizedPath, messages, {
            compressed: false,
          });
          Logger.debug({
            message: "Session messages saved with IOUtils.writeJSON",
            context: "SessionStorage",
            data: { sessionId, messageCount: messages.length },
          });
          return;
        } catch (e) {
          Logger.warn({
            message: "Failed to save with IOUtils.writeJSON: " + String(e),
            context: "SessionStorage",
          });
        }
      }

      // 方法2: 使用Zotero.File.putContentsAsync
      try {
        if (Zotero.File && typeof Zotero.File.putContentsAsync === "function") {
          await Zotero.File.putContentsAsync(normalizedPath, content);
          Logger.debug({
            message: "Session messages saved with Zotero.File.putContentsAsync",
            context: "SessionStorage",
            data: { sessionId, messageCount: messages.length },
          });
          return;
        }
      } catch (e) {
        Logger.warn({
          message:
            "Failed to save with Zotero.File.putContentsAsync: " + String(e),
          context: "SessionStorage",
        });
      }

      // 方法3: 使用Zotero.File.putContents
      try {
        if (Zotero.File && typeof Zotero.File.putContents === "function") {
          Zotero.File.putContents(normalizedPath, content);
          Logger.debug({
            message: "Session messages saved with Zotero.File.putContents",
            context: "SessionStorage",
            data: { sessionId, messageCount: messages.length },
          });
          return;
        }
      } catch (e) {
        Logger.warn({
          message: "Failed to save with Zotero.File.putContents: " + String(e),
          context: "SessionStorage",
        });
      }

      // 方法4: 使用OS.File
      const osAPI = this.getOSAPI();
      if (osAPI && osAPI.File && osAPI.File.writeAtomic) {
        try {
          const encoder = new TextEncoder();
          const array = encoder.encode(content);
          await osAPI.File.writeAtomic(normalizedPath, array, { flush: true });
          Logger.debug({
            message: "Session messages saved with OS.File.writeAtomic",
            context: "SessionStorage",
            data: { sessionId, messageCount: messages.length },
          });
          return;
        } catch (e) {
          Logger.warn({
            message: "Failed to save with OS.File.writeAtomic: " + String(e),
            context: "SessionStorage",
          });
        }
      }

      // 所有尝试都失败，但我们已经保存到内存了，所以记录警告但不抛出异常
      Logger.warn({
        message:
          "Could not save messages to file system, using memory storage only",
        context: "SessionStorage",
        data: { sessionId },
      });
    } catch (error) {
      Logger.error({
        message: "Failed to save session messages",
        context: "SessionStorage",
        error: error as Error,
        data: { sessionId },
      });
      throw new StorageError(StorageErrorType.WRITE_FAILED);
    }
  }

  /**
   * 删除会话消息
   */
  private async deleteSessionMessages(sessionId: string): Promise<void> {
    try {
      // 从内存中删除
      this.memoryMessageStorage.delete(sessionId);

      // 如果文件系统不可用，就不尝试操作文件
      if (!this.isFileSystemAvailable) {
        return;
      }

      const dataDir = this.getSafeDataDirectory();
      if (!dataDir) return;

      // 构建文件路径
      const filePath = this.joinPaths(
        dataDir,
        this.messagesDir,
        `${sessionId}.json`,
      );
      const normalizedPath = this.normalizePath(filePath);

      // 检查文件是否存在
      const exists = await this.fileExists(normalizedPath);
      if (!exists) {
        return; // 文件不存在，无需删除
      }

      // 方法1: 使用IOUtils
      if (this.isIOUtilsAvailable()) {
        try {
          await IOUtils.remove(normalizedPath);
          Logger.debug({
            message: "Session messages file deleted using IOUtils.remove",
            context: "SessionStorage",
            data: { sessionId },
          });
          return;
        } catch (e) {
          Logger.warn({
            message: "Failed to delete with IOUtils.remove: " + String(e),
            context: "SessionStorage",
          });
        }
      }

      // 方法2: 使用Zotero.File.remove
      try {
        if (Zotero.File && typeof Zotero.File.remove === "function") {
          Zotero.File.remove(normalizedPath);
          Logger.debug({
            message: "Session messages file deleted using Zotero.File.remove",
            context: "SessionStorage",
            data: { sessionId },
          });
          return;
        }
      } catch (e) {
        Logger.warn({
          message: "Failed to delete with Zotero.File.remove: " + String(e),
          context: "SessionStorage",
        });
      }

      // 方法3: 使用OS.File.remove
      const osAPI = this.getOSAPI();
      if (osAPI && osAPI.File && osAPI.File.remove) {
        try {
          await osAPI.File.remove(normalizedPath);
          Logger.debug({
            message: "Session messages file deleted using OS.File.remove",
            context: "SessionStorage",
            data: { sessionId, filePath: normalizedPath },
          });
          return;
        } catch (e) {
          Logger.warn({
            message: "Failed to delete with OS.File.remove: " + String(e),
            context: "SessionStorage",
          });
        }
      }

      Logger.warn({
        message: "No suitable method found to delete message file",
        context: "SessionStorage",
        data: { sessionId, filePath: normalizedPath },
      });
    } catch (error) {
      Logger.warn({
        message: "Failed to delete session messages",
        context: "SessionStorage",
        error: error as Error,
        data: { sessionId },
      });
      // 不抛出异常，因为元数据已经删除
    }
  }
}
