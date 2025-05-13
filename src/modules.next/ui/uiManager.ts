import { Logger } from "../services/logger";
import { eventBus, Events } from "./eventBus";
import { UIManagerConfig } from "./types";
import { config } from "../../../package.json";
import { ragflow } from "../services";

// 确保XUL类型可用
declare namespace XUL {
  interface MenuList extends XULElement {
    value: string;
    selectedItem: MenuItem | null;
  }

  interface MenuItem extends XULElement {
    label: string;
    value: string;
  }

  interface XULElement extends Element {
    // XUL元素基本属性
  }
}

/**
 * UIManager - 管理与Zotero界面集成的UI元素
 */
export class UIManager {
  private static instance: UIManager;
  private config: Required<UIManagerConfig>;
  private isVisible: boolean = false;
  private paneId: string = "ragflow-pane";
  private sectionId: string = "ragflow-section";
  private isEventListenersSetup: boolean = false;

  private constructor(config: UIManagerConfig = {}) {
    this.config = {
      containerId: "ragflow-container",
      defaultPaneWidth: 360,
      defaultPaneHeight: 600,
      minPaneWidth: 280,
      minPaneHeight: 400,
      maxPaneWidth: 800,
      maxPaneHeight: 1200,
      paneWidth: config.paneWidth || config.defaultPaneWidth || 360,
      paneHeight: config.paneHeight || config.defaultPaneHeight || 600,
      chatViewHeight: config.chatViewHeight || 400,
      sessionListHeight: config.sessionListHeight || 200,
      statusBarHeight: config.statusBarHeight || 24,
      animationDuration: config.animationDuration || 300,
      resizable: config.resizable ?? true,
      draggable: config.draggable ?? true,
      position: config.position || "right",
      theme: config.theme || "system",
      ...config,
    };

    Logger.debug({
      message: "UIManager instance created",
      context: "UIManager",
    });
  }

  /**
   * 获取UIManager单例实例
   */
  public static getInstance(config?: UIManagerConfig): UIManager {
    Logger.debug({
      message: "UIManager.getInstance called",
      context: "UIManager",
    });

    if (!UIManager.instance) {
      UIManager.instance = new UIManager(config);
      Logger.debug({
        message: "Created new UIManager instance",
        context: "UIManager",
      });
    } else {
      Logger.debug({
        message: "Reusing existing UIManager instance",
        context: "UIManager",
      });
    }

    return UIManager.instance;
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    if (this.isEventListenersSetup) {
      return;
    }

    // 监听面板可见性变更事件
    eventBus.on(Events.PANE_VISIBILITY_CHANGED, (visible) => {
      this.isVisible = visible;
      this.togglePaneVisibility(visible);

      Logger.debug({
        message: "Pane visibility changed",
        context: "UIManager",
        data: { visible },
      });
    });

    // 监听UI交互事件
    this.setupUIEventListeners();

    this.isEventListenersSetup = true;
    Logger.debug({
      message: "Event listeners set up successfully",
      context: "UIManager",
    });
  }

  /**
   * 设置UI交互事件监听器
   */
  private setupUIEventListeners(): void {
    // 监听设置对话框事件
    eventBus.on(Events.UI_OPEN_SETTINGS, () => {
      this.showSettingsPanel();
    });

    // 监听知识库选择器事件
    eventBus.on(Events.UI_SHOW_KB_SELECTOR, (data) => {
      this.showKnowledgeBaseSelector(data.id);
    });

    // 监听问题对话框事件
    eventBus.on(Events.UI_SHOW_QUESTION, (data) => {
      this.showQuestionPanel(data.id);
    });

    // 监听聊天结果事件
    eventBus.on(Events.UI_SHOW_CHAT_RESULT, (data) => {
      this.showChatResult(data.question, data.answer, data.sources);
    });

    // 监听历史记录事件
    eventBus.on(Events.UI_SHOW_HISTORY, () => {
      this.showHistoryPanel();
    });

    Logger.debug({
      message: "UI event listeners set up",
      context: "UIManager",
    });
  }

  /**
   * 初始化UI管理器
   */
  public async init(): Promise<void> {
    try {
      Logger.info({
        message: "UIManager.init called",
        context: "UIManager",
      });

      // 设置事件监听器
      this.setupEventListeners();

      // 注册主要UI组件
      this.registerMenuItems();
      this.registerItemPaneSection();

      Logger.info({
        message: "UI manager initialized successfully",
        context: "UIManager",
      });
    } catch (error) {
      Logger.error({
        message: "Failed to initialize UI manager",
        context: "UIManager",
        error: error as Error,
      });
      throw error;
    }
  }

  /**
   * 注册菜单项
   */
  // private registerMenuItems(): void {
  //   try {
  //     // 添加右键菜单项
  //     const menuIcon = `chrome://${config.addonRef}/content/icons/favicon.png`;

  //     // 在集合右键菜单中添加RAGFlow条目，这更符合业务逻辑
  //     ztoolkit.Menu.register("collection", {
  //       tag: "menuitem",
  //       id: "zotero-ragflow-collection-context",
  //       label: "发送到 RAGFlow 知识库",
  //       icon: menuIcon,
  //       oncommand: `if (Zotero["${config.addonInstance}"]) { Zotero["${config.addonInstance}"].openCollectionSelector(); }`,
  //     });

  //     // 在主菜单的Tools中添加一个RAGFlow子菜单
  //     ztoolkit.Menu.register("menuTools", {
  //       tag: "menu",
  //       label: "RAGFlow",
  //       icon: menuIcon,
  //       children: [
  //         {
  //           tag: "menuitem",
  //           label: "添加集合到知识库",
  //           oncommand: `if (Zotero["${config.addonInstance}"]) { Zotero["${config.addonInstance}"].openCollectionSelector(); }`,
  //         },
  //         {
  //           tag: "menuitem",
  //           label: "选择知识库",
  //           oncommand: `if (Zotero["${config.addonInstance}"]) { Zotero["${config.addonInstance}"].openKnowledgeBaseSelector(); }`,
  //         },
  //         {
  //           tag: "menuitem",
  //           label: "助手设置",
  //           oncommand: `if (Zotero["${config.addonInstance}"]) { Zotero["${config.addonInstance}"].showAssistantSettings(); }`,
  //         },
  //         {
  //           tag: "menuitem",
  //           label: "知识库设置",
  //           oncommand: `if (Zotero["${config.addonInstance}"]) { Zotero["${config.addonInstance}"].openSettings(); }`,
  //         },
  //         {
  //           tag: "menuitem",
  //           label: "提问",
  //           oncommand: `if (Zotero["${config.addonInstance}"]) { Zotero["${config.addonInstance}"].openQuestionDialog(); }`,
  //         },
  //         {
  //           tag: "menuitem",
  //           label: "历史记录",
  //           oncommand: `if (Zotero["${config.addonInstance}"]) { Zotero["${config.addonInstance}"].openHistoryDialog(); }`,
  //         },
  //         {
  //           tag: "menuitem",
  //           label: "设置",
  //           oncommand: `if (Zotero["${config.addonInstance}"]) { Zotero["${config.addonInstance}"].openSettings(); }`,
  //         },
  //       ],
  //     });

