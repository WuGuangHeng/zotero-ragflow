import { KnowledgeBaseStatus } from "../../../services/types/common";

/** 知识库状态变更事件类型 */
export type KnowledgeBaseEvent = 
  | { type: "toReady"; id: string }
  | { type: "toProcessing"; id: string }
  | { type: "toError"; id: string; error?: Error }
  | { type: "toNone"; id: string };

/** 事件回调类型 */
export type EventCallback<T = any> = (event: T) => void;

export class EventEmitter {
  private events: Map<string, Set<EventCallback<any>>> = new Map();

  public on<T>(event: string, callback: EventCallback<T>): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(callback);
  }

  public off<T>(event: string, callback: EventCallback<T>): void {
    const callbacks = this.events.get(event);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.events.delete(event);
      }
    }
  }

  public emit<T>(event: string, data: T): void {
    const callbacks = this.events.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event callback (${event}):`, error);
        }
      });
    }
  }

  /**
   * 检查是否有指定事件的监听器
   */
  public hasListeners(event: string): boolean {
    return this.events.has(event) && this.events.get(event)!.size > 0;
  }

  /**
   * 获取指定事件的监听器数量
   */
  public listenerCount(event: string): number {
    return this.events.get(event)?.size || 0;
  }

  public removeAllListeners(): void {
    this.events.clear();
  }
}
