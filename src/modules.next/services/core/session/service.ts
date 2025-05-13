import { Logger } from "../../../services/logger";
import { SessionStorage } from "./sessionStorage";
import { AssistantStorage } from "./assistantStorage";
import {
  Assistant,
  Session,
  ChatMessage,
  SessionServiceConfig,
  AssistantSettings,
} from "./types";
import { SessionError, ErrorType } from "./errors";
import { ragflow } from "../../../services/ragflow";

export class SessionService {
  // 静态常量：会话名称前缀
  private static readonly SESSION_NAME_PREFIX = "Zotero会话";
  private static readonly SESSION_NAME_SEPARATOR = "_";
  private static readonly SESSION_NAME_RETRY_SUFFIX = "重试";

  /**
   * 创建标准会话名称
   * @param baseName 基础名称，如果不提供则使用默认前缀
   * @param isRetry 是否是重试创建的会话
   * @returns 格式化的会话名称
   */
  public static createSessionName(baseName?: string, isRetry = false): string {
    const timestamp = Date.now();
    const base = baseName || this.SESSION_NAME_PREFIX;

    if (isRetry) {
      return `${base}${this.SESSION_NAME_SEPARATOR}${this.SESSION_NAME_RETRY_SUFFIX}${this.SESSION_NAME_SEPARATOR}${timestamp}`;
    }

    return `${base}${this.SESSION_NAME_SEPARATOR}${timestamp}`;
  }

  /**
   * 判断是否已经是标准会话名称格式（包含时间戳分隔符）
   * @param name 会话名称
   * @returns 是否为标准格式
   */
  public static isStandardSessionName(name: string): boolean {
    return name.includes(this.SESSION_NAME_SEPARATOR);
  }

  private static instance: SessionService;
  private storage: SessionStorage;
  private assistantStorage: AssistantStorage;
  private config: SessionServiceConfig;
  private autoSaveTimer?: ReturnType<typeof setInterval>;

  private constructor(config: SessionServiceConfig = {}) {
    this.config = {
      storageKey: "ragflow.sessions",
      assistantStorageKey: "ragflow.assistants",
      maxSessions: 100,
      maxAssistants: 20,
      maxMessagesPerSession: 1000,
      autoSave: true,
      autoSaveInterval: 60000,
      ...config,
    };

    this.storage = new SessionStorage({
      storageKey: this.config.storageKey,
      maxSessions: this.config.maxSessions,
    });

    this.assistantStorage = new AssistantStorage({
      prefsKey: this.config.assistantStorageKey,
    });
  }

  public static getInstance(config?: SessionServiceConfig): SessionService {
    if (!SessionService.instance) {
      SessionService.instance = new SessionService(config);
    }
    return SessionService.instance;
  }

  /**
   * 初始化服务
   */
  public async init(): Promise<void> {
    try {
      await this.storage.init();
      await this.assistantStorage.init();

      if (this.config.autoSave) {
        this.startAutoSave();
      }

      Logger.info({
        message: "Session service initialized",
        context: "SessionService",
      });
    } catch (error) {
      Logger.error({
        message: "Failed to initialize session service",
        context: "SessionService",
        error: error as Error,
      });
      throw error;
    }
  }