  //     // 在主菜单中添加分隔符和菜单项
  //     ztoolkit.Menu.register("menuTools", {
  //       tag: "menuseparator",
  //     });

  //     ztoolkit.Menu.register("menuTools", {
  //       tag: "menuitem",
  //       label: "RAGFlow",
  //       oncommand: `if (Zotero["${config.addonInstance}"]) { Zotero["${config.addonInstance}"].toggleUI(); }`,
  //     });

  //     Logger.debug({
  //       message: "Menu items registered successfully",
  //       context: "UIManager",
  //     });
  //   } catch (error) {
  //     Logger.error({
  //       message: "Failed to register menu items",
  //       context: "UIManager",
  //       error: error as Error,
  //     });
  //   }
  // }

  /**
   * 注册菜单项
   */
  private registerMenuItems(): void {
    try {
      // 添加右键菜单项
      const menuIcon = `chrome://${config.addonRef}/content/icons/favicon.png`;

      // 在集合右键菜单中添加RAGFlow条目
      ztoolkit.Menu.register("collection", {
        tag: "menuitem",
        id: "zotero-ragflow-collection-context",
        label: "发送到 RAGFlow 知识库",
        icon: menuIcon,
        oncommand: `if (Zotero["${config.addonInstance}"]) { Zotero["${config.addonInstance}"].openCollectionSelector(); }`,
      });

      // 获取主窗口
      const win = Zotero.getMainWindow();
      if (!win) {
        throw new Error("Main window not available");
      }

      // 获取主菜单栏
      const menubar = win.document.getElementById("main-menubar");
      if (!menubar) {
        throw new Error("Main menubar not found");
      }

      // 创建我们的菜单元素
      const ragflowMenu = ztoolkit.UI.createElement(win.document, "menu", {
        namespace: "xul",
        id: "zotero-ragflow-menu",
        attributes: {
          label: "RAGFlow AI",
        },
      });

      // 创建菜单弹出层
      const popup = ztoolkit.UI.createElement(win.document, "menupopup", {
        namespace: "xul",
        id: "zotero-ragflow-menupopup",
      });

      // 添加菜单项到弹出层
      const menuItems = [
        // {
        //   id: "zotero-ragflow-toggle",
        //   label: "打开聊天界面",
        //   oncommand: `if (Zotero["${config.addonInstance}"]) { Zotero["${config.addonInstance}"].toggleUI(); }`,
        // },
        {
          id: "zotero-ragflow-ask",
          label: "提问",
          oncommand: `if (Zotero["${config.addonInstance}"]) { Zotero["${config.addonInstance}"].openQuestionDialog(); }`,
        },
        { type: "separator" },
        {
          id: "zotero-ragflow-kb-select",
          label: "选择知识库",
          oncommand: `if (Zotero["${config.addonInstance}"]) { Zotero["${config.addonInstance}"].openKnowledgeBaseSelector(); }`,
        },
        {
          id: "zotero-ragflow-assistant",
          label: "助手设置",
          oncommand: `if (Zotero["${config.addonInstance}"]) { Zotero["${config.addonInstance}"].showAssistantSettings(); }`,
        },
        {
          id: "zotero-ragflow-history",
          label: "历史记录",
          oncommand: `if (Zotero["${config.addonInstance}"]) { Zotero["${config.addonInstance}"].openHistoryDialog(); }`,
        },
        { type: "separator" },
        {
          id: "zotero-ragflow-collection",
          label: "添加集合到知识库",
          oncommand: `if (Zotero["${config.addonInstance}"]) { Zotero["${config.addonInstance}"].openCollectionSelector(); }`,
        },
        { type: "separator" },
        {
          id: "zotero-ragflow-settings",
          label: "API设置",
          oncommand: `if (Zotero["${config.addonInstance}"]) { Zotero["${config.addonInstance}"].openSettings(); }`,
        },
      ];

      // 添加菜单项到弹出层
      for (const item of menuItems) {
        if (item.type === "separator") {
          popup.appendChild(
            ztoolkit.UI.createElement(win.document, "menuseparator", {
              namespace: "xul",
            }),
          );
        } else {
          popup.appendChild(
            ztoolkit.UI.createElement(win.document, "menuitem", {
              namespace: "xul",
              id: item.id,
              attributes: {
                label: item.label,
                oncommand: item.oncommand,
              },
            }),
          );
        }
      }

      // 将弹出层添加到菜单
      ragflowMenu.appendChild(popup);

      // 将菜单添加到主菜单栏 - 在Help菜单前插入
      const helpMenu = win.document.getElementById("helpMenu");
      if (helpMenu) {
        menubar.insertBefore(ragflowMenu, helpMenu);
      } else {
        // 如果找不到Help菜单，就直接添加到最后
        menubar.appendChild(ragflowMenu);
      }

      Logger.debug({
        message: "Main menu items registered successfully",
        context: "UIManager",
      });
    } catch (error) {
      Logger.error({
        message: "Failed to register menu items",
        context: "UIManager",
        error: error as Error,
      });
    }
  }

  /**
   * 注册物品面板部分
   */
  private registerItemPaneSection(): void {
    try {
      // 如果支持ItemPaneManager API (Zotero 7+)
      if (typeof Zotero.ItemPaneManager?.registerSection === "function") {
        Zotero.ItemPaneManager.registerSection({
          paneID: this.sectionId,
          pluginID: config.addonID,
          header: {
            // 从本地化文件获取标题，回退到硬编码字符串
            label: "RAGFlow",
            icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
          },
          sidenav: {
            // 从本地化文件获取提示文本，回退到硬编码字符串
            label: "RAGFlow AI Assistant",
            icon: `chrome://${config.addonRef}/content/icons/favicon.png`,
          },
          onRender: ({ body }: { body: HTMLElement }) => {
            // 渲染聊天界面
            this.renderChatInterface(body);
          },
        });

        Logger.debug({
          message: "Item pane section registered successfully",
          context: "UIManager",
        });
      } else {
        // 回退方案：创建侧边栏面板
        this.createSidebarPane();
      }
    } catch (error) {
      Logger.error({
        message: "Failed to register item pane section",
        context: "UIManager",
        error: error as Error,
      });

      // 尝试回退方案
      this.createSidebarPane();
    }
  }

