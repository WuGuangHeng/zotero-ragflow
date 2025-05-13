import { Logger } from "../../../services/logger";
import { Assistant } from "./types";
import { HybridStorage } from "./hybridStorage";

/**
 * 助手存储类
 */
export class AssistantStorage extends HybridStorage<Assistant> {
  constructor(config: { prefsKey?: string; baseDir?: string } = {}) {
    super(
      config.prefsKey || "ragflow.assistants",
      config.baseDir || "ragflow"
    );
  }

  /**
   * 获取所有助手
   */
  public async getAssistants(): Promise<Assistant[]> {
    const assistants = await this.getAll();
    return assistants.sort((a, b) => b.updated - a.updated);
  }

  /**
   * 获取指定助手
   */
  public async getAssistant(assistantId: string): Promise<Assistant | undefined> {
    return this.get(assistantId);
  }

  /**
   * 获取知识库对应的助手
   */
  public async getAssistantByKnowledgeBase(kbId: string): Promise<Assistant | undefined> {
    const assistants = await this.getAll();
    return assistants.find(assistant => assistant.knowledgeBaseId === kbId);
  }

  /**
   * 保存助手
   */
  public async saveAssistant(assistant: Assistant): Promise<void> {
    await this.save({
      ...assistant,
      updated: Date.now()
    });
    
    Logger.info({
      message: "Assistant saved",
      context: "AssistantStorage",
      data: { assistantId: assistant.id }
    });
  }

  /**
   * 删除助手
   */
  public async deleteAssistant(assistantId: string): Promise<void> {
    const deleted = await this.delete(assistantId);
    
    if (deleted) {
      Logger.info({
        message: "Assistant deleted",
        context: "AssistantStorage",
        data: { assistantId }
      });
    } else {
      Logger.warn({
        message: "Assistant not found for deletion",
        context: "AssistantStorage",
        data: { assistantId }
      });
    }
  }
}
