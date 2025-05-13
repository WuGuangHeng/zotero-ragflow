import { Logger } from "../../services/logger";
import { KnowledgeBaseStatus, KnowledgeBaseTask } from "../../services/core/knowledge/types";
import { Assistant } from "../../services/core/session/types";
import { SyncStatus } from "../../services/core/knowledge/sync";
import { TaskProgress } from "../../services/core/knowledge/queue";

export type EventMap = {
  // UI Related Events
  "tab:changed": { index: number };
  "pane:visibility_changed": boolean;
  
  // UI Interaction Events
  "ui:open_settings": undefined;
  "ui:show_kb_selector": { id?: string };
  "ui:show_question": { id?: string };
  "ui:show_chat_result": { question: string; answer: string; sources?: any[] };
  "ui:show_history": undefined;
  
  // Session Events
  "session:selected": { id: string };
  "session:created": { id: string; name: string; knowledgeBaseId: string; assistantId: string };
  "session:updated": { id: string };
  "session:deleted": { id: string };
  
  // Message Events
  "message:send": string;
  
  // Knowledge Base Events
  "kb:selected": { id: string; name: string };
  "kb:status_changed": { id: string; status: KnowledgeBaseStatus };
  "kb:task_updated": { id: string; task: KnowledgeBaseTask };

  // Knowledge Base Sync Events
  "kb:sync_started": { id: string; collectionId: string };
  "kb:sync_progress": { id: string; progress: TaskProgress };
  "kb:sync_completed": { id: string; stats: any }; // Using any for now
  "kb:sync_failed": { id: string; error: Error };
  "kb:sync_paused": { id: string };
  "kb:sync_resumed": { id: string };

  // Assistant Events
  "assistant:created": { assistant: Assistant };
  "assistant:updated": { assistant: Assistant };
  "assistant:selected": { id: string };
};

// Event type constants
export const Events = {
  TAB_CHANGED: "tab:changed" as const,
  PANE_VISIBILITY_CHANGED: "pane:visibility_changed" as const,
  
  // UI Interaction Events
  UI_OPEN_SETTINGS: "ui:open_settings" as const,
  UI_SHOW_KB_SELECTOR: "ui:show_kb_selector" as const,
  UI_SHOW_QUESTION: "ui:show_question" as const,
  UI_SHOW_CHAT_RESULT: "ui:show_chat_result" as const,
  UI_SHOW_HISTORY: "ui:show_history" as const,
  
  SESSION_SELECTED: "session:selected" as const,
  SESSION_CREATED: "session:created" as const,
  SESSION_UPDATED: "session:updated" as const,
  SESSION_DELETED: "session:deleted" as const,
  
  SEND_MESSAGE: "message:send" as const,
  
  KB_SELECTED: "kb:selected" as const,
  KB_STATUS_CHANGED: "kb:status_changed" as const,
  KB_TASK_UPDATED: "kb:task_updated" as const,
  
  KB_SYNC_STARTED: "kb:sync_started" as const,
  KB_SYNC_PROGRESS: "kb:sync_progress" as const,
  KB_SYNC_COMPLETED: "kb:sync_completed" as const,
  KB_SYNC_FAILED: "kb:sync_failed" as const,
  KB_SYNC_PAUSED: "kb:sync_paused" as const,
  KB_SYNC_RESUMED: "kb:sync_resumed" as const,

  ASSISTANT_CREATED: "assistant:created" as const,
  ASSISTANT_UPDATED: "assistant:updated" as const,
  ASSISTANT_SELECTED: "assistant:selected" as const
} as const;

export type EventType = keyof EventMap;
export type EventData<T extends EventType> = EventMap[T];
export type EventHandler<T extends EventType> = (data: EventData<T>) => void;

export class EventBus {
  private handlers: Map<EventType, Set<EventHandler<any>>> = new Map();

  public on<T extends EventType>(event: T, handler: EventHandler<T>): void {
    try {
      if (!this.handlers.has(event)) {
        this.handlers.set(event, new Set());
      }
      this.handlers.get(event)?.add(handler);
      
      Logger.debug({
        message: "Event handler registered",
        context: "EventBus",
        data: { event }
      });
    } catch (error) {
      Logger.error({
        message: "Failed to register event handler",
        context: "EventBus",
        data: { event },
        error: error as Error
      });
    }
  }

  public off<T extends EventType>(event: T, handler: EventHandler<T>): void {
    try {
      const handlers = this.handlers.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.handlers.delete(event);
        }
      }

      Logger.debug({
        message: "Event handler removed",
        context: "EventBus",
        data: { event }
      });
    } catch (error) {
      Logger.error({
        message: "Failed to remove event handler",
        context: "EventBus",
        data: { event },
        error: error as Error
      });
    }
  }

  public emit<T extends EventType>(event: T, data: EventData<T>): void {
    try {
      const handlers = this.handlers.get(event);
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(data);
          } catch (error) {
            Logger.error({
              message: "Event handler execution failed",
              context: "EventBus",
              data: { event },
              error: error as Error
            });
          }
        });
      }

      Logger.debug({
        message: "Event emitted",
        context: "EventBus",
        data: { event, handlers: handlers?.size ?? 0 }
      });
    } catch (error) {
      Logger.error({
        message: "Failed to emit event",
        context: "EventBus",
        data: { event },
        error: error as Error
      });
    }
  }

  public clear(): void {
    this.handlers.clear();
    Logger.info({
      message: "Event bus cleared",
      context: "EventBus"
    });
  }
}

// Export singleton instance
export const eventBus = new EventBus();