  /**
   * 创建侧边栏面板 (备用方案)
   */
  private createSidebarPane(): void {
    try {
      // 获取主窗口
      const win = Zotero.getMainWindow();
      if (!win) {
        throw new Error("Main window not available");
      }

      // 获取侧边栏容器
      const sidebar = win.document.getElementById("zotero-view-tabbox");
      if (!sidebar) {
        throw new Error("Sidebar container not found");
      }

      // 创建标签页
      const tabs = sidebar.querySelector("tabs");
      if (!tabs) {
        throw new Error("Tabs element not found");
      }

      // 检查是否已存在我们的标签页
      if (win.document.getElementById(this.paneId + "-tab")) {
        Logger.debug({
          message: "RAGFlow tab already exists",
          context: "UIManager",
        });
        return;
      }

      // 创建新标签
      const tab = ztoolkit.UI.createElement(win.document, "tab", {
        namespace: "xul",
        id: this.paneId + "-tab",
        attributes: {
          label: "RAGFlow",
        },
      });
      tabs.appendChild(tab);

      // 创建标签面板
      const tabpanels = sidebar.querySelector("tabpanels");
      if (!tabpanels) {
        throw new Error("Tabpanels element not found");
      }

      // 创建新标签面板
      const tabpanel = ztoolkit.UI.createElement(win.document, "tabpanel", {
        namespace: "xul",
        id: this.paneId,
        attributes: {
          flex: "1",
        },
      });
      tabpanels.appendChild(tabpanel);

      // 渲染聊天界面
      this.renderChatInterface(tabpanel);

      Logger.debug({
        message: "Sidebar pane created successfully",
        context: "UIManager",
      });
    } catch (error) {
      Logger.error({
        message: "Failed to create sidebar pane",
        context: "UIManager",
        error: error as Error,
      });
    }
  }

  /**
   * 渲染聊天界面
   */
  private renderChatInterface(container: HTMLElement): void {
    try {
      // 创建主容器
      const mainContainer = ztoolkit.UI.createElement(
        container.ownerDocument,
        "vbox",
        {
          namespace: "xul",
          id: "ragflow-main-container",
          attributes: {
            flex: "1",
          },
        },
      );
      container.appendChild(mainContainer);

      // 创建知识库状态区域
      const statusBox = ztoolkit.UI.createElement(
        container.ownerDocument,
        "hbox",
        {
          namespace: "xul",
          id: "ragflow-status-box",
          attributes: {
            align: "center",
            style:
              "padding: 5px; background-color: #f0f0f0; border-bottom: 1px solid #cccccc;",
          },
        },
      );
      mainContainer.appendChild(statusBox);

      // 添加知识库状态标签
      const statusLabel = ztoolkit.UI.createElement(
        container.ownerDocument,
        "label",
        {
          namespace: "xul",
          id: "ragflow-kb-status",
          attributes: {
            value: "未选择知识库",
            style: "font-weight: bold;",
          },
        },
      );
      statusBox.appendChild(statusLabel);

      // 创建会话列表区域
      const sessionsBox = ztoolkit.UI.createElement(
        container.ownerDocument,
        "vbox",
        {
          namespace: "xul",
          id: "ragflow-sessions-box",
          attributes: {
            flex: "1",
            style: "overflow-y: auto; max-height: 150px; min-height: 100px;",
          },
        },
      );
      mainContainer.appendChild(sessionsBox);

      // 创建会话列表标签
      const sessionsLabel = ztoolkit.UI.createElement(
        container.ownerDocument,
        "label",
        {
          namespace: "xul",
          attributes: {
            value: "会话",
            style: "font-weight: bold; padding: 5px;",
          },
        },
      );
      sessionsBox.appendChild(sessionsLabel);

      // 创建会话列表
      const sessionsList = ztoolkit.UI.createElement(
        container.ownerDocument,
        "richlistbox",
        {
          namespace: "xul",
          id: "ragflow-sessions-list",
          attributes: {
            flex: "1",
          },
        },
      );
      sessionsBox.appendChild(sessionsList);

      // 创建聊天区域
      const chatBox = ztoolkit.UI.createElement(
        container.ownerDocument,
        "vbox",
        {
          namespace: "xul",
          id: "ragflow-chat-box",
          attributes: {
            flex: "3",
            style: "border-top: 1px solid #cccccc;",
          },
        },
      );
      mainContainer.appendChild(chatBox);

      // 创建聊天消息容器
      const messagesContainer = ztoolkit.UI.createElement(
        container.ownerDocument,
        "vbox",
        {
          namespace: "xul",
          id: "ragflow-messages-container",
          attributes: {
            flex: "1",
            style: "overflow-y: auto; padding: 10px;",
          },
        },
      );
      chatBox.appendChild(messagesContainer);

      // 创建输入区域
      const inputBox = ztoolkit.UI.createElement(
        container.ownerDocument,
        "hbox",
        {
          namespace: "xul",
          id: "ragflow-input-box",
          attributes: {
            align: "center",
            style: "padding: 10px; border-top: 1px solid #cccccc;",
          },
        },
      );
      chatBox.appendChild(inputBox);

      // 创建文本输入框
      const textInput = ztoolkit.UI.createElement(
        container.ownerDocument,
        "textbox",
        {
          namespace: "xul",
          id: "ragflow-text-input",
          attributes: {
            flex: "1",
            placeholder: "输入您的问题...",
            multiline: "true",
            rows: "3",
          },
        },
      );
      inputBox.appendChild(textInput);

      // 创建发送按钮
      const sendButton = ztoolkit.UI.createElement(
        container.ownerDocument,
        "button",
        {
          namespace: "xul",
          id: "ragflow-send-button",
          attributes: {
            label: "发送",
            style: "margin-left: 5px;",
          },
        },
      );
      inputBox.appendChild(sendButton);

      // 添加发送按钮点击事件
      sendButton.addEventListener("command", () => {
        const question = textInput.value;
        if (question.trim()) {
          // 清空输入框
          textInput.value = "";

          // 发布消息事件
          eventBus.emit(Events.SEND_MESSAGE, question);

          // 如果Zotero实例存在，调用处理问题的方法
          if (Zotero[config.addonInstance]) {
            Zotero[config.addonInstance].processQuestion(question);
          }
        }
      });

      // 监听show-chat-result事件
      if (typeof document !== "undefined") {
        document.addEventListener("ragflow:show_chat_result", (e: any) => {
          const detail = e.detail;
          if (detail) {
            this.addChatMessage("user", detail.question);
            this.addChatMessage("assistant", detail.answer);
          }
        });
      }

      Logger.debug({
        message: "Chat interface rendered successfully",
        context: "UIManager",
      });
    } catch (error) {
      Logger.error({
        message: "Failed to render chat interface",
        context: "UIManager",
        error: error as Error,
      });
    }
  }

