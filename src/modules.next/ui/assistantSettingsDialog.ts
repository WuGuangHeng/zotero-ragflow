import { Logger } from "../services/logger";
import { config } from "../../../package.json";
import { sessionService, AssistantSettings } from "../services/core/session";

// 添加ztoolkit声明
declare const ztoolkit: any;
// 添加TagElementProps接口定义，用于Dialog元素类型检查
interface TagElementProps {
  tag: string;
  namespace?: string;
  id?: string;
  attributes?: Record<string, string>;
  styles?: Record<string, string>;
  properties?: Record<string, any>;
  children?: TagElementProps[];
}

// 预定义的模型列表
export const PREDEFINED_MODELS = [
  { id: "qwen-turbo", name: "通义千问-Turbo", description: "速度快，成本低" },
  { id: "qwen-plus", name: "通义千问-Plus", description: "更高质量" },
  {
    id: "qwen-max",
    name: "通义千问-Max",
    description: "最高性能，适合复杂任务",
  },
  { id: "deepseek-chat", name: "DeepSeek Chat", description: "开源大模型" },
  { id: "gpt-4o", name: "GPT-4o", description: "OpenAI最新模型" },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", description: "平衡性能与成本" },
];

/**
 * 创建并显示助手设置对话框
 * @param knowledgeBaseId 知识库ID
 * @param knowledgeBaseName 知识库名称
 * @param assistantId 可选的助手ID，如果提供则加载现有助手设置
 * @returns 返回一个Promise，在对话框关闭时解析
 */