  /**
   * 获取或创建知识库对应的助手
   */
  public async getOrCreateAssistant(
    knowledgeBaseId: string,
    knowledgeBaseName: string,
    params?: {
      name?: string;
      settings?: Partial<AssistantSettings>;
    },
  ): Promise<Assistant> {
    try {
      // 验证输入参数
      if (!knowledgeBaseId) {
        throw new Error("Knowledge base ID is required");
      }

      // 尝试获取现有助手
      let assistant =
        await this.assistantStorage.getAssistantByKnowledgeBase(
          knowledgeBaseId,
        );

      // 如果新存储中没有找到，尝试从旧格式中查找
      if (!assistant) {
        try {
          const legacyAssistantId = Zotero.Prefs.get(
            `zotero-ragflow.chatAssistant.${knowledgeBaseId}`,
            true,
          ) as string;

          if (legacyAssistantId) {
            Logger.debug({
              message: "Found legacy assistant ID in preferences",
              context: "SessionService",
              data: { legacyAssistantId, knowledgeBaseId },
            });

            try {
              // 验证旧助手是否存在
              const details =
                await ragflow.getChatAssistantDetails(legacyAssistantId);

              // 如果存在，创建一个新的本地记录
              assistant = {
                id: legacyAssistantId,
                name: details.name || `${knowledgeBaseName}的AI助手`,
                knowledgeBaseId,
                knowledgeBaseName,
                created: Date.now(),
                updated: Date.now(),
                settings: {
                  model: details.llm?.model_name || "qwen-turbo",
                  temperature: details.llm?.temperature || 0.7,
                  top_p: details.llm?.top_p || 0.95,
                  max_tokens: details.llm?.max_tokens || 4000,
                  similarity_threshold:
                    details.prompt?.similarity_threshold || 0.2,
                  top_n: details.prompt?.top_n || 5,
                },
              };

              // 保存到新存储中
              await this.assistantStorage.saveAssistant(assistant);

              Logger.info({
                message: "Migrated assistant from legacy format",
                context: "SessionService",
                data: { assistantId: assistant.id, knowledgeBaseId },
              });
            } catch (error) {
              // 助手不存在或无法访问，将创建新助手
              Logger.warn({
                message: "Legacy assistant not found or inaccessible",
                context: "SessionService",
                data: { legacyAssistantId },
              });
            }
          }
        } catch (e) {
          // 忽略旧格式查询错误
          Logger.debug({
            message: "Error accessing legacy assistant storage",
            context: "SessionService",
            error: e as Error,
          });
        }
      }

      if (assistant) {
        Logger.info({
          message: "Using existing assistant",
          context: "SessionService",
          data: { assistantId: assistant.id, knowledgeBaseId },
        });
        return assistant;
      }

      // 创建新助手
      // 添加时间戳以避免命名冲突
      const timestamp = Date.now().toString().slice(-6);
      const assistantName =
        params?.name || `${knowledgeBaseName}的AI助手_${timestamp}`;

      // 默认设置
      const defaultSettings: AssistantSettings = {
        model: "qwen-turbo",
        temperature: 0.7,
        top_p: 0.95,
        max_tokens: 4000,
        similarity_threshold: 0.2,
        top_n: 5,
      };

      // 尝试从用户设置中获取默认模型
      try {
        const savedSettingsStr = Zotero.Prefs.get(
          `zotero-ragflow.defaultAssistantSettings`,
          true,
        ) as string;

        if (savedSettingsStr) {
          try {
            const savedSettings = JSON.parse(savedSettingsStr);
            if (savedSettings.model) {
              defaultSettings.model = savedSettings.model;
              Logger.debug({
                message: "Using user-defined default model",
                context: "SessionService",
                data: { model: defaultSettings.model },
              });
            }
          } catch (e) {
            Logger.warn({
              message: "Failed to parse default assistant settings",
              context: "SessionService",
              error: e as Error,
            });
          }
        }
      } catch (e) {
        // 忽略获取默认模型错误
      }

      // 合并设置
      const settings = {
        ...defaultSettings,
        ...params?.settings,
      };

      Logger.debug({
        message: "Creating new assistant",
        context: "SessionService",
        data: {
          knowledgeBaseId,
          assistantName,
          modelSettings: settings,
        },
      });

      // 创建RAGFlow聊天助手
      const chatId = await ragflow.createChatAssistant(
        knowledgeBaseId,
        assistantName,
        {
          model: settings.model,
          temperature: settings.temperature,
          top_p: settings.top_p,
          max_tokens: settings.max_tokens,
          similarity_threshold: settings.similarity_threshold,
          top_n: settings.top_n,
        },
      );

      if (!chatId) {
        throw new Error("Failed to create chat assistant: Empty ID returned");
      }

      // 创建本地助手记录
      assistant = {
        id: chatId,
        name: assistantName,
        knowledgeBaseId,
        knowledgeBaseName,
        created: Date.now(),
        updated: Date.now(),
        settings,
      };

      // 保存助手到新存储
      await this.assistantStorage.saveAssistant(assistant);

      // 同时也保存到旧格式，增强兼容性
      try {
        Zotero.Prefs.set(
          `zotero-ragflow.chatAssistant.${knowledgeBaseId}`,
          chatId,
          true,
        );
      } catch (e) {
        // 忽略旧格式保存错误
        Logger.warn({
          message: "Failed to save assistant to legacy format",
          context: "SessionService",
          error: e as Error,
        });
      }

      // 确保立即同步
      await this.assistantStorage.sync();

      Logger.info({
        message: "Assistant created",
        context: "SessionService",
        data: { assistantId: assistant.id, knowledgeBaseId },
      });

      return assistant;
    } catch (error) {
      Logger.error({
        message: "Failed to get or create assistant",
        context: "SessionService",
        error: error as Error,
        data: {
          knowledgeBaseId,
          errorMsg: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw new SessionError(ErrorType.ASSISTANT_CREATE_FAILED);
    }
  }

  /**
   * 获取或创建会话
   * 优先查找知识库对应的会话，如果找不到再创建新会话
   */
  public async getOrCreateSessionForKnowledgeBase(
    knowledgeBaseId: string,
    knowledgeBaseName: string,
    params?: {
      name?: string;
      description?: string;
      assistantSettings?: Partial<AssistantSettings>;
      tags?: string[];
      forceNew?: boolean; // 是否强制创建新会话
    },
  ): Promise<Session> {
    try {
      // 检查参数
      if (!knowledgeBaseId) {
        throw new Error("Knowledge base ID is required");
      }

      // 如果请求强制创建新会话，直接创建
      if (params?.forceNew) {
        return this.createSession(knowledgeBaseId, knowledgeBaseName, {
          name: params.name || SessionService.createSessionName(),
          description: params.description,
          assistantSettings: params.assistantSettings,
          tags: params.tags,
        });
      }

      // 尝试查找现有会话
      try {
        const sessions = await this.getSessionsByKnowledgeBase(knowledgeBaseId);

        // 如果找到现有会话，使用最新的一个（已按更新时间排序）
        if (sessions.length > 0) {
          Logger.info({
            message: "Reusing existing session for knowledge base",
            context: "SessionService",
            data: { knowledgeBaseId, sessionId: sessions[0].id },
          });
          return sessions[0];
        }
      } catch (e) {
        // 查找失败，记录错误，继续创建新会话
        Logger.warn({
          message: "Failed to find existing sessions, will create new one",
          context: "SessionService",
          error: e as Error,
        });
      }

      // 尝试从旧格式偏好设置中查找
      try {
        // 先获取知识库对应的助手ID
        const assistant = await this.getOrCreateAssistant(
          knowledgeBaseId,
          knowledgeBaseName,
        );
        const assistantId = assistant.id;

        // 查找助手关联的会话
        const legacySessionId = Zotero.Prefs.get(
          `zotero-ragflow.activeSession.${assistantId}`,
          true,
        ) as string;

        if (legacySessionId) {
          try {
            // 尝试获取该会话
            const session = await this.getSession(legacySessionId);
            if (session) {
              Logger.info({
                message: "Reusing legacy session for knowledge base",
                context: "SessionService",
                data: { knowledgeBaseId, sessionId: legacySessionId },
              });
              return session;
            }
          } catch (error) {
            // 忽略错误，继续创建新会话
            Logger.warn({
              message: "Failed to retrieve legacy session, will create new one",
              context: "SessionService",
              error: error as Error,
            });
          }
        }
      } catch (e) {
        // 忽略错误，继续创建新会话
      }

      // 没有找到现有会话，创建新会话
      return this.createSession(knowledgeBaseId, knowledgeBaseName, {
        name: params?.name || SessionService.createSessionName(),
        description: params?.description,
        assistantSettings: params?.assistantSettings,
        tags: params?.tags,
      });
    } catch (error) {
      Logger.error({
        message: "Failed to get or create session for knowledge base",
        context: "SessionService",
        error: error as Error,
      });
      throw new SessionError(ErrorType.CREATE_FAILED);
    }
  }

  /**
   * 创建新会话
   */
  public async createSession(
    knowledgeBaseId: string,
    knowledgeBaseName: string,
    params: {
      name: string;
      description?: string;
      assistantSettings?: Partial<AssistantSettings>;
      tags?: string[];
    },
  ): Promise<Session> {
    try {
      // 确保会话名称唯一，添加时间戳（如果没有）
      let sessionName = params.name;
      if (!SessionService.isStandardSessionName(sessionName)) {
        sessionName = SessionService.createSessionName(sessionName);

        Logger.debug({
          message: "Added timestamp to session name for uniqueness",
          context: "SessionService",
          data: {
            originalName: params.name,
            modifiedName: sessionName,
          },
        });
      }

      Logger.info({
        message: "Creating new session",
        context: "SessionService",
        data: { knowledgeBaseId, name: sessionName },
      });

      // 获取或创建助手
      const assistant = await this.getOrCreateAssistant(
        knowledgeBaseId,
        knowledgeBaseName,
        {
          settings: params.assistantSettings,
        },
      );

      // 添加调试日志
      Logger.debug({
        message: "Creating session with assistant",
        context: "SessionService",
        data: { assistantId: assistant.id },
      });

      try {
        // 验证助手ID
        if (!assistant || !assistant.id) {
          throw new Error(`Invalid assistant: ${JSON.stringify(assistant)}`);
        }

        // 创建RAGFlow会话
        Logger.debug({
          message: "Attempting to create RAGFlow session",
          context: "SessionService",
          data: { assistantId: assistant.id, sessionName: sessionName },
        });

        const sessionId = await ragflow.createSession(
          assistant.id,
          sessionName,
        );

        // 验证返回的会话ID
        if (!sessionId) {
          throw new Error("RAGFlow API returned empty session ID");
        }

        Logger.debug({
          message: "RAGFlow session created successfully",
          context: "SessionService",
          data: { sessionId, assistantId: assistant.id },
        });

        // 创建本地会话对象
        const session: Session = {
          id: sessionId,
          name: sessionName,
          description: params.description || "",
          assistantId: assistant.id,
          knowledgeBaseId,
          knowledgeBaseName,
          messages: [],
          created: Date.now(),
          updated: Date.now(),
          tags: params.tags || [],
        };

        try {
          // 保存会话到新存储
          await this.storage.saveSession(session);

          // 同时保存到旧格式，增强兼容性
          try {
            Zotero.Prefs.set(
              `zotero-ragflow.activeSession.${assistant.id}`,
              sessionId,
              true,
            );
          } catch (e) {
            // 忽略旧格式保存错误
            Logger.warn({
              message: "Failed to save session to legacy format",
              context: "SessionService",
              error: e as Error,
            });
          }

          // 额外确保同步完成
          await this.storage.sync();

          Logger.info({
            message: "Session created and saved successfully",
            context: "SessionService",
            data: { sessionId, assistantId: assistant.id },
          });

          return session;
        } catch (storageError) {
          Logger.error({
            message: "Failed to save session to storage",
            context: "SessionService",
            error: storageError as Error,
            data: {
              sessionId,
              assistantId: assistant.id,
              errorMsg:
                storageError instanceof Error
                  ? storageError.message
                  : String(storageError),
            },
          });
          throw storageError;
        }
      } catch (ragflowError) {
        // 处理会话名称重复错误
        if (
          ragflowError instanceof Error &&
          ragflowError.message.includes("Duplicated chat name")
        ) {
          Logger.warn({
            message:
              "Detected duplicated chat name error, retrying with more unique name",
            context: "SessionService",
            data: { originalName: sessionName },
          });

          // 创建更唯一的名称并重试
          const uniqueName = SessionService.createSessionName(
            params.name,
            true,
          );

          Logger.debug({
            message: "Retrying with more unique session name",
            context: "SessionService",
            data: { newName: uniqueName },
          });

          return this.createSession(knowledgeBaseId, knowledgeBaseName, {
            ...params,
            name: uniqueName,
          });
        }

        Logger.error({
          message: "Failed to create session in RAGFlow API",
          context: "SessionService",
          error: ragflowError as Error,
          data: {
            assistantId: assistant.id,
            knowledgeBaseId,
            errorMsg:
              ragflowError instanceof Error
                ? ragflowError.message
                : String(ragflowError),
          },
        });
        throw ragflowError;
      }
    } catch (error) {
      Logger.error({
        message: "Failed to create session",
        context: "SessionService",
        error: error as Error,
        data: {
          knowledgeBaseId,
          errorMsg: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw new SessionError(ErrorType.CREATE_FAILED);
    }
  }

  /**
   * 获取会话列表
   */
  public async getSessions(): Promise<Session[]> {
    const sessionsMeta = await this.storage.getSessions();
    const result: Session[] = [];

    for (const meta of sessionsMeta) {
      const fullSession = await this.storage.getSession(meta.id);
      if (fullSession) {
        result.push(fullSession);
      }
    }

    return result;
  }

  /**
   * 获取会话详情
   */
  public async getSession(sessionId: string): Promise<Session> {
    let session = await this.storage.getSession(sessionId);

    // 如果新存储中没有找到，尝试从旧存储格式查找
    if (!session) {
      try {
        // 查找所有可能包含会话ID的旧存储键
        const prefKeys = Zotero.Prefs.getChildKeys(
          "zotero-ragflow.activeSession",
        );
        for (const key of prefKeys) {
          const storedSessionId = Zotero.Prefs.get(
            `zotero-ragflow.activeSession.${key}`,
            true,
          ) as string;

          if (storedSessionId === sessionId) {
            // 找到了匹配的会话ID
            Logger.info({
              message: "Found session ID in legacy storage",
              context: "SessionService",
              data: { sessionId, assistantId: key },
            });

            // 尝试从RAGFlow API获取会话详情
            try {
              // 这里我们需要查询会话详情，但如果API没有提供这个功能，我们可能需要创建一个新的本地会话
              // 为简单起见，我们创建一个基本的会话对象
              const legacySession: Session = {
                id: sessionId,
                name: `恢复的会话_${Date.now()}`,
                description: "从旧存储格式恢复的会话",
                assistantId: key,
                knowledgeBaseId: "", // 这个我们可能没法恢复
                knowledgeBaseName: "未知知识库",
                messages: [],
                created: Date.now(),
                updated: Date.now(),
                tags: [],
              };

              // 保存到新存储中以便将来访问
              await this.storage.saveSession(legacySession);
              await this.storage.sync();

              // 返回恢复的会话
              return legacySession;
            } catch (e) {
              Logger.warn({
                message: "Failed to recover session from legacy format",
                context: "SessionService",
                error: e as Error,
              });
            }
          }
        }
      } catch (e) {
        Logger.debug({
          message: "Error searching legacy session storage",
          context: "SessionService",
          error: e as Error,
        });
      }

      throw new SessionError(ErrorType.NOT_FOUND);
    }

    return session;
  }

  /**
   * 按知识库获取会话
   */
  public async getSessionsByKnowledgeBase(
    knowledgeBaseId: string,
  ): Promise<Session[]> {
    const sessionsMeta =
      await this.storage.getSessionsByKnowledgeBase(knowledgeBaseId);
    const result: Session[] = [];

    for (const meta of sessionsMeta) {
      const fullSession = await this.storage.getSession(meta.id);
      if (fullSession) {
        result.push(fullSession);
      }
    }

    return result;
  }

  /**
   * 按助手获取会话
   */
  public async getSessionsByAssistant(assistantId: string): Promise<Session[]> {
    const sessionsMeta = await this.storage.getSessionsByAssistant(assistantId);
    const result: Session[] = [];

    for (const meta of sessionsMeta) {
      const fullSession = await this.storage.getSession(meta.id);
      if (fullSession) {
        result.push(fullSession);
      }
    }

    return result;
  }

  /**
   * 更新会话
   */
  public async updateSession(
    sessionId: string,
    updates: Partial<Session>,
  ): Promise<Session> {
    try {
      const session = await this.getSession(sessionId);
      const updated = { ...session, ...updates, updated: Date.now() };
      await this.storage.saveSession(updated);
      // 确保立即同步
      await this.storage.sync();

      Logger.info({
        message: "Session updated",
        context: "SessionService",
        data: { sessionId },
      });

      return updated;
    } catch (error) {
      Logger.error({
        message: "Failed to update session",
        context: "SessionService",
        error: error as Error,
        data: {
          sessionId,
          errorMsg: error instanceof Error ? error.message : String(error),
        },
      });
      throw new SessionError(ErrorType.UPDATE_FAILED);
    }
  }

  /**
   * 删除会话
   */
  public async deleteSession(sessionId: string): Promise<void> {
    try {
      await this.storage.deleteSession(sessionId);
      // 在SessionStorage.deleteSession中已添加同步调用

      Logger.info({
        message: "Session deleted",
        context: "SessionService",
        data: { sessionId },
      });
    } catch (error) {
      Logger.error({
        message: "Failed to delete session",
        context: "SessionService",
        error: error as Error,
        data: {
          sessionId,
          errorMsg: error instanceof Error ? error.message : String(error),
        },
      });
      throw new SessionError(ErrorType.DELETE_FAILED);
    }
  }

  /**
   * 发送消息
   */
  public async sendMessage(
    sessionId: string,
    content: string,
  ): Promise<ChatMessage> {
    try {
      if (!sessionId) {
        throw new Error("Invalid session ID");
      }

      if (!content || content.trim() === "") {
        throw new Error("Message content cannot be empty");
      }

      // 获取会话对象
      const session = await this.getSession(sessionId);
      if (!session.assistantId) {
        throw new Error(`Session has no associated assistant: ${sessionId}`);
      }

      Logger.debug({
        message: "Sending message to RAGFlow API",
        context: "SessionService",
        data: {
          sessionId,
          assistantId: session.assistantId,
          contentLength: content.length,
        },
      });

      try {
        // 发送到远程服务
        const { answer, sources } = await ragflow.sendMessage(
          session.assistantId,
          sessionId,
          content,
        );

        if (!answer) {
          throw new Error("Empty response received from RAGFlow API");
        }

        // 构建用户消息
        const userMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          content,
          timestamp: Date.now(),
        };

        // 构建助手消息
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: answer,
          timestamp: Date.now(),
          sources,
        };

        // 添加到会话记录
        session.messages.push(userMessage);
        session.messages.push(assistantMessage);
        session.updated = Date.now();

        // 检查消息数量限制
        if (session.messages.length > this.config.maxMessagesPerSession!) {
          session.messages = session.messages.slice(
            -this.config.maxMessagesPerSession!,
          );
        }

        // 保存更新的会话并确保立即同步
        await this.storage.saveSession(session);
        await this.storage.sync();

        Logger.info({
          message: "Message sent and response saved",
          context: "SessionService",
          data: {
            sessionId,
            userMessageId: userMessage.id,
            assistantMessageId: assistantMessage.id,
          },
        });

        return assistantMessage;
      } catch (apiError) {
        Logger.error({
          message: "Failed to send message to RAGFlow API",
          context: "SessionService",
          error: apiError as Error,
          data: {
            sessionId,
            assistantId: session.assistantId,
            errorMsg:
              apiError instanceof Error ? apiError.message : String(apiError),
          },
        });
        throw apiError;
      }
    } catch (error) {
      Logger.error({
        message: "Failed to send message",
        context: "SessionService",
        error: error as Error,
        data: {
          sessionId,
          errorMsg: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw new SessionError(ErrorType.SEND_FAILED);
    }
  }

  /**
   * 获取所有助手
   */
  public async getAssistants(): Promise<Assistant[]> {
    return this.assistantStorage.getAssistants();
  }

  /**
   * 获取助手详情
   */
  public async getAssistant(assistantId: string): Promise<Assistant> {
    const assistant = await this.assistantStorage.getAssistant(assistantId);
    if (!assistant) {
      throw new SessionError(ErrorType.ASSISTANT_NOT_FOUND);
    }
    return assistant;
  }

  /**
   * 更新助手
   */
  public async updateAssistant(
    assistantId: string,
    updates: Partial<Assistant>,
  ): Promise<Assistant> {
    try {
      const assistant = await this.getAssistant(assistantId);

      // 准备更新
      const updated: Assistant = {
        ...assistant,
        ...updates,
        updated: Date.now(),
      };

      // 如果名称或设置变更，也更新RAGFlow侧的助手
      if (updates.name || updates.settings) {
        await ragflow.updateChatAssistant(
          assistantId,
          updated.name,
          updated.settings,
        );
      }

      // 保存本地更新并立即同步
      await this.assistantStorage.saveAssistant(updated);
      await this.assistantStorage.sync();

      Logger.info({
        message: "Assistant updated",
        context: "SessionService",
        data: { assistantId },
      });

      return updated;
    } catch (error) {
      Logger.error({
        message: "Failed to update assistant",
        context: "SessionService",
        error: error as Error,
        data: {
          assistantId,
          errorMsg: error instanceof Error ? error.message : String(error),
        },
      });
      throw new SessionError(ErrorType.ASSISTANT_UPDATE_FAILED);
    }
  }

  /**
   * 清理所有会话数据
   */
  public async clear(): Promise<void> {
    try {
      await this.storage.clear();
      await this.assistantStorage.clear();

      // 这些方法已调用sync()，所以不需要额外同步

      Logger.info({
        message: "All session data cleared",
        context: "SessionService",
      });
    } catch (error) {
      Logger.error({
        message: "Failed to clear session data",
        context: "SessionService",
        error: error as Error,
        data: {
          errorMsg: error instanceof Error ? error.message : String(error),
        },
      });
      throw new SessionError(ErrorType.CLEAR_FAILED);
    }
  }

  /**
   * 启动自动保存
   */
  private startAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    this.autoSaveTimer = setInterval(async () => {
      try {
        await this.storage.sync();
        await this.assistantStorage.sync();

        Logger.debug({
          message: "Auto-save completed",
          context: "SessionService",
        });
      } catch (error) {
        Logger.error({
          message: "Auto-save failed",
          context: "SessionService",
          error: error as Error,
        });
      }
    }, this.config.autoSaveInterval);
  }

  /**
   * 停止自动保存
   */
  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }
  }

  /**
   * 销毁服务
   */
  public async dispose(): Promise<void> {
    this.stopAutoSave();
    await this.storage.sync();
    await this.assistantStorage.sync();
    SessionService.instance = undefined!;
  }
}
