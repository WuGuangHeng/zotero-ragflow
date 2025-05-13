import { Logger } from "../../../services/logger";
import { eventBus, Events, EventType, EventHandler } from "../eventBus";

export abstract class BaseComponent {
  protected element: HTMLElement;
  protected eventHandlers: Map<EventType, Set<EventHandler<any>>> = new Map();
  protected isDestroyed: boolean = false;

  constructor(protected container: HTMLElement, protected className?: string) {
    this.element = document.createElement("div");
    if (className) {
      this.element.className = className;
    }
    container.appendChild(this.element);
  }

  /**
   * Initialize the component
   */
  public abstract init(): Promise<void>;

  /**
   * Render the component
   */
  protected abstract render(): void;

  /**
   * Subscribe to an event
   */
  protected on<T extends EventType>(event: T, handler: EventHandler<T>): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)?.add(handler);
    eventBus.on(event, handler);
  }

  /**
   * Unsubscribe from an event
   */
  protected off<T extends EventType>(event: T, handler: EventHandler<T>): void {
    this.eventHandlers.get(event)?.delete(handler);
    eventBus.off(event, handler);
  }

  /**
   * Emit an event
   */
  protected emit<T extends EventType>(event: T, data: any): void {
    eventBus.emit(event, data);
  }

  /**
   * Update component
   */
  public update(): void {
    if (this.isDestroyed) {
      Logger.warn({
        message: "Attempted to update destroyed component",
        context: this.constructor.name
      });
      return;
    }
    this.render();
  }

  /**
   * Show component
   */
  public show(): void {
    if (!this.isDestroyed) {
      this.element.style.display = "";
    }
  }

  /**
   * Hide component
   */
  public hide(): void {
    if (!this.isDestroyed) {
      this.element.style.display = "none";
    }
  }

  /**
   * Set loading state
   */
  protected setLoading(loading: boolean): void {
    if (loading) {
      this.element.classList.add("loading");
    } else {
      this.element.classList.remove("loading");
    }
  }

  /**
   * Set error state
   */
  protected setError(error?: string): void {
    if (error) {
      this.element.classList.add("error");
      this.element.setAttribute("data-error", error);
    } else {
      this.element.classList.remove("error");
      this.element.removeAttribute("data-error");
    }
  }

  /**
   * Clean up and destroy component
   */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    try {
      // Remove event listeners
      this.eventHandlers.forEach((handlers, event) => {
        handlers.forEach(handler => {
          eventBus.off(event, handler);
        });
      });
      this.eventHandlers.clear();

      // Remove element
      this.element.remove();
      this.isDestroyed = true;

      Logger.debug({
        message: "Component destroyed",
        context: this.constructor.name
      });
    } catch (error) {
      Logger.error({
        message: "Failed to destroy component",
        context: this.constructor.name,
        error: error as Error
      });
    }
  }
}