export async function showAssistantSettingsDialog(
  knowledgeBaseId: string,
  knowledgeBaseName: string,
  assistantId?: string,
): Promise<boolean> {
  try {
    // 添加函数开始执行的日志
    Logger.debug({
      message: "showAssistantSettingsDialog 函数开始执行",
      context: "AssistantSettingsDialog",
      data: { knowledgeBaseId, knowledgeBaseName, assistantId },
    });

    // 验证关键依赖是否可用
    Logger.debug({
      message: `检查关键依赖: sessionService=${!!sessionService}, ztoolkit=${!!ztoolkit}`,
      context: "AssistantSettingsDialog",
    });

    // 获取主窗口
    const win = Zotero.getMainWindow();
    if (!win) {
      throw new Error("无法获取主窗口");
    }

    Logger.debug({
      message: "成功获取主窗口",
      context: "AssistantSettingsDialog",
    });

    // 初始设置
    let initialSettings: AssistantSettings = {
      model: "qwen-turbo",
      temperature: 0.7,
      top_p: 0.95,
      max_tokens: 4000,
      similarity_threshold: 0.2,
      top_n: 5,
    };

    let assistant = null;
    let isNewAssistant = true;

    // 如果提供了assistantId，尝试加载现有助手设置
    if (assistantId) {
      try {
        Logger.info({
          message: `正在加载助手设置 (ID: ${assistantId})`,
          context: "AssistantSettingsDialog",
        });

        // 检查sessionService状态和方法
        if (!sessionService) {
          Logger.error({
            message: "sessionService 未初始化或为null",
            context: "AssistantSettingsDialog",
          });
          throw new Error("sessionService未初始化");
        }

        if (typeof sessionService.getAssistant !== "function") {
          Logger.error({
            message: `sessionService.getAssistant 不是函数: ${typeof sessionService.getAssistant}`,
            context: "AssistantSettingsDialog",
          });
          throw new Error("sessionService.getAssistant方法不可用");
        }

        // 调用前记录
        Logger.debug({
          message: `准备调用 sessionService.getAssistant(${assistantId})`,
          context: "AssistantSettingsDialog",
        });

        assistant = await sessionService.getAssistant(assistantId);

        // 记录返回的助手对象
        Logger.debug({
          message: "sessionService.getAssistant 调用成功",
          context: "AssistantSettingsDialog",
          data: {
            assistantFound: !!assistant,
            hasSettings: !!(assistant && assistant.settings),
          },
        });

        if (assistant && assistant.settings) {
          initialSettings = { ...initialSettings, ...assistant.settings };
          isNewAssistant = false;

          Logger.info({
            message: "成功加载现有助手设置",
            context: "AssistantSettingsDialog",
            data: { settings: initialSettings },
          });
        }
      } catch (error) {
        // 增强错误日志
        const errorMsg = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;

        Logger.warn({
          message: `无法加载助手设置: ${errorMsg}`,
          context: "AssistantSettingsDialog",
          error: error as Error,
          data: { stack, assistantId },
        });
        // 继续使用默认设置
      }
    }

    // 尝试加载用户保存的自定义模型
    Logger.debug({
      message: "准备加载自定义模型列表",
      context: "AssistantSettingsDialog",
    });

    let customModels: string[] = [];
    try {
      const customModelsStr = Zotero.Prefs.get(
        `${config.prefsPrefix}.customModels`,
        true,
      ) as string;
      if (customModelsStr) {
        customModels = JSON.parse(customModelsStr);
        Logger.debug({
          message: `已加载 ${customModels.length} 个自定义模型`,
          context: "AssistantSettingsDialog",
        });
      }
    } catch (error) {
      Logger.warn({
        message: `无法加载自定义模型列表: ${error instanceof Error ? error.message : String(error)}`,
        context: "AssistantSettingsDialog",
        error: error as Error,
      });
      // 继续使用空数组
    }

    // 检查ztoolkit及Dialog组件
    Logger.debug({
      message: `检查ztoolkit.Dialog: ${typeof ztoolkit}.${ztoolkit ? typeof ztoolkit.Dialog : "undefined"}`,
      context: "AssistantSettingsDialog",
    });

    if (!ztoolkit || typeof ztoolkit.Dialog !== "function") {
      throw new Error(
        `ztoolkit.Dialog不可用: ${typeof ztoolkit}.${ztoolkit ? typeof ztoolkit.Dialog : "undefined"}`,
      );
    }

    // 创建设置对话框
    Logger.debug({
      message: "准备创建对话框",
      context: "AssistantSettingsDialog",
    });

    return new Promise((resolve) => {
      try {
        const dialog = new ztoolkit.Dialog(11, 1)
          // 标题
          .addCell(0, 0, {
            tag: "h3",
            namespace: "html",
            properties: { innerHTML: "聊天助手设置" },
            styles: {
              margin: "0 0 15px 0",
              color: "#2d2d2d",
              textAlign: "center",
              borderBottom: "1px solid #eee",
              paddingBottom: "10px",
            },
          })
          // 知识库信息
          .addCell(1, 0, {
            tag: "div",
            namespace: "html",
            styles: {
              backgroundColor: "#f0f7ff",
              padding: "10px 15px",
              borderRadius: "4px",
              marginBottom: "20px",
              border: "1px solid #d0e0ff",
            },
            properties: {
              innerHTML: `<span style="font-weight:bold;color:#0066cc;">知识库:</span> 
                          <span style="color:#333;">${knowledgeBaseName}</span>`,
            },
          })
          // 模型选择区域
          .addCell(2, 0, {
            tag: "div",
            namespace: "html",
            styles: { marginBottom: "20px" },
            children: [
              {
                tag: "label",
                namespace: "html",
                properties: { innerHTML: "选择模型:" },
                styles: {
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "bold",
                },
              },
              {
                tag: "div",
                namespace: "html",
                id: "models-container",
                styles: {
                  maxHeight: "150px",
                  overflowY: "auto",
                  border: "1px solid #eee",
                  borderRadius: "4px",
                },
                children: PREDEFINED_MODELS.map((model) => ({
                  tag: "div",
                  namespace: "html",
                  id: `model-${model.id.replace(/\./g, "_")}`,
                  attributes: {
                    "data-model-id": model.id,
                    "data-selected":
                      model.id === initialSettings.model ? "true" : "false",
                    class: "model-item",
                  },
                  styles: {
                    padding: "10px",
                    cursor: "pointer",
                    backgroundColor:
                      model.id === initialSettings.model
                        ? "#e6f7ff"
                        : "transparent",
                    borderBottom: "1px solid #eee",
                  },
                  properties: {
                    innerHTML: `<strong>${model.name}</strong><br><span style="color:#666;font-size:0.9em">${model.description}</span>`,
                  },
                })),
              },
              // 自定义模型输入框
              {
                tag: "div",
                namespace: "html",
                styles: { marginTop: "10px" } as Record<string, string>,
                children: (() => {
                  const children: TagElementProps[] = [
                    {
                      tag: "label",
                      namespace: "html",
                      properties: { innerHTML: "自定义模型:" },
                      styles: {
                        display: "block",
                        marginBottom: "5px",
                        fontWeight: "bold",
                      } as Record<string, string>,
                    },
                    {
                      tag: "div",
                      namespace: "html",
                      styles: { display: "flex" } as Record<string, string>,
                      children: [
                        {
                          tag: "input",
                          namespace: "html",
                          id: "custom-model-input",
                          attributes: {
                            type: "text",
                            placeholder: "输入自定义模型名称",
                            value: !PREDEFINED_MODELS.some(
                              (m) => m.id === initialSettings.model,
                            )
                              ? initialSettings.model
                              : "",
                            "data-bind": "customModel",
                            "data-prop": "value",
                          },
                          styles: {
                            flex: "1",
                            padding: "8px",
                            borderRadius: "4px",
                            border: "1px solid #ccc",
                          } as Record<string, string>,
                        },
                      ],
                    },
                  ];

                  // 如果有历史自定义模型，则添加
                  if (customModels.length > 0) {
                    children.push({
                      tag: "div",
                      namespace: "html",
                      styles: {
                        marginTop: "5px",
                        fontSize: "0.85em",
                        color: "#666",
                      } as Record<string, string>,
                      children: [
                        {
                          tag: "span",
                          namespace: "html",
                          properties: { textContent: "历史使用: " },
                        },
                        ...customModels.map((model) => ({
                          tag: "span",
                          namespace: "html",
                          id: `history-model-${model.replace(/\./g, "_")}`,
                          attributes: {
                            class: "custom-model-history",
                            "data-model": model,
                          },
                          styles: {
                            marginRight: "5px",
                            cursor: "pointer",
                            color: "#1890ff",
                            textDecoration: "underline",
                          } as Record<string, string>,
                          properties: { textContent: model },
                        })),
                      ],
                    });
                  }

                  return children;
                })(),
              },
            ],
          })
          // 推理参数区域 - 标题
          .addCell(3, 0, {
            tag: "h4",
            namespace: "html",
            properties: { innerHTML: "生成参数" },
            styles: {
              margin: "10px 0",
              color: "#333",
              borderBottom: "1px solid #eee",
              paddingBottom: "5px",
            },
          })
          // 温度设置
          .addCell(
            4,
            0,
            createSliderGroup(
              "temperature",
              "温度",
              "0",
              "1",
              "0.05",
              initialSettings.temperature.toString(),
              "较低的值产生更确定的回答，较高的值产生更多样化的回答",
            ),
          )
          // top_p设置
          .addCell(
            5,
            0,
            createSliderGroup(
              "top_p",
              "Top P",
              "0",
              "1",
              "0.05",
              initialSettings.top_p.toString(),
              "控制生成文本的多样性",
            ),
          )
          // 最大令牌数
          .addCell(6, 0, {
            tag: "div",
            namespace: "html",
            styles: { marginBottom: "20px" },
            children: [
              {
                tag: "label",
                namespace: "html",
                properties: { innerHTML: "最大令牌数:" },
                styles: {
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "bold",
                },
              },
              {
                tag: "input",
                namespace: "html",
                attributes: {
                  type: "number",
                  min: "100",
                  max: "16000",
                  step: "100",
                  value: initialSettings.max_tokens.toString(),
                  "data-bind": "max_tokens",
                  "data-prop": "value",
                },
                styles: {
                  width: "100%",
                  padding: "8px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                },
              },
              {
                tag: "div",
                namespace: "html",
                styles: { fontSize: "0.85em", color: "#666", marginTop: "5px" },
                properties: {
                  innerHTML: "生成响应的最大长度，较大的值允许生成更长的回答",
                },
              },
            ],
          })
          // 检索参数区域 - 标题
          .addCell(7, 0, {
            tag: "h4",
            namespace: "html",
            properties: { innerHTML: "检索参数" },
            styles: {
              margin: "10px 0",
              color: "#333",
              borderBottom: "1px solid #eee",
              paddingBottom: "5px",
            },
          })
          // 相似度阈值设置
          .addCell(
            8,
            0,
            createSliderGroup(
              "similarity_threshold",
              "相似度阈值",
              "0",
              "1",
              "0.05",
              initialSettings.similarity_threshold.toString(),
              "检索结果的最低相似度要求，较低的值返回更多结果",
            ),
          )
          // 返回文档数量
          .addCell(9, 0, {
            tag: "div",
            namespace: "html",
            styles: { marginBottom: "20px" },
            children: [
              {
                tag: "label",
                namespace: "html",
                properties: { innerHTML: "返回文档数量:" },
                styles: {
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "bold",
                },
              },
              {
                tag: "input",
                namespace: "html",
                attributes: {
                  type: "number",
                  min: "1",
                  max: "20",
                  step: "1",
                  value: initialSettings.top_n.toString(),
                  "data-bind": "top_n",
                  "data-prop": "value",
                },
                styles: {
                  width: "100%",
                  padding: "8px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                },
              },
              {
                tag: "div",
                namespace: "html",
                styles: { fontSize: "0.85em", color: "#666", marginTop: "5px" },
                properties: {
                  innerHTML:
                    "提供给模型的相关文档数量，较多的文档可能提供更全面的信息",
                },
              },
            ],
          })
          // 保存为默认设置选项
          .addCell(10, 0, {
            tag: "div",
            namespace: "html",
            styles: {
              marginTop: "10px",
              marginBottom: "20px",
            },
            children: [
              {
                tag: "label",
                namespace: "html",
                styles: {
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                },
                children: [
                  {
                    tag: "input",
                    namespace: "html",
                    id: "save-default-checkbox",
                    attributes: {
                      type: "checkbox",
                      "data-bind": "saveAsDefault",
                      "data-prop": "checked",
                    },
                    styles: {
                      marginRight: "8px",
                    },
                  },
                  {
                    tag: "span",
                    namespace: "html",
                    properties: {
                      innerHTML: "保存为默认设置",
                    },
                  },
                ],
              },
              {
                tag: "div",
                namespace: "html",
                styles: {
                  fontSize: "0.85em",
                  color: "#666",
                  marginTop: "5px",
                  marginLeft: "24px",
                },
                properties: {
                  innerHTML: "将当前设置保存为创建新助手时的默认值",
                },
              },
            ],
          })
          .addButton("保存", "save")
          .addButton("重置", "reset")
          .addButton("取消", "cancel")
          .setDialogData({
            // 初始数据
            selectedModel: PREDEFINED_MODELS.some(
              (m) => m.id === initialSettings.model,
            )
              ? initialSettings.model
              : "",
            customModel: !PREDEFINED_MODELS.some(
              (m) => m.id === initialSettings.model,
            )
              ? initialSettings.model
              : "",
            temperature: initialSettings.temperature,
            top_p: initialSettings.top_p,
            max_tokens: initialSettings.max_tokens,
            similarity_threshold: initialSettings.similarity_threshold,
            top_n: initialSettings.top_n,
            saveAsDefault: false,

            // 加载完成后设置事件监听
            loadCallback: () => {
              Logger.debug({
                message: "助手设置对话框已加载，正在设置事件监听器",
                context: "AssistantSettingsDialog",
              });

              // 记录一些DOM情况，帮助调试
              try {
                Logger.debug({
                  message: "检查模型项DOM元素",
                  context: "AssistantSettingsDialog",
                  data: {
                    modelItemsCount:
                      dialog.window.document.querySelectorAll(".model-item")
                        .length,
                    allModelsCount: PREDEFINED_MODELS.length,
                  },
                });

                // 记录模型ID的转换
                PREDEFINED_MODELS.forEach((model) => {
                  Logger.debug({
                    message: `模型ID映射: ${model.id} -> ${model.id.replace(/\./g, "_")}`,
                    context: "AssistantSettingsDialog",
                  });
                });
              } catch (err) {
                Logger.error({
                  message: "记录DOM情况时出错",
                  context: "AssistantSettingsDialog",
                  error: err as Error,
                });
              }

              // 模型选择事件
              dialog.window.document
                .querySelectorAll(".model-item")
                .forEach((item: Element) => {
                  item.addEventListener("click", (event: Event) => {
                    // 清除所有选中状态
                    dialog.window.document
                      .querySelectorAll(".model-item")
                      .forEach((el: Element) => {
                        el.setAttribute("data-selected", "false");
                        (el as HTMLElement).style.backgroundColor =
                          "transparent";
                      });

                    // 设置新的选中状态
                    const target = event.currentTarget as HTMLElement;
                    target.setAttribute("data-selected", "true");
                    target.style.backgroundColor = "#e6f7ff";

                    // 更新选中的模型ID
                    dialog.dialogData.selectedModel =
                      target.getAttribute("data-model-id") || "";

                    // 清空自定义模型输入
                    const customInput = dialog.window.document.getElementById(
                      "custom-model-input",
                    ) as HTMLInputElement;
                    if (customInput) {
                      customInput.value = "";
                      dialog.dialogData.customModel = "";
                    }
                  });
                });

              // 历史自定义模型点击事件
              dialog.window.document
                .querySelectorAll(".custom-model-history")
                .forEach((item: Element) => {
                  item.addEventListener("click", (event: Event) => {
                    const target = event.currentTarget as HTMLElement;
                    const modelName = target.getAttribute("data-model") || "";

                    // 清除所有预定义模型的选中状态
                    dialog.window.document
                      .querySelectorAll(".model-item")
                      .forEach((el: Element) => {
                        el.setAttribute("data-selected", "false");
                        (el as HTMLElement).style.backgroundColor =
                          "transparent";
                      });

                    // 设置自定义模型输入
                    const customInput = dialog.window.document.getElementById(
                      "custom-model-input",
                    ) as HTMLInputElement;
                    if (customInput) {
                      customInput.value = modelName;
                      dialog.dialogData.customModel = modelName;
                      dialog.dialogData.selectedModel = "";
                    }
                  });
                });

              // 自定义模型输入事件
              const customModelInput = dialog.window.document.getElementById(
                "custom-model-input",
              ) as HTMLInputElement;
              if (customModelInput) {
                customModelInput.addEventListener("input", () => {
                  // 如果输入了自定义模型，清除预定义模型选择
                  if (customModelInput.value) {
                    dialog.dialogData.customModel = customModelInput.value;
                    dialog.dialogData.selectedModel = "";

                    // 清除所有选中状态
                    dialog.window.document
                      .querySelectorAll(".model-item")
                      .forEach((el: Element) => {
                        el.setAttribute("data-selected", "false");
                        (el as HTMLElement).style.backgroundColor =
                          "transparent";
                      });
                  }
                });
              }

              // 设置滑块值变更时更新显示
              setupSliderValueDisplay(dialog, "temperature");
              setupSliderValueDisplay(dialog, "top_p");
              setupSliderValueDisplay(dialog, "similarity_threshold");

              // 设置重置按钮事件
              const resetButton = dialog.window.document.querySelector(
                'button[data-id="reset"]',
              );
              if (resetButton) {
                resetButton.addEventListener("click", (event: Event) => {
                  event.preventDefault();

                  // 恢复默认值
                  const defaultSettings = {
                    model: "qwen-turbo",
                    temperature: 0.7,
                    top_p: 0.95,
                    max_tokens: 4000,
                    similarity_threshold: 0.2,
                    top_n: 5,
                  };

                  // 更新UI和dialogData
                  updateUIFromSettings(dialog, defaultSettings);
                });
              }
            },

            // 对话框关闭时的处理
            unloadCallback: () => {
              try {
                const dialogData = dialog.dialogData;
                if (dialogData._lastButtonId === "save") {
                  Logger.info({
                    message: "用户点击保存按钮，处理助手设置保存",
                    context: "AssistantSettingsDialog",
                  });

                  // 获取最终模型名称 - 优先使用自定义输入
                  const modelName =
                    dialogData.customModel || dialogData.selectedModel;

                  // 如果是自定义模型，保存到历史记录
                  if (
                    dialogData.customModel &&
                    !PREDEFINED_MODELS.some(
                      (m) => m.id === dialogData.customModel,
                    )
                  ) {
                    saveCustomModel(dialogData.customModel);
                  }

                  // 构建最终设置
                  const settings: AssistantSettings = {
                    model: modelName || initialSettings.model, // 确保始终有值
                    temperature: parseFloat(dialogData.temperature.toString()),
                    top_p: parseFloat(dialogData.top_p.toString()),
                    max_tokens: parseInt(dialogData.max_tokens.toString(), 10),
                    similarity_threshold: parseFloat(
                      dialogData.similarity_threshold.toString(),
                    ),
                    top_n: parseInt(dialogData.top_n.toString(), 10),
                  };

                  Logger.debug({
                    message: "最终助手设置",
                    context: "AssistantSettingsDialog",
                    data: settings,
                  });

                  // 保存为默认设置
                  if (dialogData.saveAsDefault) {
                    saveDefaultSettings(settings);
                  }

                  // 保存助手设置
                  saveAssistantSettings(
                    knowledgeBaseId,
                    knowledgeBaseName,
                    assistantId,
                    settings,
                    isNewAssistant,
                  );

                  // 返回成功
                  resolve(true);
                } else {
                  // 取消或关闭
                  resolve(false);
                }
              } catch (error) {
                // 捕获保存过程中的错误
                const errorMsg =
                  error instanceof Error ? error.message : String(error);
                const stack = error instanceof Error ? error.stack : undefined;

                Logger.error({
                  message: `保存助手设置时出错: ${errorMsg}`,
                  context: "AssistantSettingsDialog",
                  error: error as Error,
                  data: { stack },
                });
                resolve(false);
              }
            },
          });

        // 使用安全的打开方法，确保正确设置所有命名空间
        try {
          dialog.open("RAGFlow 聊天助手设置", {
            width: 500,
            height: 650,
            centerscreen: true,
            resizable: true,
          });

          // 记录成功打开的日志
          Logger.debug({
            message: "对话框已成功打开",
            context: "AssistantSettingsDialog",
            data: { dialogWindowExists: !!dialog.window },
          });
        } catch (err) {
          Logger.error({
            message: `打开对话框时发生错误: ${err instanceof Error ? err.message : String(err)}`,
            context: "AssistantSettingsDialog",
            error: err as Error,
          });
        }
      } catch (error) {
        // 如果在创建或打开对话框时出错，记录并解析Promise
        const errorMsg = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;

        Logger.error({
          message: `创建或打开对话框失败: ${errorMsg}`,
          context: "AssistantSettingsDialog",
          error: error as Error,
          data: { stack },
        });
        resolve(false);
      }
    });
  } catch (error) {
    // 增强主try-catch的错误记录
    const errorMsg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    Logger.error({
      message: `显示助手设置对话框失败: ${errorMsg}`,
      context: "AssistantSettingsDialog",
      error: error as Error,
      data: {
        stack,
        knowledgeBaseId,
        errorType: error ? typeof error : "unknown",
        errorName: error instanceof Error ? error.name : "N/A",
      },
    });
    return false;
  }
}

/**
 * 创建标签和滑块组合
 */
function createSliderGroup(
  id: string,
  label: string,
  min: string,
  max: string,
  step: string,
  defaultValue: string,
  description?: string,
): TagElementProps {
  // 创建组件容器
  const container: TagElementProps = {
    tag: "div",
    namespace: "html",
    styles: { marginBottom: "20px" },
    children: [] as TagElementProps[],
  };

  // 添加标签和值显示
  container.children?.push({
    tag: "div",
    namespace: "html",
    styles: {
      display: "flex",
      justifyContent: "space-between",
      marginBottom: "5px",
    },
    children: [
      {
        tag: "label",
        namespace: "html",
        properties: { innerHTML: label + ":" },
        styles: { fontWeight: "bold" },
      },
      {
        tag: "span",
        namespace: "html",
        id: `${id}-value`,
        properties: { textContent: defaultValue },
      },
    ],
  });

  // 添加滑块
  container.children?.push({
    tag: "input",
    namespace: "html",
    id: `${id}-slider`,
    attributes: {
      type: "range",
      min,
      max,
      step,
      value: defaultValue,
      "data-bind": id,
      "data-prop": "value",
    },
    styles: { width: "100%" },
  });

  // 如果有描述，添加描述元素
  if (description) {
    container.children?.push({
      tag: "div",
      namespace: "html",
      styles: { fontSize: "0.85em", color: "#666", marginTop: "3px" },
      properties: { innerHTML: description },
    });
  }

  return container;
}

/**
 * 设置滑块值显示更新
 */
function setupSliderValueDisplay(dialog: any, id: string): void {
  const slider = dialog.window.document.getElementById(
    `${id}-slider`,
  ) as HTMLInputElement;
  const valueDisplay = dialog.window.document.getElementById(`${id}-value`);

  if (slider && valueDisplay) {
    slider.addEventListener("input", () => {
      valueDisplay.textContent = slider.value;
      dialog.dialogData[id] = parseFloat(slider.value);
    });
  }
}

/**
 * 保存自定义模型到历史记录
 */
function saveCustomModel(modelName: string): void {
  try {
    // 获取现有的自定义模型
    const customModelsStr =
      (Zotero.Prefs.get(
        `${config.prefsPrefix}.customModels`,
        true,
      ) as string) || "[]";
    const customModels = JSON.parse(customModelsStr);

    // 检查是否已存在
    if (!customModels.includes(modelName)) {
      // 添加到列表开头
      customModels.unshift(modelName);

      // 最多保存10个
      if (customModels.length > 10) {
        customModels.pop();
      }

      // 保存回偏好设置
      Zotero.Prefs.set(
        `${config.prefsPrefix}.customModels`,
        JSON.stringify(customModels),
        true,
      );

      Logger.debug({
        message: "保存自定义模型到历史记录",
        context: "AssistantSettingsDialog",
        data: { modelName, customModels },
      });
    }
  } catch (error) {
    Logger.error({
      message: "保存自定义模型失败",
      context: "AssistantSettingsDialog",
      error: error as Error,
    });
  }
}

/**
 * 保存默认设置
 */
function saveDefaultSettings(settings: AssistantSettings): void {
  try {
    Zotero.Prefs.set(
      `${config.prefsPrefix}.defaultAssistantSettings`,
      JSON.stringify(settings),
      true,
    );

    Logger.info({
      message: "保存为默认助手设置",
      context: "AssistantSettingsDialog",
      data: settings,
    });
  } catch (error) {
    Logger.error({
      message: "保存默认设置失败",
      context: "AssistantSettingsDialog",
      error: error as Error,
    });
  }
}

/**
 * 获取默认设置
 */
export function getDefaultSettings(): AssistantSettings {
  const defaultSettings: AssistantSettings = {
    model: "qwen-turbo",
    temperature: 0.7,
    top_p: 0.95,
    max_tokens: 4000,
    similarity_threshold: 0.2,
    top_n: 5,
  };

  try {
    const savedSettingsStr = Zotero.Prefs.get(
      `${config.prefsPrefix}.defaultAssistantSettings`,
      true,
    ) as string;
    if (savedSettingsStr) {
      const savedSettings = JSON.parse(savedSettingsStr);
      return { ...defaultSettings, ...savedSettings };
    }
  } catch (error) {
    Logger.warn({
      message: "无法加载默认设置，使用内置默认值",
      context: "AssistantSettingsDialog",
      error: error as Error,
    });
  }

  return defaultSettings;
}

/**
 * 保存助手设置
 */
async function saveAssistantSettings(
  knowledgeBaseId: string,
  knowledgeBaseName: string,
  assistantId: string | undefined,
  settings: AssistantSettings,
  isNewAssistant: boolean,
): Promise<void> {
  try {
    Logger.info({
      message: `正在保存助手设置${isNewAssistant ? "(新建)" : "(更新)"}`,
      context: "AssistantSettingsDialog",
      data: { knowledgeBaseId, assistantId, settings, isNewAssistant },
    });

    // 统一的助手命名格式
    const assistantName = `${knowledgeBaseName}的AI助手`;
    let savedAssistantId = assistantId; // 保存处理后的助手ID，用于更新本地存储

    // 尝试使用sessionService
    try {
      if (isNewAssistant) {
        // 创建新助手
        const assistant = await sessionService.getOrCreateAssistant(
          knowledgeBaseId,
          knowledgeBaseName,
          {
            name: assistantName,
            settings,
          },
        );

        savedAssistantId = assistant.id;
        Logger.info({
          message: "成功创建新助手(通过sessionService)",
          context: "AssistantSettingsDialog",
          data: { assistantId: assistant.id },
        });
      } else if (assistantId) {
        // 更新现有助手
        await sessionService.updateAssistant(assistantId, {
          name: assistantName,
          settings,
        });

        // 注意：这里不再直接访问assistantStorage属性
        Logger.info({
          message: "成功更新助手设置(通过sessionService)",
          context: "AssistantSettingsDialog",
          data: { assistantId },
        });
      }
    } catch (sessionError) {
      // sessionService失败，使用直接API调用
      Logger.warn({
        message: `sessionService不可用，回退到直接API调用: ${sessionError instanceof Error ? sessionError.message : String(sessionError)}`,
        context: "AssistantSettingsDialog",
        error:
          sessionError instanceof Error
            ? sessionError
            : new Error(String(sessionError)),
      });

      // 从ragflow模块导入ragflow服务
      const { ragflow } = await import("../services/ragflow");

      if (isNewAssistant) {
        // 创建新助手
        const newAssistantId = await ragflow.createChatAssistant(
          knowledgeBaseId,
          assistantName,
          settings,
        );

        savedAssistantId = newAssistantId;

        // 存储新创建的助手ID
        Zotero.Prefs.set(
          `${config.prefsPrefix}.chatAssistant.${knowledgeBaseId}`,
          newAssistantId,
          true,
        );

        Logger.info({
          message: "成功创建新助手(通过直接API)",
          context: "AssistantSettingsDialog",
          data: { assistantId: newAssistantId },
        });

        // 尝试使用SessionService公开方法更新本地存储
        try {
          // 构建助手对象并使用updateAssistant
          await sessionService.updateAssistant(newAssistantId, {
            name: assistantName,
            settings: settings,
            // 额外信息
            knowledgeBaseId,
            knowledgeBaseName,
          });

          Logger.debug({
            message: "成功将新助手同步到本地存储",
            context: "AssistantSettingsDialog",
            data: { assistantId: newAssistantId },
          });
        } catch (localSyncError) {
          Logger.warn({
            message: `将新助手同步到本地存储失败: ${localSyncError instanceof Error ? localSyncError.message : String(localSyncError)}`,
            context: "AssistantSettingsDialog",
            error:
              localSyncError instanceof Error
                ? localSyncError
                : new Error(String(localSyncError)),
          });
        }
      } else if (assistantId) {
        // 更新现有助手
        await ragflow.updateChatAssistant(assistantId, assistantName, settings);

        Logger.info({
          message: "成功更新助手设置(通过直接API)",
          context: "AssistantSettingsDialog",
          data: { assistantId },
        });

        // 尝试也更新本地存储 - 使用公共API
        try {
          // 使用sessionService的公开方法更新本地存储
          await sessionService.updateAssistant(assistantId, {
            name: assistantName,
            settings: settings,
            // 必要的额外信息
            knowledgeBaseId,
            knowledgeBaseName,
          });

          Logger.debug({
            message: "成功将更新的助手同步到本地存储",
            context: "AssistantSettingsDialog",
            data: { assistantId },
          });
        } catch (localSyncError) {
          Logger.warn({
            message: `将更新的助手同步到本地存储失败: ${localSyncError instanceof Error ? localSyncError.message : String(localSyncError)}`,
            context: "AssistantSettingsDialog",
            error:
              localSyncError instanceof Error
                ? localSyncError
                : new Error(String(localSyncError)),
          });
        }
      }
    }

    // 无论使用哪种方式，都确保更新旧存储格式中的助手ID关联
    if (savedAssistantId) {
      try {
        Zotero.Prefs.set(
          `${config.prefsPrefix}.chatAssistant.${knowledgeBaseId}`,
          savedAssistantId,
          true,
        );

        Logger.debug({
          message: "已更新旧存储格式中的助手ID关联",
          context: "AssistantSettingsDialog",
          data: { knowledgeBaseId, assistantId: savedAssistantId },
        });
      } catch (e) {
        Logger.warn({
          message: `更新旧存储格式中的助手ID关联失败: ${e instanceof Error ? e.message : String(e)}`,
          context: "AssistantSettingsDialog",
          error: e instanceof Error ? e : new Error(String(e)),
        });
      }
    }

    // 显示成功通知
    const progressWindow = new ztoolkit.ProgressWindow("RAGFlow");
    progressWindow.createLine({
      text: "助手设置已保存",
      type: "success",
    });
    progressWindow.show();
    progressWindow.startCloseTimer(2000);
  } catch (error) {
    Logger.error({
      message: "保存助手设置失败",
      context: "AssistantSettingsDialog",
      error: error as Error,
    });

    // 显示错误通知
    const progressWindow = new ztoolkit.ProgressWindow("RAGFlow");
    progressWindow.createLine({
      text: "保存助手设置失败",
      type: "error",
    });
    progressWindow.createLine({
      text: error instanceof Error ? error.message : String(error),
      type: "error",
    });
    progressWindow.show();
    progressWindow.startCloseTimer(5000);
  }
}

/**
 * 更新UI以反映设置
 */
function updateUIFromSettings(dialog: any, settings: AssistantSettings): void {
  try {
    // 记录要更新的设置
    Logger.debug({
      message: "正在更新UI以反映设置",
      context: "AssistantSettingsDialog",
      data: { settings },
    });

    // 更新模型选择
    if (PREDEFINED_MODELS.some((m) => m.id === settings.model)) {
      // 如果是预定义模型，更新选中状态
      dialog.dialogData.selectedModel = settings.model;
      dialog.dialogData.customModel = "";

      // 记录选择的预定义模型
      Logger.debug({
        message: `选择预定义模型: ${settings.model}`,
        context: "AssistantSettingsDialog",
      });

      // 更新UI
      dialog.window.document
        .querySelectorAll(".model-item")
        .forEach((el: Element) => {
          const modelId = el.getAttribute("data-model-id");
          el.setAttribute(
            "data-selected",
            modelId === settings.model ? "true" : "false",
          );
          (el as HTMLElement).style.backgroundColor =
            modelId === settings.model ? "#e6f7ff" : "transparent";
        });

      // 清空自定义模型输入
      const customInput = dialog.window.document.getElementById(
        "custom-model-input",
      ) as HTMLInputElement;
      if (customInput) {
        customInput.value = "";
      }
    } else {
      // 如果是自定义模型，清除预定义选择并设置输入
      dialog.dialogData.selectedModel = "";
      dialog.dialogData.customModel = settings.model;

      // 清除所有选中状态
      dialog.window.document
        .querySelectorAll(".model-item")
        .forEach((el: Element) => {
          el.setAttribute("data-selected", "false");
          (el as HTMLElement).style.backgroundColor = "transparent";
        });

      // 设置自定义模型输入
      const customInput = dialog.window.document.getElementById(
        "custom-model-input",
      ) as HTMLInputElement;
      if (customInput) {
        customInput.value = settings.model;
      }
    }

    // 更新滑块
    updateSliderValue(dialog, "temperature", settings.temperature);
    updateSliderValue(dialog, "top_p", settings.top_p);
    updateSliderValue(
      dialog,
      "similarity_threshold",
      settings.similarity_threshold,
    );

    // 更新数字输入
    updateInputValue(dialog, "max_tokens", settings.max_tokens);
    updateInputValue(dialog, "top_n", settings.top_n);

    // 更新dialogData
    dialog.dialogData.temperature = settings.temperature;
    dialog.dialogData.top_p = settings.top_p;
    dialog.dialogData.max_tokens = settings.max_tokens;
    dialog.dialogData.similarity_threshold = settings.similarity_threshold;
    dialog.dialogData.top_n = settings.top_n;

    Logger.debug({
      message: "UI已更新以反映设置",
      context: "AssistantSettingsDialog",
    });
  } catch (error) {
    Logger.error({
      message: "更新UI失败",
      context: "AssistantSettingsDialog",
      error: error as Error,
    });
  }
}

/**
 * 更新滑块值
 */
function updateSliderValue(dialog: any, id: string, value: number): void {
  const slider = dialog.window.document.getElementById(
    `${id}-slider`,
  ) as HTMLInputElement;
  const valueDisplay = dialog.window.document.getElementById(`${id}-value`);

  if (slider) {
    slider.value = value.toString();
    dialog.dialogData[id] = value;
  }

  if (valueDisplay) {
    valueDisplay.textContent = value.toString();
  }
}

/**
 * 更新输入值
 */
function updateInputValue(dialog: any, id: string, value: number): void {
  const input = dialog.window.document.querySelector(
    `input[data-bind="${id}"]`,
  ) as HTMLInputElement;

  if (input) {
    input.value = value.toString();
    dialog.dialogData[id] = value;
  }
}