  /**
   * 添加聊天消息
   */
  private addChatMessage(role: "user" | "assistant", content: string): void {
    try {
      const win = Zotero.getMainWindow();
      if (!win) {
        return;
      }

      const messagesContainer = win.document.getElementById(
        "ragflow-messages-container",
      );
      if (!messagesContainer) {
        return;
      }

      // 创建消息容器
      const messageBox = ztoolkit.UI.createElement(win.document, "hbox", {
        namespace: "xul",
        attributes: {
          align: role === "user" ? "end" : "start",
          style: "width: 100%; margin-bottom: 10px;",
        },
      });
      messagesContainer.appendChild(messageBox);

      // 创建消息气泡
      const messageBubble = ztoolkit.UI.createElement(
        win.document,
        "description",
        {
          namespace: "xul",
          attributes: {
            style: `
            max-width: 80%; 
            padding: 8px 12px; 
            border-radius: 8px; 
            background-color: ${role === "user" ? "#dcf8c6" : "#f0f0f0"};
            color: ${role === "user" ? "#000000" : "#000000"};
          `,
          },
        },
      );
      messageBox.appendChild(messageBubble);

      // 设置消息内容
      messageBubble.textContent = content;

      // 滚动到底部
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } catch (error) {
      Logger.error({
        message: "Failed to add chat message",
        context: "UIManager",
        error: error as Error,
      });
    }
  }

  /**
   * 切换面板可见性
   */
  private togglePaneVisibility(visible: boolean): void {
    try {
      // 对于ItemPaneManager实现
      if (typeof Zotero.ItemPaneManager?.toggleSection === "function") {
        Zotero.ItemPaneManager.toggleSection(this.sectionId, visible);
        return;
      }

      // 备用实现：切换标签页
      const win = Zotero.getMainWindow();
      if (!win) {
        return;
      }

      const tabbox = win.document.getElementById("zotero-view-tabbox");
      if (!tabbox) {
        return;
      }

      const tab = win.document.getElementById(this.paneId + "-tab");
      if (!tab) {
        return;
      }

      // 如果需要显示并且当前不是选中状态，则选中标签页
      if (visible && tabbox.selectedTab !== tab) {
        tabbox.selectedTab = tab;
      }
    } catch (error) {
      Logger.error({
        message: "Failed to toggle pane visibility",
        context: "UIManager",
        error: error as Error,
      });
    }
  }

  /**
   * 显示面板
   */
  public show(): void {
    if (!this.isVisible) {
      eventBus.emit(Events.PANE_VISIBILITY_CHANGED, true);
    }
  }

  /**
   * 隐藏面板
   */
  public hide(): void {
    if (this.isVisible) {
      eventBus.emit(Events.PANE_VISIBILITY_CHANGED, false);
    }
  }

  /**
   * 切换面板显示/隐藏
   */
  public toggle(): void {
    eventBus.emit(Events.PANE_VISIBILITY_CHANGED, !this.isVisible);
  }

  /**
   * 获取当前UI配置
   */
  public getConfig(): Required<UIManagerConfig> {
    return { ...this.config };
  }

  /**
   * 更新UI配置
   */
  public updateConfig(config: Partial<UIManagerConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };

    Logger.debug({
      message: "Configuration updated",
      context: "UIManager",
      data: config,
    });
  }

  /**
   * 显示设置面板
   */
  private showSettingsPanel(): void {
    try {
      // 获取主窗口
      const win = Zotero.getMainWindow();
      if (!win) return;

      Logger.info({
        message: "创建设置界面",
        context: "UIManager",
      });

      // 获取当前配置的值，避免显示为 undefined
      const apiKey =
        (Zotero.Prefs.get(`${config.prefsPrefix}.apiKey`, true) as string) ||
        "";
      const apiUrl =
        (Zotero.Prefs.get(`${config.prefsPrefix}.apiUrl`, true) as string) ||
        "http://127.0.0.1:8000";

      // 创建设置对话框
      const dialog = new ztoolkit.Dialog(4, 1)
        // 添加标题
        .addCell(0, 0, {
          tag: "h2",
          namespace: "html",
          properties: { innerHTML: "RAGFlow API 设置" },
          styles: {
            marginBottom: "20px",
            color: "#2d2d2d",
            textAlign: "center",
          },
        })
        // API Key 相关元素
        .addCell(1, 0, {
          tag: "div",
          namespace: "html",
          styles: { marginBottom: "15px" },
          children: [
            {
              tag: "label",
              namespace: "html",
              attributes: { for: "ragflow-api-key" },
              properties: { innerHTML: "API Key" },
              styles: {
                display: "block",
                marginBottom: "5px",
                fontWeight: "bold",
              },
            },
            {
              tag: "input",
              namespace: "html",
              id: "ragflow-api-key",
              attributes: {
                type: "password",
                "data-bind": "apiKey",
                "data-prop": "value",
                placeholder: "输入您的 RAGFlow API 密钥",
                value: apiKey,
              },
              styles: {
                width: "100%",
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              },
            },
          ],
        })
        // API URL相关元素
        .addCell(2, 0, {
          tag: "div",
          namespace: "html",
          styles: { marginBottom: "15px" },
          children: [
            {
              tag: "label",
              namespace: "html",
              attributes: { for: "ragflow-api-url" },
              properties: { innerHTML: "API URL" },
              styles: {
                display: "block",
                marginBottom: "5px",
                fontWeight: "bold",
              },
            },
            {
              tag: "input",
              namespace: "html",
              id: "ragflow-api-url",
              attributes: {
                type: "text",
                "data-bind": "apiUrl",
                "data-prop": "value",
                placeholder: "如: http://127.0.0.1:8000",
                value: apiUrl,
              },
              styles: {
                width: "100%",
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #ccc",
              },
            },
          ],
        })
        // 帮助信息
        .addCell(3, 0, {
          tag: "div",
          namespace: "html",
          styles: {
            margin: "15px 0",
            padding: "10px",
            backgroundColor: "#f8f8f8",
            borderRadius: "4px",
            fontSize: "0.9em",
          },
          properties: {
            innerHTML:
              "请配置您的 RAGFlow API 密钥和 URL。如果您使用的是本地部署的 RAGFlow，默认 URL 通常为 http://127.0.0.1:8000。",
          },
        })
        // 添加保存按钮
        .addButton("保存", "save")
        // 添加取消按钮
        .addButton("取消", "cancel")
        // 设置对话框数据
        .setDialogData({
          apiKey: apiKey,
          apiUrl: apiUrl,
          unloadCallback: () => {
            const dialogData = dialog.dialogData;
            if (dialogData._lastButtonId === "save") {
              Logger.info({
                message: "正在保存RAGFlow配置设置",
                context: "UIManager",
              });

              // 保存设置 - 使用绑定的数据而不是通过DOM获取
              Zotero.Prefs.set(
                `${config.prefsPrefix}.apiKey`,
                dialogData.apiKey,
                true,
              );
              Zotero.Prefs.set(
                `${config.prefsPrefix}.apiUrl`,
                dialogData.apiUrl,
                true,
              );
              Logger.info({
                message: "RAGFlow配置已保存",
                context: "UIManager",
              });

              // 更新服务配置
              if (Zotero[config.addonInstance]) {
                // 获取插件实例并重新加载配置
                const addon = Zotero[config.addonInstance];
                if (typeof addon.loadConfiguration === "function") {
                  addon.loadConfiguration();
                }
              }

              // 显示成功提示
              this.showNotification("设置已保存", "success");
            }
          },
        });

      // 打开对话框
      dialog.open("RAGFlow 设置", {
        width: 450,
        height: 350,
        centerscreen: true,
        resizable: true,
      });

      Logger.debug({
        message: "Settings panel opened",
        context: "UIManager",
      });
    } catch (error) {
      Logger.error({
        message: "Failed to show settings panel",
        context: "UIManager",
        error: error as Error,
      });
    }
  }

  /**
   * 显示知识库选择器
   * @param currentId 当前选择的知识库ID
   * @param fromQuestionPanel 是否从问题面板调用，如果是则选择完成后返回问题面板
   */
  private async showKnowledgeBaseSelector(
    currentId?: string,
    fromQuestionPanel: boolean = false,
  ): Promise<void> {
    try {
      // 获取主窗口
      const win = Zotero.getMainWindow();
      if (!win) return;

      // 显示进度窗口
      const progressWindow = new ztoolkit.ProgressWindow("RAGFlow", {
        closeOnClick: false,
      });
      progressWindow.createLine({
        text: "正在加载知识库列表...",
        type: "default",
      });
      progressWindow.show();

      // 调用API获取知识库列表
      let datasets: { id: string; name: string }[] = [];

      try {
        datasets = await ragflow.listDatasets();
        Logger.debug({
          message: "Knowledge base list fetched successfully",
          context: "UIManager",
          data: datasets,
        });

        // 添加更详细的日志信息
        Logger.debug({
          message: `Knowledge base count: ${datasets.length}`,
          context: "UIManager",
        });

        if (datasets.length > 0) {
          Logger.debug({
            message: "First knowledge base details",
            context: "UIManager",
            data: datasets[0],
          });
        } else {
          Logger.debug({
            message: "No knowledge bases found, but API call succeeded",
            context: "UIManager",
          });
        }
      } catch (err) {
        // 错误处理
        progressWindow.close();
        this.showNotification(
          "获取知识库列表失败: " +
            (err instanceof Error ? err.message : String(err)),
          "error",
        );
        return;
      }

      // 关闭进度窗口
      progressWindow.close();

      if (datasets.length === 0) {
        this.showNotification("未找到知识库，请先创建知识库", "warning");
        return;
      }

      // 创建知识库选择对话框
      Logger.debug({
        message: "Creating knowledge base selection dialog",
        context: "UIManager",
        data: { datasetCount: datasets.length },
      });

      // 创建知识库选择对话框 - 使用div列表代替menulist
      const dialog = new ztoolkit.Dialog(3, 1)
        .addCell(0, 0, {
          tag: "h3",
          namespace: "html",
          properties: { innerHTML: "选择要使用的知识库" },
          styles: {
            marginBottom: "15px",
            color: "#2d2d2d",
            textAlign: "center",
            borderBottom: "1px solid #eee",
            paddingBottom: "10px",
          },
        })
        // 添加说明文本
        .addCell(1, 0, {
          tag: "p",
          namespace: "html",
          properties: {
            innerHTML: "请从下列知识库中选择一个用于问答:",
          },
          styles: {
            marginBottom: "10px",
            color: "#666",
          },
        })
        // 使用div列表代替menulist
        .addCell(2, 0, {
          tag: "div",
          namespace: "html",
          id: "kb-list-container",
          styles: {
            maxHeight: "300px",
            overflowY: "auto",
            border: "1px solid #eee",
            borderRadius: "4px",
            padding: "5px",
          },
          children: datasets.map((dataset, index) => {
            const isSelected = dataset.id === currentId;

            return {
              tag: "div",
              namespace: "html",
              attributes: {
                "data-kb-id": dataset.id,
                "data-kb-name": dataset.name,
                "data-index": index.toString(),
                class: "kb-item",
              },
              styles: {
                padding: "10px 15px",
                margin: "5px 0",
                backgroundColor: isSelected ? "#e6f7ff" : "#f9f9f9",
                border: `1px solid ${isSelected ? "#91d5ff" : "#eee"}`,
                borderRadius: "4px",
                cursor: "pointer",
                position: "relative",
              },
              properties: {
                innerHTML: `<span style="font-weight: ${isSelected ? "bold" : "normal"};">${dataset.name}</span>
                          ${isSelected ? '<span style="color: #1890ff; position: absolute; right: 15px;">✓ 当前使用</span>' : ""}`,
              },
            };
          }),
        })
        .addButton("选择", "select")
        .addButton("取消", "cancel")
        .setDialogData({
          selectedId: currentId || null,
          selectedName: "",
          loadCallback: () => {
            // 为所有知识库项添加点击事件
            const kbItems = dialog.window.document.querySelectorAll(".kb-item");
            kbItems.forEach((item) => {
              item.addEventListener("click", (event) => {
                // 清除所有高亮
                kbItems.forEach((item) => {
                  (item as HTMLElement).style.backgroundColor = "#f9f9f9";
                  (item as HTMLElement).style.border = "1px solid #eee";
                  item.querySelector("span")!.style.fontWeight = "normal";

                  // 移除选中标记
                  const checkmark = item.querySelector("span:last-child");
                  if (checkmark && checkmark.textContent?.includes("✓")) {
                    checkmark.remove();
                  }
                });

                // 高亮选中的条目
                const target = event.currentTarget as HTMLElement;
                target.style.backgroundColor = "#e6f7ff";
                target.style.border = "1px solid #91d5ff";
                target.querySelector("span")!.style.fontWeight = "bold";

                // 添加选中标记
                if (
                  !target.querySelector("span:last-child") ||
                  !target
                    .querySelector("span:last-child")!
                    .textContent?.includes("✓")
                ) {
                  const checkSpan = win.document.createElement("span");
                  checkSpan.style.color = "#1890ff";
                  checkSpan.style.position = "absolute";
                  checkSpan.style.right = "15px";
                  checkSpan.textContent = "✓ 当前使用";
                  target.appendChild(checkSpan);
                }

                // 更新选中的知识库ID
                dialog.dialogData.selectedId =
                  target.getAttribute("data-kb-id");
                dialog.dialogData.selectedName =
                  target.getAttribute("data-kb-name");

                Logger.debug({
                  message: `User selected knowledge base: ${dialog.dialogData.selectedId} (${dialog.dialogData.selectedName})`,
                  context: "UIManager",
                });
              });
            });
          },
          unloadCallback: () => {
            if (
              dialog.dialogData._lastButtonId === "select" &&
              dialog.dialogData.selectedId
            ) {
              Logger.info({
                message: `用户确认选择知识库: ${dialog.dialogData.selectedId}`,
                context: "UIManager",
              });

              // 使用addon对象设置知识库
              if (Zotero[config.addonInstance]) {
                Zotero[config.addonInstance].setKnowledgeBase(
                  dialog.dialogData.selectedId,
                  dialog.dialogData.selectedName,
                );

                // 显示成功通知
                this.showNotification(
                  `已选择知识库: ${dialog.dialogData.selectedName}`,
                  "success",
                );

                // 如果是从问题面板调用的，自动返回问题面板
                if (fromQuestionPanel) {
                  Logger.debug({
                    message: "从知识库选择器返回问题面板",
                    context: "UIManager",
                  });

                  // 使用setTimeout确保选择对话框完全关闭后再打开问题面板
                  setTimeout(() => {
                    this.showQuestionPanel(dialog.dialogData.selectedId);
                  }, 200);
                }
              }
            }
          },
        });

      // 记录准备打开对话框的日志
      Logger.debug({
        message: "Opening knowledge base selection dialog",
        context: "UIManager",
        data: { datasetCount: datasets.length },
      });

      dialog.open("RAGFlow 知识库选择", {
        width: 500,
        height: 400,
        centerscreen: true,
        resizable: true,
      });

      Logger.debug({
        message: "Knowledge base selector opened",
        context: "UIManager",
      });
    } catch (error) {
      Logger.error({
        message: "Failed to show knowledge base selector",
        context: "UIManager",
        error: error as Error,
      });
    }
  }

  /**
   * 显示问题面板
   */
  private showQuestionPanel(kbId?: string): void {
    try {
      // 获取主窗口
      const win = Zotero.getMainWindow();
      if (!win) return;

      // 获取知识库名称
      const currentKbId =
        kbId ||
        (Zotero.Prefs.get(`${config.prefsPrefix}.kbId`, true) as string);
      const kbName =
        (Zotero.Prefs.get(`${config.prefsPrefix}.kbName`, true) as string) ||
        "未命名知识库";

      Logger.debug({
        message: `显示问题面板，当前知识库: ${kbName} (ID: ${currentKbId})`,
        context: "UIManager",
      });

      // 创建问题对话框
      const dialog = new ztoolkit.Dialog(4, 1)
        // 标题
        .addCell(0, 0, {
          tag: "h3",
          namespace: "html",
          properties: { innerHTML: "知识库问答" },
          styles: {
            margin: "0 0 15px 0",
            color: "#2d2d2d",
            textAlign: "center",
            borderBottom: "1px solid #eee",
            paddingBottom: "10px",
          },
        })
        // 知识库信息区域 - 使用HTML div提高视觉效果
        .addCell(1, 0, {
          tag: "div",
          namespace: "html",
          styles: {
            display: "flex",
            alignItems: "center",
            backgroundColor: "#f0f7ff",
            padding: "8px 12px",
            borderRadius: "4px",
            marginBottom: "15px",
            border: "1px solid #d0e0ff",
          },
          children: [
            {
              tag: "span",
              namespace: "html",
              styles: {
                marginRight: "10px",
                fontWeight: "bold",
                color: "#0066cc",
              },
              properties: { textContent: "当前知识库:" },
            },
            {
              tag: "span",
              namespace: "html",
              styles: {
                flex: "1",
                color: "#333",
              },
              properties: { textContent: kbName },
            },
            {
              tag: "button",
              namespace: "html",
              id: "kb-settings-button",
              properties: { textContent: "设置" },
              styles: {
                padding: "2px 8px",
                fontSize: "0.9em",
                cursor: "pointer",
                marginRight: "5px",
              },
            },
            {
              tag: "button",
              namespace: "html",
              id: "kb-switch-button",
              properties: { textContent: "切换" },
              styles: {
                padding: "2px 8px",
                fontSize: "0.9em",
                cursor: "pointer",
              },
            },
          ],
        })
        // 说明文本
        .addCell(2, 0, {
          tag: "p",
          namespace: "html",
          properties: {
            innerHTML: "请输入您的问题，系统将从知识库中查找相关信息：",
          },
          styles: {
            marginBottom: "10px",
            color: "#444",
            fontSize: "0.9em",
          },
        })
        // 问题输入区域 - 使用HTML textarea而不是XUL textbox
        .addCell(3, 0, {
          tag: "textarea",
          namespace: "html",
          id: "question-input",
          attributes: {
            "data-bind": "question",
            "data-prop": "value",
            rows: "5",
            placeholder: "请在此处输入您的问题...",
          },
          styles: {
            width: "100%",
            minHeight: "120px",
            padding: "10px",
            marginBottom: "10px",
            borderRadius: "4px",
            border: "1px solid #ccc",
            fontFamily: "inherit",
            fontSize: "1em",
            resize: "vertical",
          },
        })
        // 添加按钮
        .addButton("提问", "ask")
        .addButton("取消", "cancel")
        .setDialogData({
          question: "", // 添加这个属性来存储问题文本
          loadCallback: () => {
            Logger.debug({
              message: "问题对话框加载完成，设置事件监听器",
              context: "UIManager",
            });

            // 为设置按钮添加点击事件
            const settingsButton =
              dialog.window.document.getElementById("kb-settings-button");
            if (settingsButton) {
              settingsButton.addEventListener("click", () => {
                Logger.debug({
                  message: "用户点击了助手设置按钮",
                  context: "UIManager",
                });

                dialog.window.close();
                setTimeout(() => {
                  // 调用助手设置对话框
                  this.showAssistantSettings(currentKbId);
                }, 100);
              });
            } else {
              Logger.error({
                message: "设置按钮未找到",
                context: "UIManager",
              });
            }
            // 为切换按钮添加点击事件
            const switchButton =
              dialog.window.document.getElementById("kb-switch-button");
            if (switchButton) {
              switchButton.addEventListener("click", () => {
                Logger.debug({
                  message: "用户点击了切换知识库按钮",
                  context: "UIManager",
                });

                dialog.window.close();
                setTimeout(() => {
                  // 调用知识库选择器，并标记是从问题面板调用的
                  this.showKnowledgeBaseSelector(currentKbId, true);
                }, 100);
              });
            } else {
              Logger.error({
                message: "切换按钮未找到",
                context: "UIManager",
              });
            }
          },
          unloadCallback: () => {
            if (dialog.dialogData._lastButtonId === "ask") {
              // 获取问题文本 - 首先通过绑定的dialogData获取
              const question = dialog.dialogData.question || "";

              if (question.trim()) {
                Logger.info({
                  message: `用户提问: ${question.trim()}`,
                  context: "UIManager",
                });

                // 处理问题
                if (Zotero[config.addonInstance]) {
                  Zotero[config.addonInstance].processQuestion(question.trim());
                } else {
                  Logger.error({
                    message: "Zotero插件实例不存在，无法处理问题",
                    context: "UIManager",
                  });
                }
              } else {
                // 添加错误日志
                Logger.error({
                  message: "问题内容为空",
                  context: "UIManager",
                });

                this.showNotification("请输入问题内容", "warning");
              }
            }
          },
        });

      // 打开对话框并设置合适的尺寸
      dialog.open("RAGFlow 问答", {
        width: 550,
        height: 350,
        centerscreen: true,
        resizable: true,
      });

      Logger.debug({
        message: "问题面板已打开",
        context: "UIManager",
      });
    } catch (error) {
      Logger.error({
        message: "Failed to show question panel",
        context: "UIManager",
        error: error as Error,
      });

      // 显示错误通知
      this.showNotification("打开问答面板失败", "error");
    }
  }

  /**
   * 显示聊天结果
   */
  private showChatResult(
    question: string,
    answer: string,
    sources?: any[],
  ): void {
    try {
      // 获取主窗口
      const win = Zotero.getMainWindow();
      if (!win) return;

      // 显示面板
      this.show();

      // 添加消息到聊天界面
      this.addChatMessage("user", question);
      this.addChatMessage("assistant", answer);

      // 如果没有使用面板界面，则显示对话框
      const messagesContainer = win.document.getElementById(
        "ragflow-messages-container",
      );
      if (!messagesContainer) {
        // 创建结果对话框
        const dialog = new ztoolkit.Dialog(4, 1)
          .addCell(0, 0, {
            tag: "description",
            properties: { innerHTML: "<h3>问答结果</h3>" },
            styles: { marginBottom: "15px", textAlign: "center" },
          })
          // 问题
          .addCell(1, 0, {
            tag: "vbox",
            namespace: "xul",
            children: [
              {
                tag: "label",
                namespace: "xul",
                attributes: { value: "问题：" },
                styles: { fontWeight: "bold", marginBottom: "5px" },
              },
              {
                tag: "description",
                properties: { innerHTML: question },
                styles: {
                  padding: "10px",
                  backgroundColor: "#f0f0f0",
                  borderRadius: "4px",
                  marginBottom: "15px",
                },
              },
            ],
          })
          // 回答
          .addCell(2, 0, {
            tag: "vbox",
            namespace: "xul",
            children: [
              {
                tag: "label",
                namespace: "xul",
                attributes: { value: "回答：" },
                styles: { fontWeight: "bold", marginBottom: "5px" },
              },
              {
                tag: "description",
                properties: { innerHTML: answer },
                styles: {
                  padding: "10px",
                  backgroundColor: "#e6f7ff",
                  borderRadius: "4px",
                  marginBottom: "15px",
                },
              },
            ],
          })
          // 来源
          .addCell(3, 0, {
            tag: "vbox",
            namespace: "xul",
            id: "sources-container",
            styles: {
              display: sources && sources.length > 0 ? "block" : "none",
            },
            children:
              sources && sources.length > 0
                ? [
                    {
                      tag: "label",
                      namespace: "xul",
                      attributes: { value: "参考来源：" },
                      styles: { fontWeight: "bold", marginBottom: "5px" },
                    },
                    ...sources.map((source, index) => ({
                      tag: "vbox",
                      namespace: "xul",
                      styles: {
                        padding: "10px",
                        backgroundColor: "#f9f9f9",
                        borderRadius: "4px",
                        marginBottom: "10px",
                        border: "1px solid #eee",
                      },
                      children: [
                        {
                          tag: "label",
                          namespace: "xul",
                          attributes: {
                            value: `来源 ${index + 1}: ${source.document_name || "未知文档"}`,
                          },
                          styles: { fontWeight: "bold", marginBottom: "5px" },
                        },
                        {
                          tag: "description",
                          properties: {
                            innerHTML:
                              source.content && source.content.length > 300
                                ? source.content.substring(0, 300) + "..."
                                : source.content || "无内容",
                          },
                          styles: { fontSize: "0.9em" },
                        },
                      ],
                    })),
                  ]
                : [],
          })
          .addButton("复制回答", "copy")
          .addButton("再次提问", "ask-again")
          .addButton("关闭", "close")
          .setDialogData({
            unloadCallback: () => {
              const dialogData = dialog.dialogData;
              if (dialogData._lastButtonId === "copy") {
                // 复制回答到剪贴板
                Zotero.Utilities.Internal.copyTextToClipboard(answer);
                this.showNotification("回答已复制到剪贴板", "success");
              } else if (dialogData._lastButtonId === "ask-again") {
                // 再次提问
                setTimeout(() => this.showQuestionPanel(), 100);
              }
            },
          });

        dialog.open("RAGFlow 问答结果", {
          width: 700,
          height: 500,
          centerscreen: true,
          resizable: true,
        });
      }

      Logger.debug({
        message: "Chat result displayed",
        context: "UIManager",
      });
    } catch (error) {
      Logger.error({
        message: "Failed to show chat result",
        context: "UIManager",
        error: error as Error,
      });
    }
  }

  /**
   * 显示历史记录面板
   */
  private showHistoryPanel(): void {
    try {
      this.showNotification("历史记录功能尚未实现", "warning");

      // TODO: 实现历史记录显示逻辑

      Logger.debug({
        message: "History panel show requested (not implemented)",
        context: "UIManager",
      });
    } catch (error) {
      Logger.error({
        message: "Failed to show history panel",
        context: "UIManager",
        error: error as Error,
      });
    }
  }

  /**
   * 显示助手设置面板
   * @param knowledgeBaseId 知识库ID
   * @param assistantId 可选的助手ID
   */
  /**
   * 显示助手设置面板
   * @param knowledgeBaseId 知识库ID
   * @param assistantId 可选的助手ID
   */
  public async showAssistantSettings(
    knowledgeBaseId?: string,
    assistantId?: string,
  ): Promise<void> {
    try {
      // 添加开始执行的日志
      Logger.debug({
        message: "showAssistantSettings 方法开始执行",
        context: "UIManager",
        data: { knowledgeBaseId, assistantId },
      });

      // 确保有知识库ID
      if (!knowledgeBaseId) {
        // 尝试从偏好设置获取
        knowledgeBaseId = Zotero.Prefs.get(
          `${config.prefsPrefix}.kbId`,
          true,
        ) as string;

        // 记录从偏好设置获取的ID
        Logger.debug({
          message: `从偏好设置获取知识库ID: ${knowledgeBaseId || "未找到"}`,
          context: "UIManager",
        });

        if (!knowledgeBaseId) {
          this.showNotification("请先选择知识库", "warning");

          // 打开知识库选择器
          setTimeout(() => {
            this.showKnowledgeBaseSelector();
          }, 500);

          return;
        }
      }

      // 获取知识库名称
      const knowledgeBaseName =
        (Zotero.Prefs.get(`${config.prefsPrefix}.kbName`, true) as string) ||
        "未命名知识库";

      // 新增：如果没有提供助手ID，尝试获取知识库对应的助手ID
      if (!assistantId) {
        try {
          // 尝试导入sessionService
          const { sessionService } = await import("../services/core/session");

          // 首先从新存储格式查找
          // const assistant =
          //   await sessionService.assistantStorage.getAssistantByKnowledgeBase(
          //     knowledgeBaseId,
          //   );
          const assistants = await sessionService.getAssistants();
          const matchingAssistant = assistants.find(
            (a) => a.knowledgeBaseId === knowledgeBaseId,
          );

          if (matchingAssistant) {
            assistantId = matchingAssistant.id;
            Logger.debug({
              message: `为知识库找到对应的助手ID: ${assistantId}`,
              context: "UIManager",
            });
          } else {
            // 如果新格式中找不到，尝试从旧格式查找
            assistantId = Zotero.Prefs.get(
              `zotero-ragflow.chatAssistant.${knowledgeBaseId}`,
              true,
            ) as string;

            if (assistantId) {
              Logger.debug({
                message: `从旧格式存储中找到助手ID: ${assistantId}`,
                context: "UIManager",
              });
            } else {
              Logger.debug({
                message: `未找到知识库 ${knowledgeBaseId} 对应的助手ID，将创建新助手`,
                context: "UIManager",
              });
            }
          }
        } catch (e) {
          Logger.warn({
            message: `查找助手ID时出错: ${e instanceof Error ? e.message : String(e)}`,
            context: "UIManager",
            error: e as Error,
          });
        }
      }

      // 动态导入前记录日志
      Logger.debug({
        message: "准备动态导入 assistantSettingsDialog 模块",
        context: "UIManager",
      });

      // 导入助手设置对话框
      const { showAssistantSettingsDialog } = await import(
        "./assistantSettingsDialog"
      );

      // 导入成功后记录日志
      Logger.debug({
        message: "助手设置对话框模块导入成功",
        context: "UIManager",
      });

      Logger.info({
        message: `打开助手设置面板: 知识库=${knowledgeBaseName} (${knowledgeBaseId}), 助手ID=${assistantId || "未找到"}`,
        context: "UIManager",
      });

      // 调用对话框前记录日志
      Logger.debug({
        message: "准备调用 showAssistantSettingsDialog 函数",
        context: "UIManager",
        data: { knowledgeBaseId, knowledgeBaseName, assistantId },
      });

      // 显示助手设置对话框
      const result = await showAssistantSettingsDialog(
        knowledgeBaseId,
        knowledgeBaseName,
        assistantId,
      );

      // 记录对话框返回结果
      Logger.debug({
        message: `showAssistantSettingsDialog 返回结果: ${result}`,
        context: "UIManager",
      });

      if (result) {
        Logger.info({ message: "助手设置已保存", context: "UIManager" });
      } else {
        Logger.info({ message: "用户取消了助手设置", context: "UIManager" });
      }
    } catch (error) {
      // 增强错误日志，包含完整的错误详情和堆栈信息
      const errorMsg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      Logger.error({
        message: `显示助手设置面板失败: ${errorMsg}`,
        context: "UIManager",
        error: error as Error,
        data: {
          stack,
          knowledgeBaseId,
          assistantId,
          errorType: error ? typeof error : "unknown",
          errorName: error instanceof Error ? error.name : "N/A",
        },
      });

      this.showNotification(`无法打开助手设置: ${errorMsg}`, "error");
    }
  }

  /**
   * 显示通知
   */
  private showNotification(
    message: string,
    type: "success" | "warning" | "error" = "success",
  ): void {
    const progressWindow = new ztoolkit.ProgressWindow("RAGFlow");
    progressWindow.createLine({
      text: message,
      type,
    });
    progressWindow.show();
    progressWindow.startCloseTimer(3000);
  }

  /**
   * 清理和释放资源
   */
  public dispose(): void {
    try {
      // 移除UI元素
      if (typeof Zotero.ItemPaneManager?.unregisterSection === "function") {
        Zotero.ItemPaneManager.unregisterSection(this.sectionId);
      } else {
        // 移除侧边栏标签页
        const win = Zotero.getMainWindow();
        if (win) {
          const tab = win.document.getElementById(this.paneId + "-tab");
          if (tab) {
            tab.remove();
          }

          const tabpanel = win.document.getElementById(this.paneId);
          if (tabpanel) {
            tabpanel.remove();
          }
        }
      }

      // 清除单例实例
      UIManager.instance = undefined!;

      Logger.info({
        message: "UI manager disposed",
        context: "UIManager",
      });
    } catch (error) {
      Logger.error({
        message: "Failed to dispose UI manager",
        context: "UIManager",
        error: error as Error,
      });
    }
  }
}
