import { getString, initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { config } from "../package.json";
import { UIManager } from "./modules.next/ui/uiManager";
// Add declaration for global objects
declare const ztoolkit: any;
declare const addon: any;
declare const Zotero: any;

async function onStartup() {
  // 初始化插件
  addon.data.env =
    process.env.NODE_ENV === "development" ? "development" : "production";
  ztoolkit.log(`${config.addonName} startup`, config.addonName);

  // 等待 Zotero 完全初始化
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  // 初始化本地化资源
  initLocale();

  // 调用 addon 对象的 onStartup 方法
  // 这将触发UI初始化和其他初始化
  await addon.onStartup();

  // 为每个主窗口加载插件
  await Promise.all(
    Zotero.getMainWindows().map((win: Window) => onMainWindowLoad(win)),
  );

  // 注册工具栏按钮
  registerToolbarButton();
}

function registerToolbarButton() {
  try {
    // 检查ztoolkit是否已正确初始化
    if (!ztoolkit) {
      ztoolkit.log(
        "ztoolkit not initialized, creating toolkit",
        config.addonName,
      );
      addon.data.ztoolkit = createZToolkit();
    }

    // 提前记录日志，帮助诊断问题
    ztoolkit.log("Starting to register toolbar button", config.addonName);
    ztoolkit.log(`ztoolkit object type: ${typeof ztoolkit}`, config.addonName);

    if (ztoolkit.UI && typeof ztoolkit.UI.createButton === "function") {
      // 使用ztoolkit.UI.createButton
      ztoolkit.log("Using ztoolkit.UI.createButton", config.addonName);

      // 在Zotero工具栏中添加按钮
      const toolbarButton = ztoolkit.UI.createButton({
        id: "ragflow-toolbar-button",
        icon: `chrome://zotero-ragflow/content/icons/favicon.png`,
        tooltip: "RAGFlow",
        type: "menu",
        onInit: (button: any) => {
          // 获取当前Zotero窗口，而不是依赖全局window
          const currentWindow = Zotero.getMainWindow();
          if (!currentWindow || !currentWindow.document) {
            ztoolkit.log(
              "No valid window found for menu creation",
              config.addonName,
            );
            return;
          }

          const menupopup = ztoolkit.UI.createElement(
            currentWindow.document,
            "menupopup",
            {
              id: "ragflow-menu",
            },
          );

          // 创建菜单项
          // 创建菜单项
          const menuItems = [
            {
              id: "ragflow-settings",
              label: "插件设置",
              onCommand: () => {
                if (Zotero[config.addonInstance]) {
                  Zotero[config.addonInstance].openSettings();
                }
              },
            },
            {
              id: "ragflow-create-kb",
              label: "创建知识库",
              onCommand: () => {
                if (Zotero[config.addonInstance]) {
                  Zotero[config.addonInstance].openCollectionSelector();
                }
              },
            },
            {
              id: "ragflow-select-kb",
              label: "选择知识库",
              onCommand: () => {
                if (Zotero[config.addonInstance]) {
                  Zotero[config.addonInstance].openKnowledgeBaseSelector();
                }
              },
            },
            {
              id: "ragflow-assistant-settings",
              label: "助手设置",
              onCommand: () => {
                const uiManager = UIManager.getInstance();
                uiManager.showAssistantSettings();
              },
            },
            {
              id: "ragflow-ask",
              label: "提问",
              onCommand: () => {
                if (Zotero[config.addonInstance]) {
                  Zotero[config.addonInstance].openQuestionDialog();
                }
              },
            },
            {
              id: "ragflow-history",
              label: "历史记录",
              onCommand: () => {
                if (Zotero[config.addonInstance]) {
                  Zotero[config.addonInstance].openHistoryDialog();
                }
              },
            },
          ];

          // 添加菜单项
          for (const item of menuItems) {
            const menuitem = ztoolkit.UI.createElement(
              currentWindow.document,
              "menuitem",
              {
                id: item.id,
                label: item.label,
              },
            );
            menuitem.addEventListener("command", item.onCommand);
            menupopup.appendChild(menuitem);
          }

          button.appendChild(menupopup);
        },
      });

      ztoolkit.log("Toolbar button registered successfully", config.addonName);
    } else {
      // 尝试替代方法
      ztoolkit.log(
        "ztoolkit.UI.createButton not available, trying alternative method",
        config.addonName,
      );

      // 检查工具包中可用的方法
      const methods = Object.keys(ztoolkit).filter(
        (key) => typeof ztoolkit[key] === "function",
      );
      ztoolkit.log(
        `Available methods: ${methods.join(", ")}`,
        config.addonName,
      );

      if (typeof ztoolkit.createXULElement === "function") {
        // 使用createXULElement方法
        ztoolkit.log("Using ztoolkit.createXULElement", config.addonName);

        // 在这里实现替代的工具栏按钮创建逻辑
        // ...
      } else {
        throw new Error("No suitable method found to create toolbar button");
      }
    }
  } catch (error) {
    // console.error("Failed to register toolbar button:", error);
    ztoolkit.log(
      `Failed to register toolbar button: ${error}`,
      config.addonName,
    );
  }
}

async function onMainWindowLoad(win: Window): Promise<void> {
  // 为每个窗口创建 ztoolkit
  addon.data.ztoolkit = createZToolkit();

  // 添加详细日志以验证win对象
  ztoolkit.log(
    `onMainWindowLoad called with window: ${win ? "available" : "not available"}`,
    config.addonName,
  );
  ztoolkit.log(
    `Window document: ${win?.document ? "available" : "not available"}`,
    config.addonName,
  );
  ztoolkit.log(
    `Window document.body: ${win?.document?.body ? "available" : "not available"}`,
    config.addonName,
  );

  // 加载本地化字符串
  // @ts-ignore This is a moz feature
  if (
    win.MozXULElement &&
    typeof win.MozXULElement.insertFTLIfNeeded === "function"
  ) {
    win.MozXULElement.insertFTLIfNeeded(
      `${addon.data.config.addonRef}-mainWindow.ftl`,
    );
  }

  // 初始化服务
  try {
    ztoolkit.log("Initializing services...", config.addonName);
    const { initializeServices } = await import("./modules.next/services");

    // 初始化所有服务
    await initializeServices();
    ztoolkit.log("Services initialized successfully", config.addonName);
  } catch (error) {
    ztoolkit.log(`Failed to initialize services: ${error}`, config.addonName);
  }

  // 初始化UI管理器
  try {
    ztoolkit.log("Importing UIManager module...", config.addonName);
    const { UIManager } = await import("./modules.next/ui/uiManager");
    ztoolkit.log("UIManager module imported", config.addonName);

    // 获取UIManager实例并初始化
    ztoolkit.log("Getting UIManager instance", config.addonName);
    const uiManager = UIManager.getInstance();
    ztoolkit.log(
      "UIManager instance created, initializing...",
      config.addonName,
    );

    // 初始化UIManager
    await uiManager.init();

    // 在全局Zotero对象上注册toggleUI方法，供菜单项调用
    if (!Zotero[config.addonInstance]) {
      Zotero[config.addonInstance] = {};
    }
    Zotero[config.addonInstance].toggleUI = () => {
      uiManager.toggle();
    };

    ztoolkit.log("UIManager initialized successfully", config.addonName);
  } catch (error) {
    ztoolkit.log(`Failed to initialize UIManager: ${error}`, config.addonName);
  }

  // 显示启动通知
  try {
    const progressWindow = new ztoolkit.ProgressWindow(
      addon.data.config.addonName,
      {
        closeOnClick: true,
        closeTime: 3000,
      },
    );

    progressWindow.createLine({
      text: getString("startup-finish"),
      type: "success",
      progress: 100,
    });

    progressWindow.show();
  } catch (error) {
    // console.log("RAGFlow plugin loaded successfully");
    // console.error("Failed to show progress window:", error);
    ztoolkit.log("RAGFlow plugin loaded successfully", config.addonName);
    ztoolkit.log(`Failed to show progress window: ${error}`, config.addonName);
  }
}

async function onMainWindowUnload(win: Window): Promise<void> {
  // 清理资源
  try {
    if (typeof ztoolkit.unregisterAll === "function") {
      ztoolkit.unregisterAll();
    }
    if (addon.data.dialog?.window) {
      addon.data.dialog.window.close();
    }
  } catch (error) {
    // console.error("Error during window unload:", error);
    ztoolkit.log(`Error during window unload: ${error}`, config.addonName);
  }
}

async function onShutdown(): Promise<void> {
  // 释放资源，取消事件监听器等
  try {
    ztoolkit.log(`${config.addonName} shutdown`, config.addonName);

    // 注销所有UI元素以避免内存泄漏
    if (typeof ztoolkit.unregisterAll === "function") {
      ztoolkit.unregisterAll();
    }

    if (addon.data.dialog?.window) {
      addon.data.dialog.window.close();
    }

    // 移除插件实例
    addon.data.alive = false;

    if (Zotero[addon.data.config.addonInstance]) {
      delete Zotero[addon.data.config.addonInstance];
    }
  } catch (error) {
    // console.error("Error during shutdown:", error);
    ztoolkit.log(`Error during shutdown: ${error}`, config.addonName);
  }
}

/**
 * 通知事件处理
 */
async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  // RAGFlow 插件可能不需要特别处理通知
  // 如有需要，可以在此添加代码
}

/**
 * 首选项UI事件处理
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  // 如果 RAGFlow 有特定的首选项处理需求，可以在此添加
}

// 导出所有钩子函数
export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
};
