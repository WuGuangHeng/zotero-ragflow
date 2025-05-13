import { Logger } from "../../../modules/logger";

/**
 * UI帮助工具类
 */
export class UIHelper {
  /**
   * 创建XUL元素
   */
  public static async loadXULFromURL(url: string, doc: Document): Promise<HTMLElement> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      
      xhr.onload = () => {
        try {
          const parser = new DOMParser();
          const xulDoc = parser.parseFromString(xhr.responseText, "application/xml");
          const importedNode = doc.importNode(xulDoc.documentElement, true);
          resolve(importedNode as HTMLElement);
        } catch (error) {
          Logger.error({
            message: "解析XUL文件失败",
            error,
            data: { url }
          });
          reject(error);
        }
      };
      
      xhr.onerror = () => {
        const error = new Error(`加载XUL文件失败: ${url}`);
        Logger.error({
          message: "加载XUL文件失败",
          error,
          data: { url }
        });
        reject(error);
      };
      
      xhr.send();
    });
  }

  /**
   * 查找 Zotero 主窗口的右侧面板容器
   */
  public static getRightPaneContainer(): Element | null {
    try {
      const doc = Zotero.getMainWindow().document;
      return doc.getElementById("zotero-view-item");
    } catch (error) {
      Logger.error({
        message: "获取右侧面板容器失败",
        error
      });
      return null;
    }
  }

  /**
   * 获取元素样式
   */
  public static getElementStyle(element: HTMLElement | null): CSSStyleDeclaration | null {
    if (!element) return null;
    try {
      const win = Zotero.getMainWindow();
      return win.getComputedStyle(element);
    } catch (error) {
      Logger.error({
        message: "获取元素样式失败",
        error
      });
      return null;
    }
  }

  /**
   * 设置元素可见性
   */
  public static setElementVisibility(element: HTMLElement | null, visible: boolean): void {
    if (!element) return;
    element.style.display = visible ? "flex" : "none";
  }

  /**
   * 创建提示消息
   */
  public static showToast(message: string, type: "info" | "warning" | "error" = "info"): void {
    try {
      const doc = Zotero.getMainWindow().document;
      
      // 创建提示容器
      const toast = doc.createElement("div");
      toast.className = `ragflow-toast ${type}`;
      toast.textContent = message;
      
      // 添加到文档
      doc.body.appendChild(toast);
      
      // 2秒后移除
      setTimeout(() => {
        toast.classList.add("fade-out");
        setTimeout(() => toast.remove(), 300);
      }, 2000);
      
    } catch (error) {
      Logger.error({
        message: "显示提示消息失败",
        error,
        data: { message, type }
      });
    }
  }

  /**
   * 显示确认对话框
   */
  public static showConfirmDialog(
    title: string,
    message: string,
    okLabel = "确定",
    cancelLabel = "取消"
  ): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const win = Zotero.getMainWindow();
        const result = win.confirm(message);
        resolve(result);
      } catch (error) {
        Logger.error({
          message: "显示确认对话框失败",
          error,
          data: { title, message }
        });
        resolve(false);
      }
    });
  }

  /**
   * 显示输入对话框
   */
  public static showPromptDialog(
    title: string,
    message: string,
    defaultValue = "",
    okLabel = "确定",
    cancelLabel = "取消"
  ): Promise<string | null> {
    return new Promise((resolve) => {
      try {
        const win = Zotero.getMainWindow();
        const result = win.prompt(message, defaultValue);
        resolve(result);
      } catch (error) {
        Logger.error({
          message: "显示输入对话框失败",
          error,
          data: { title, message }
        });
        resolve(null);
      }
    });
  }

  /**
   * 获取元素位置和尺寸信息
   */
  public static getElementRect(element: Element | null): DOMRect | null {
    if (!element) return null;
    return element.getBoundingClientRect();
  }

  /**
   * 检查元素是否可见
   */
  public static isElementVisible(element: Element | null): boolean {
    if (!element) return false;
    try {
      const win = Zotero.getMainWindow();
      const style = win.getComputedStyle(element);
      if (!style) return false;
      return style.display !== "none" && style.visibility !== "hidden";
    } catch (error) {
      Logger.error({
        message: "检查元素可见性失败",
        error
      });
      return false;
    }
  }

  /**
   * 使元素滚动到视图
   */
  public static scrollIntoView(element: Element | null, options?: ScrollIntoViewOptions): void {
    if (!element) return;
    try {
      element.scrollIntoView(options || { behavior: "smooth", block: "nearest" });
    } catch (error) {
      Logger.error({
        message: "滚动元素到视图失败",
        error
      });
    }
  }

  /**
   * 添加全局样式表
   */
  public static addGlobalStyles(cssText: string): void {
    try {
      const doc = Zotero.getMainWindow().document;
      const style = doc.createElement("style");
      if (style) {
        style.textContent = cssText;
        if (doc.head) {
          doc.head.appendChild(style);
        }
      }
    } catch (error) {
      Logger.error({
        message: "添加全局样式失败",
        error
      });
    }
  }
}
