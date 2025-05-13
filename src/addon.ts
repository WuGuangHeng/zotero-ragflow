import { config } from "../package.json";
import { ColumnOptions, DialogHelper } from "zotero-plugin-toolkit";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";

// 导入新服务
import {
  Logger,
  ragflow,
  knowledgeBaseManager,
  sessionService,
  eventBus,
  Events,
} from "./services";

// 导入UIManager和事件系统
import { UIManager } from "./modules.next/ui/uiManager";

// 导入KnowledgeBaseStatus常量
import { KnowledgeBaseStatus } from "./modules.next/services/types/common";

// 导入版本信息
import { VERSION } from "./modules.next/version";

// 导入SessionService以使用其静态方法
import { SessionService } from "./modules.next/services/core/session/service";

// 不再需要自定义事件类型，使用eventBus中定义的Events常量

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    env: "development" | "production";
    ztoolkit: ReturnType<typeof createZToolkit>;
    locale?: {
      current: any;
    };
    prefs?: {
      window: Window;
      columns: Array<ColumnOptions>;
      rows: Array<{ [dataKey: string]: string }>;
    };
    dialog?: DialogHelper;
  };

  // 生命周期钩子
  public hooks: typeof hooks;

  // 导出的API
  public api: object;

  // 当前活动知识库
  private activeKnowledgeBaseId?: string;

  // 事件监听器清理函数
  private eventListeners: Array<() => void> = [];

  constructor() {
    this.data = {
      alive: true,
      config,
      env:
        process.env.NODE_ENV === "development" ? "development" : "production",
      ztoolkit: createZToolkit(),
    };
    this.hooks = hooks;
    this.api = {};

    // 从首选项加载知识库ID
    this.activeKnowledgeBaseId =
      (Zotero.Prefs.get(`${config.prefsPrefix}.kbId`, true) as string) ||
      undefined;
  }

  /**
   * 插件启动时执行
   */
  public async onStartup() {
    try {
      Logger.info({
        message: "正在启动RAGFlow插件...",
      });

      // 1. 加载配置
      this.loadConfiguration();

      // 2. 设置事件监听器
      // 注意: UI管理器的初始化已移至hooks.ts中的onMainWindowLoad函数中处理
      // 这样可以确保在窗口环境完全准备好后再初始化UI
      this.setupEventListeners();

      // 3. 加载上次使用的知识库(如果有)
      if (this.activeKnowledgeBaseId) {
        try {
          await this.loadKnowledgeBase(this.activeKnowledgeBaseId);

          Logger.info({
            message: `已加载知识库: ${this.activeKnowledgeBaseId}`,
          });
        } catch (error) {
          Logger.warn({
            message: `无法加载之前的知识库: ${this.activeKnowledgeBaseId}`,
          });
          // 清除无效的知识库ID
          this.activeKnowledgeBaseId = undefined;
        }
      }

      Logger.info({
        message: `RAGFlow插件 v${VERSION.toString()} 启动成功`,
      });
    } catch (error) {
      Logger.error({
        message: `RAGFlow插件启动失败: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      this.showErrorNotification("RAGFlow插件启动失败", error);
    }
  }

  /**
   * 插件卸载时执行
   */
  public async onUnload() {
    try {
      Logger.info({
        message: "正在卸载RAGFlow插件...",
      });

      // 1. 移除所有事件监听器
      this.eventListeners.forEach((removeListener) => removeListener());
      this.eventListeners = [];

      // 2. 释放知识库管理器资源
      knowledgeBaseManager.dispose();

      // 3. 释放会话服务资源
      await sessionService.dispose();

      // 4. 释放UI管理器资源
      const uiManager = UIManager.getInstance();
      uiManager.dispose();

      Logger.info({
        message: "RAGFlow插件卸载完成",
      });
    } catch (error) {
      Logger.error({
        message: `RAGFlow插件卸载过程中出错: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * 加载插件配置
   */
  private loadConfiguration() {
    try {
      // 获取API配置
      const apiKey = Zotero.Prefs.get(
        `${config.prefsPrefix}.apiKey`,
        true,
      ) as string;
      const apiUrl =
        (Zotero.Prefs.get(`${config.prefsPrefix}.apiUrl`, true) as string) ||
        "http://127.0.0.1:8000";

      // 配置服务
      if (apiKey) {
        ragflow.setApiKey(apiKey);
        // 暂时跳过知识库管理器的配置，因为接口不匹配
        // 实际实现应直接通过ragflow设置
      } else {
        Logger.warn({
          message: "未配置RAGFlow API密钥",
        });
      }

      if (apiUrl) {
        ragflow.setBaseURL(apiUrl);
        // 暂时跳过知识库管理器的配置，因为接口不匹配
      }

      // UI管理器的配置已移至hooks.ts中的onMainWindowLoad函数
      // 这样可以确保window对象可用

      Logger.info({
        message: `配置加载完成，API URL: ${apiUrl}, API KEY: ${apiKey ? "已设置" : "未设置"}`,
        data: { apiUrl, hasApiKey: !!apiKey },
      });
    } catch (error) {
      Logger.error({
        message: `加载配置失败: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners() {
    // 监听知识库状态变化
    const kbStatusChangeHandler = (data: any) => {
      const id = data.id;
      const status = data.status;

      Logger.info({
        message: `知识库状态变化: ${id} => ${status}`,
      });

      if (id === this.activeKnowledgeBaseId) {
        // 发送通知
        this.showKnowledgeBaseStatusNotification(status);
      }
    };

    // 添加自定义事件监听
    eventBus.on("kb:status_changed", kbStatusChangeHandler);

    this.eventListeners.push(() => {
      eventBus.off("kb:status_changed", kbStatusChangeHandler);
    });

    // 监听会话创建事件
    const sessionCreatedHandler = (data: any) => {
      Logger.info({
        message: `新会话已创建: ${data.id} (${data.name})`,
      });
    };

    eventBus.on(Events.SESSION_CREATED, sessionCreatedHandler);

    this.eventListeners.push(() => {
      eventBus.off(Events.SESSION_CREATED, sessionCreatedHandler);
    });
  }

  /**
   * 加载知识库
   * @param id 知识库ID
   */
  private async loadKnowledgeBase(id: string) {
    try {
      // 确保id是字符串类型
      if (typeof id !== "string") {
        Logger.error({
          message: "无效的知识库ID格式",
          data: { id, type: typeof id },
        });
        throw new Error(`无效的知识库ID格式: ${typeof id}`);
      }

      // 获取知识库状态
      const status = await ragflow.getKnowledgeBaseStatus(id);
      Logger.info({
        message: `加载知识库 ${id}, 状态: ${status}`,
        data: { datasetId: id, status },
      });

      // 触发状态变更事件
      if (status) {
        this.showKnowledgeBaseStatusNotification(status);
      }
    } catch (error) {
      Logger.error({
        message: `无法加载知识库 ${id}: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  /**
   * 监控知识库状态
   * @param id 知识库ID
   */
  private async monitorKnowledgeBase(id: string) {
    try {
      // 确保id是字符串类型
      if (typeof id !== "string") {
        Logger.error({
          message: "无效的知识库ID格式",
          data: { id, type: typeof id },
        });
        throw new Error(`无效的知识库ID格式: ${typeof id}`);
      }

      Logger.info({
        message: `开始监控知识库: ${id}`,
        data: { datasetId: id },
      });

      // 实现定期检查逻辑
      let maxRetries = 30; // 最多重试30次
      let retryCount = 0;
      let interval = 5000; // 5秒一次

      const checkStatus = async () => {
        try {
          const status = await ragflow.getKnowledgeBaseStatus(id);
          Logger.info({
            message: `知识库 ${id} 状态: ${status}`,
            data: { datasetId: id, status },
          });

          // 触发状态变更事件
          this.showKnowledgeBaseStatusNotification(status);

          // 如果处理中，继续检查
          if (status === "2" && retryCount < maxRetries) {
            retryCount++;
            setTimeout(checkStatus, interval);
          }
        } catch (error) {
          Logger.error({
            message: `检查知识库状态失败: ${error instanceof Error ? error.message : String(error)}`,
            error: error instanceof Error ? error : new Error(String(error)),
            data: { datasetId: id, retryCount },
          });

          if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(checkStatus, interval);
          }
        }
      };

      // 开始首次检查
      await checkStatus();
    } catch (error) {
      Logger.error({
        message: `监控知识库失败: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  /**
   * 显示知识库状态通知
   */
  private showKnowledgeBaseStatusNotification(status: string) {
    let message = "";
    let type: "success" | "default" | "error" | "warning" = "default";

    // 根据状态设置消息和类型
    if (status === "1") {
      // Ready
      message = "✅ 知识库已准备就绪，可以开始提问";
      type = "success";
    } else if (status === "2") {
      // Processing
      message = "📊 知识库正在构建中...";
      type = "default";
    } else if (status === "3") {
      // Error
      message = "❌ 知识库构建失败，请检查文件格式";
      type = "error";
    } else {
      message = `⚠️ 知识库状态: ${status}`;
      type = "warning";
    }

    const progressWindow = new this.data.ztoolkit.ProgressWindow("RAGFlow");
    progressWindow.createLine({
      text: message,
      type,
    });
    progressWindow.show();

    // 如果是最终状态则设置自动关闭
    if (status === "1" || status === "3") {
      progressWindow.startCloseTimer(5000);
    }
  }

  /**
   * 显示错误通知
   */
  private showErrorNotification(message: string, error?: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : String(error || "");
    const progressWindow = new this.data.ztoolkit.ProgressWindow(
      "RAGFlow 错误",
    );
    progressWindow.createLine({
      text: message,
      type: "error",
    });

    if (errorMessage) {
      progressWindow.createLine({
        text: errorMessage,
        type: "error",
      });
    }

    progressWindow.show();
    progressWindow.startCloseTimer(5000);
  }

  /**
   * 打开设置对话框
   */
  public openSettings() {
    try {
      Logger.info({
        message: "打开设置对话框",
      });

      // 使用eventBus发送事件
      eventBus.emit(Events.UI_OPEN_SETTINGS, undefined);
    } catch (error) {
      Logger.error({
        message: `打开设置对话框失败: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      this.showErrorNotification("打开设置对话框失败", error);
    }
  }

  /**
   * 打开集合选择器，用于创建知识库
   */
  public async openCollectionSelector() {
    try {
      // 首先检查是否配置了API密钥
      const apiKey = Zotero.Prefs.get(
        `${config.prefsPrefix}.apiKey`,
        true,
      ) as string;
      if (!apiKey) {
        const progressWindow = new this.data.ztoolkit.ProgressWindow(
          "RAGFlow 提示",
        );
        progressWindow.createLine({
          text: "请先在设置中配置 RAGFlow API 密钥",
          type: "warning",
        });
        progressWindow.show();
        progressWindow.startCloseTimer(3000);

        // 打开设置页面
        setTimeout(() => this.openSettings(), 1000);
        return;
      }

      // 获取当前选中的集合
      const collection = Zotero.getActiveZoteroPane().getSelectedCollection();
      if (!collection) {
        const progressWindow = new this.data.ztoolkit.ProgressWindow(
          "RAGFlow 提示",
        );
        progressWindow.createLine({
          text: "请先选择一个集合",
          type: "warning",
        });
        progressWindow.show();
        progressWindow.startCloseTimer(3000);
        return;
      }

      // 使用ztoolkit创建确认对话框
      const confirmDialog = new this.data.ztoolkit.Dialog(1, 1)
        .addCell(0, 0, {
          tag: "description",
          properties: {
            innerHTML: `是否将集合 "${collection.name}" 发送到 RAGFlow 构建知识库？`,
          },
        })
        .addButton("确定", "ok")
        .addButton("取消", "cancel")
        .setDialogData({
          unloadCallback: () => {
            const dialogData = confirmDialog.dialogData;
            Logger.debug({
              message: `集合选择对话框关闭，最后点击按钮: ${dialogData._lastButtonId}`,
            });

            if (dialogData._lastButtonId === "ok") {
              this.uploadCollectionToRAGFlow(collection);
            }
          },
        });

      confirmDialog.open("RAGFlow 确认", {
        centerscreen: true,
        resizable: false,
      });
    } catch (error) {
      Logger.error({
        message: `打开集合选择器失败: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      this.showErrorNotification("打开集合选择器失败", error);
    }
  }

  /**
   * 上传集合到RAGFlow
   */
  public async uploadCollectionToRAGFlow(collection: any) {
    try {
      Logger.info({
        message: `开始上传集合: ${collection.name} (ID: ${collection.id})`,
      });

      // 显示进度窗口
      const progressWindow = new this.data.ztoolkit.ProgressWindow(
        "RAGFlow 上传",
        {
          closeOnClick: false,
        },
      );
      progressWindow.createLine({ text: "正在准备上传文件..." });
      progressWindow.show();

      // 获取集合中所有条目
      const items = collection.getChildItems();

      // 获取所有附件
      const attachments = [];
      for (const item of items) {
        if (item.isAttachment()) {
          continue;
        }

        const itemAttachments = item.getAttachments();
        for (const attachmentID of itemAttachments) {
          const attachment = Zotero.Items.get(attachmentID);
          if (attachment.isFileAttachment()) {
            const path = attachment.getFilePath();
            if (path) {
              const name = attachment.getField("title");
              const mimeType =
                attachment.attachmentContentType || this.guessMimeType(path);
              attachments.push({ path, name, mimeType });
            }
          }
        }
      }

      if (attachments.length === 0) {
        progressWindow.createLine({
          text: "没有找到可上传的附件文件",
          type: "error",
        });
        progressWindow.startCloseTimer(3000);
        return;
      }

      progressWindow.createLine({
        text: `找到 ${attachments.length} 个附件文件`,
        type: "default",
      });

      // 上传文件到 RAGFlow
      progressWindow.createLine({ text: "正在上传文件到 RAGFlow..." });

      // 使用新服务上传文件
      const result = await ragflow.uploadFiles(attachments, collection.name);

      // 正确获取datasetId
      const kbId = result.datasetId;

      // 保存知识库 ID (确保是字符串)
      this.activeKnowledgeBaseId = kbId;
      Zotero.Prefs.set(`${config.prefsPrefix}.kbId`, kbId, true);
      Zotero.Prefs.set(`${config.prefsPrefix}.kbName`, collection.name, true);

      // 添加同步配置 - 使知识库管理器能够监听集合变更并同步
      try {
        knowledgeBaseManager.addSyncConfig({
          collectionId: collection.id.toString(),
          datasetId: kbId,
          autoSync: true,
        });

        Logger.info({
          message: `已为集合 ${collection.id} 添加同步配置，目标数据集: ${kbId}`,
          data: { collectionId: collection.id.toString(), datasetId: kbId }, // 添加详细日志数据
        });
      } catch (syncError) {
        // 仅记录错误，不影响主流程
        Logger.error({
          message: `添加同步配置失败: ${syncError instanceof Error ? syncError.message : String(syncError)}`,
          error:
            syncError instanceof Error
              ? syncError
              : new Error(String(syncError)),
        });
      }

      progressWindow.createLine({
        text: "上传成功，知识库构建中...",
        type: "success",
      });

      // 开始监控知识库状态
      await this.monitorKnowledgeBase(kbId);
    } catch (error) {
      Logger.error({
        message: `上传集合失败: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      this.showErrorNotification("上传集合失败", error);
    }
  }

  /**
   * 猜测文件MIME类型
   */
  private guessMimeType(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "pdf":
        return "application/pdf";
      case "doc":
        return "application/msword";
      case "docx":
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      case "txt":
        return "text/plain";
      case "json":
        return "application/json";
      case "csv":
        return "text/csv";
      default:
        return "application/octet-stream";
    }
  }

  /**
   * 打开知识库选择对话框
   */
  public async openKnowledgeBaseSelector() {
    try {
      Logger.info({
        message: "打开知识库选择对话框",
      });

      // 首先检查是否配置了API密钥
      const apiKey = Zotero.Prefs.get(
        `${config.prefsPrefix}.apiKey`,
        true,
      ) as string;
      if (!apiKey) {
        const progressWindow = new this.data.ztoolkit.ProgressWindow(
          "RAGFlow 提示",
        );
        progressWindow.createLine({
          text: "请先在设置中配置 RAGFlow API 密钥",
          type: "warning",
        });
        progressWindow.show();
        progressWindow.startCloseTimer(3000);

        // 打开设置页面
        setTimeout(() => this.openSettings(), 1000);
        return;
      }

      // 使用eventBus发送事件
      eventBus.emit(Events.UI_SHOW_KB_SELECTOR, {
        id: this.activeKnowledgeBaseId,
      });
    } catch (error) {
      Logger.error({
        message: `打开知识库选择对话框失败: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      this.showErrorNotification("打开知识库选择对话框失败", error);
    }
  }

  /**
   * 设置当前使用的知识库
   */
  public setKnowledgeBase(kbId: string, kbName: string) {
    try {
      Logger.info({
        message: `设置当前知识库: ${kbId} (${kbName})`,
      });

      // 保存知识库ID
      this.activeKnowledgeBaseId = kbId;
      Zotero.Prefs.set(`${config.prefsPrefix}.kbId`, kbId, true);
      Zotero.Prefs.set(`${config.prefsPrefix}.kbName`, kbName, true);

      // 加载知识库
      this.loadKnowledgeBase(kbId);

      // 显示成功提示
      const progressWindow = new this.data.ztoolkit.ProgressWindow("RAGFlow");
      progressWindow.createLine({
        text: `已切换到知识库: ${kbName}`,
        type: "success",
      });
      progressWindow.show();
      progressWindow.startCloseTimer(3000);
    } catch (error) {
      Logger.error({
        message: `设置知识库失败: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      this.showErrorNotification("设置知识库失败", error);
    }
  }

  /**
   * 打开问题对话框
   */
  public openQuestionDialog() {
    try {
      Logger.info({
        message: "打开问题对话框",
      });

      // 首先检查是否配置了API密钥
      const apiKey = Zotero.Prefs.get(
        `${config.prefsPrefix}.apiKey`,
        true,
      ) as string;
      if (!apiKey) {
        const progressWindow = new this.data.ztoolkit.ProgressWindow(
          "RAGFlow 提示",
        );
        progressWindow.createLine({
          text: "请先在设置中配置 RAGFlow API 密钥",
          type: "warning",
        });
        progressWindow.show();
        progressWindow.startCloseTimer(3000);

        // 打开设置页面
        setTimeout(() => this.openSettings(), 1000);
        return;
      }

      if (!this.activeKnowledgeBaseId) {
        const progressWindow = new this.data.ztoolkit.ProgressWindow(
          "RAGFlow 提示",
        );
        progressWindow.createLine({
          text: "尚未选择知识库，请先选择或创建知识库",
          type: "warning",
        });
        progressWindow.show();
        progressWindow.startCloseTimer(3000);
        return;
      }

      // 使用eventBus发送事件
      eventBus.emit(Events.UI_SHOW_QUESTION, {
        id: this.activeKnowledgeBaseId,
      });
    } catch (error) {
      Logger.error({
        message: `打开问题对话框失败: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      this.showErrorNotification("打开问题对话框失败", error);
    }
  }

  /**
   * 处理用户问题
   */
  public async processQuestion(question: string) {
    try {
      Logger.info({
        message: `处理用户问题: ${question}`,
      });

      // 检查知识库ID是否存在
      if (!this.activeKnowledgeBaseId) {
        const progressWindow = new this.data.ztoolkit.ProgressWindow(
          "RAGFlow 提示",
        );
        progressWindow.createLine({
          text: "请先选择知识库",
          type: "warning",
        });
        progressWindow.show();
        progressWindow.startCloseTimer(3000);

        // 打开知识库选择器
        setTimeout(() => this.openKnowledgeBaseSelector(), 1000);
        return;
      }

      // 显示处理中提示
      const progressWindow = new this.data.ztoolkit.ProgressWindow(
        "RAGFlow 问答",
        {
          closeOnClick: false,
        },
      );
      progressWindow.createLine({
        text: "正在处理问题...",
        type: "default",
      });
      progressWindow.show();

      // 获取知识库名称
      const kbName =
        (Zotero.Prefs.get(`${config.prefsPrefix}.kbName`, true) as string) ||
        "未命名知识库";

      try {
        // 使用sessionService获取或创建会话 - 重用现有会话
        const session = await sessionService.getOrCreateSessionForKnowledgeBase(
          this.activeKnowledgeBaseId,
          kbName,
        );

        Logger.info({
          message: `使用会话: ${session.id}`,
          data: { assistantId: session.assistantId, name: session.name },
        });

        // 发送消息并获取回复
        progressWindow.createLine({
          text: "正在获取回答...",
          type: "default",
        });

        const response = await sessionService.sendMessage(session.id, question);

        // 关闭进度窗口
        progressWindow.close();

        // 使用eventBus发送事件
        eventBus.emit(Events.UI_SHOW_CHAT_RESULT, {
          question,
          answer: response.content,
          sources: response.sources || [],
        });
      } catch (error) {
        // 如果sessionService不可用或发生错误，回退到旧的方法
        Logger.warn({
          message: `使用sessionService处理问题失败，回退到旧方法: ${error instanceof Error ? error.message : String(error)}`,
          error: error instanceof Error ? error : new Error(String(error)),
        });

        // 尝试检查错误类型，看是否能从错误中恢复
        if (
          error instanceof Error &&
          error.message.includes("Duplicated chat name")
        ) {
          Logger.warn({
            message: "检测到会话名称重复错误，尝试重新创建...",
          });

          try {
            // 在回退之前，使用SessionService标准命名方式创建重试会话
            const uniqueSessionName = SessionService.createSessionName(
              undefined,
              true,
            );

            const session = await sessionService.createSession(
              this.activeKnowledgeBaseId,
              kbName,
              { name: uniqueSessionName },
            );

            const response = await sessionService.sendMessage(
              session.id,
              question,
            );

            // 关闭进度窗口
            progressWindow.close();

            // 使用eventBus发送事件
            eventBus.emit(Events.UI_SHOW_CHAT_RESULT, {
              question,
              answer: response.content,
              sources: response.sources || [],
            });

            return; // 成功恢复，不需要继续回退
          } catch (retryError) {
            Logger.warn({
              message: `重试创建会话失败: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
            });
            // 继续执行回退逻辑
          }
        }

        // 回退方法 - 使用旧的API直接调用
        const chatAssistantId = await this.getOrCreateAssistant(
          this.activeKnowledgeBaseId,
        );

        // 使用带标准会话名称，与SessionService保持一致
        const sessionId = await this.getOrCreateSession(
          this.activeKnowledgeBaseId,
          chatAssistantId,
          SessionService.createSessionName(),
        );

        const response = await ragflow.sendMessage(
          chatAssistantId,
          sessionId,
          question,
        );

        // 关闭进度窗口
        progressWindow.close();

        // 使用eventBus发送事件
        eventBus.emit(Events.UI_SHOW_CHAT_RESULT, {
          question,
          answer: response.answer,
          sources: response.sources || [],
        });
      }
    } catch (error) {
      Logger.error({
        message: `处理问题失败: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      this.showErrorNotification("处理问题失败", error);
    }
  }

  /**
   * 获取或创建聊天助手
   */
  private async getOrCreateAssistant(datasetId: string): Promise<string> {
    // 获取助手ID
    const assistantId = Zotero.Prefs.get(
      `${config.prefsPrefix}.chatAssistant.${datasetId}`,
      true,
    ) as string;

    if (assistantId) {
      try {
        // 验证助手是否存在
        await ragflow.getChatAssistantDetails(assistantId);
        return assistantId;
      } catch (error) {
        Logger.warn({
          message: `聊天助手 ${assistantId} 不存在，将创建新助手`,
        });
      }
    }

    // 创建新助手
    const kbName =
      (Zotero.Prefs.get(`${config.prefsPrefix}.kbName`, true) as string) ||
      "未命名知识库";

    // 添加时间戳以避免命名冲突
    const timestamp = Date.now().toString().slice(-6);
    const assistantName = `${kbName}的AI助手_${timestamp}`;

    // 获取用户设置的默认模型，如果没有则使用qwen-turbo
    let defaultModel = "qwen-turbo";
    try {
      const savedSettingsStr = Zotero.Prefs.get(
        `${config.prefsPrefix}.defaultAssistantSettings`,
        true,
      ) as string;

      if (savedSettingsStr) {
        const savedSettings = JSON.parse(savedSettingsStr);
        if (savedSettings.model) {
          defaultModel = savedSettings.model;
          Logger.debug({
            message: `使用用户设置的默认模型: ${defaultModel}`,
          });
        }
      }
    } catch (error) {
      Logger.warn({
        message: `无法加载默认模型设置，使用qwen-turbo作为默认模型: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }

    // 添加日志
    Logger.info({
      message: `创建新助手，使用模型: ${defaultModel}`,
      data: { assistantName },
    });

    const newAssistantId = await ragflow.createChatAssistant(
      datasetId,
      assistantName,
      {
        model: defaultModel, // <-- 使用从用户设置中读取的模型
        temperature: 0.1,
        top_p: 0.3,
        max_tokens: 512,
        similarity_threshold: 0.2,
        top_n: 8,
      },
    );

    // 保存助手ID
    Zotero.Prefs.set(
      `${config.prefsPrefix}.chatAssistant.${datasetId}`,
      newAssistantId,
      true,
    );

    return newAssistantId;
  }

  /**
   * 获取或创建会话
   * @param datasetId 知识库ID
   * @param chatAssistantId 聊天助手ID
   * @param customSessionName 可选的自定义会话名称，用于避免重名问题
   */
  private async getOrCreateSession(
    datasetId: string,
    chatAssistantId: string,
    customSessionName?: string,
  ): Promise<string> {
    // 获取会话ID
    const sessionId = Zotero.Prefs.get(
      `${config.prefsPrefix}.activeSession.${chatAssistantId}`,
      true,
    ) as string;

    if (sessionId) {
      try {
        // 验证会话是否存在 - 这里需要根据实际情况添加验证逻辑
        return sessionId;
      } catch (error) {
        Logger.warn({
          message: `会话 ${sessionId} 不存在，将创建新会话`,
        });
      }
    }

    // 使用自定义名称或使用标准命名格式
    const sessionName = customSessionName || SessionService.createSessionName();

    Logger.debug({
      message: `正在创建新会话: ${sessionName}`,
      data: { chatAssistantId },
    });

    const newSessionId = await ragflow.createSession(
      chatAssistantId,
      sessionName,
    );

    // 保存会话ID
    Zotero.Prefs.set(
      `${config.prefsPrefix}.activeSession.${chatAssistantId}`,
      newSessionId,
      true,
    );

    return newSessionId;
  }

  /**
   * 切换UI显示/隐藏
   */
  public toggleUI() {
    try {
      Logger.info({
        message: "切换UI显示状态",
      });

      // 获取UIManager实例
      const uiManager = UIManager.getInstance();

      // 切换显示/隐藏
      uiManager.toggle();

      Logger.debug({
        message: "UI显示状态已切换",
      });
    } catch (error) {
      Logger.error({
        message: `切换UI显示状态失败: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      this.showErrorNotification("切换UI显示状态失败", error);
    }
  }

  /**
   * 打开历史记录对话框
   */
  public openHistoryDialog() {
    try {
      Logger.info({
        message: "打开历史记录对话框",
      });

      // 使用eventBus发送事件
      eventBus.emit(Events.UI_SHOW_HISTORY, undefined);
    } catch (error) {
      Logger.error({
        message: `打开历史记录对话框失败: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      this.showErrorNotification("打开历史记录对话框失败", error);
    }
  }

  /**
   * 显示助手设置对话框
   * @param knowledgeBaseId 可选的知识库ID，如果未提供则使用当前活动的知识库
   * @param assistantId 可选的助手ID，如果提供则加载现有助手设置
   */
  public async showAssistantSettings(
    knowledgeBaseId?: string,
    assistantId?: string,
  ): Promise<void> {
    try {
      Logger.info({
        message: "打开助手设置对话框",
      });

      // 如果没有提供知识库ID，使用当前活动的知识库
      if (!knowledgeBaseId) {
        knowledgeBaseId = this.activeKnowledgeBaseId;
      }

      // 获取UIManager实例并调用其showAssistantSettings方法
      const uiManager = UIManager.getInstance();
      await uiManager.showAssistantSettings(knowledgeBaseId, assistantId);
    } catch (error) {
      Logger.error({
        message: `显示助手设置对话框失败: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      this.showErrorNotification("无法打开助手设置对话框", error);
    }
  }
}

export default Addon;
