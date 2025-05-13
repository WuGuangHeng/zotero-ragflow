import { Logger } from "../../../modules/logger";
import { RAGFlowService } from "../../../modules/ragflowService";
import { UIHelper } from "./uiHelper";
import { eventBus, Events } from "./eventBus";

/**
 * RAGFlow UI帮助工具类
 */
export class RAGFlowHelper {
  /**
   * 打开知识库选择器
   */
  public static async openKnowledgeBaseSelector(): Promise<void> {
    try {
      // 获取知识库列表
      const kbList = await RAGFlowService.listDatasets();
      
      // 构建选项列表
      const options = kbList.map(kb => ({
        label: kb.name,
        value: kb.id
      }));

      // 创建选择器对话框
      const message = "请选择要使用的知识库：\n" + 
        options.map((opt, idx) => `${idx + 1}. ${opt.label}`).join("\n");

      const selectedName = await UIHelper.showPromptDialog(
        "选择知识库",
        message,
        "",
        "确定",
        "取消"
      );

      if (!selectedName) return;

      // 查找匹配的知识库
      const selectedKB = kbList.find(kb => kb.name === selectedName);
      if (!selectedKB) {
        UIHelper.showToast("未找到指定的知识库", "error");
        return;
      }

      // 触发知识库选择事件
      eventBus.emit(Events.KB_SELECTED, selectedKB);
      UIHelper.showToast(`已选择知识库: ${selectedKB.name}`, "info");

    } catch (error) {
      Logger.error({
        message: "打开知识库选择器失败",
        error
      });
      UIHelper.showToast("打开知识库选择器失败", "error");
    }
  }

  /**
   * 创建新会话
   */
  public static async createNewSession(): Promise<void> {
    try {
      const sessionName = await UIHelper.showPromptDialog(
        "创建会话",
        "请输入会话名称：",
        `会话 ${new Date().toLocaleString()}`
      );

      if (!sessionName) return;

      // 触发会话创建事件
      eventBus.emit(Events.SESSION_CREATED, {
        name: sessionName,
        timestamp: Date.now()
      });

      UIHelper.showToast(`已创建会话: ${sessionName}`, "info");

    } catch (error) {
      Logger.error({
        message: "创建新会话失败",
        error
      });
      UIHelper.showToast("创建新会话失败", "error");
    }
  }

  /**
   * 删除会话
   */
  public static async deleteSession(sessionId: string, sessionName: string): Promise<void> {
    try {
      const confirmed = await UIHelper.showConfirmDialog(
        "删除会话",
        `确定要删除会话"${sessionName}"吗？此操作不可撤销。`
      );

      if (!confirmed) return;

      // 触发会话删除事件
      eventBus.emit(Events.SESSION_DELETED, sessionId);
      UIHelper.showToast(`已删除会话: ${sessionName}`, "info");

    } catch (error) {
      Logger.error({
        message: "删除会话失败",
        error,
        data: { sessionId, sessionName }
      });
      UIHelper.showToast("删除会话失败", "error");
    }
  }

  /**
   * 获取知识库状态文本
   */
  public static getKnowledgeBaseStatusText(status: string): string {
    switch (status) {
      case "ready":
        return "就绪";
      case "processing":
        return "处理中";
      case "failed":
        return "失败";
      case "none":
      default:
        return "未选择";
    }
  }

  /**
   * 检查API配置是否有效
   */
  public static isAPIConfigValid(): boolean {
    const settings = this.getAPISettings();
    return !!(settings.apiUrl && settings.apiKey);
  }

  /**
   * 获取API设置
   */
  private static getAPISettings(): { apiUrl: string; apiKey: string } {
    try {
      const doc = Zotero.getMainWindow().document;
      const apiUrlInput = doc.getElementById("ragflow-api-url") as HTMLInputElement;
      const apiKeyInput = doc.getElementById("ragflow-api-key") as HTMLInputElement;

      return {
        apiUrl: apiUrlInput?.value || "",
        apiKey: apiKeyInput?.value || ""
      };
    } catch (error) {
      Logger.error({
        message: "获取API设置失败",
        error
      });
      return { apiUrl: "", apiKey: "" };
    }
  }
}
