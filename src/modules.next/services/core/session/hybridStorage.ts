import { Logger } from "../../../services/logger";

// 使用 Zotero 中已经存在的 OS 对象而不是通过 Zotero.require 导入
// 在 Zotero 7 中，Zotero.require 已被弃用
const { OS } = Zotero;

/**
 * 混合存储基类
 * 将元数据存储在Zotero.Prefs中，将大型数据（如消息内容）存储在文件系统中
 */
export abstract class HybridStorage<T extends { id: string }> {
  protected items: Map<string, T> = new Map();
  protected needsSync = false;
  protected readonly prefsKey: string;
  protected readonly baseDir: string;

  constructor(prefsKey: string, baseDir: string) {
    this.prefsKey = prefsKey;
    this.baseDir = baseDir;
  }

  /**
   * 初始化存储
   */
  public async init(): Promise<void> {
    try {
      await this.ensureDirectory();
      await this.loadFromPrefs();

      Logger.info({
        message: "Hybrid storage initialized",
        context: this.constructor.name,
        data: { prefsKey: this.prefsKey, baseDir: this.baseDir },
      });
    } catch (error) {
      Logger.error({
        message: "Failed to initialize hybrid storage",
        context: this.constructor.name,
        error: error as Error,
      });
      throw error;
    }
  }

  /**
   * 确保目录存在
   */
  protected async ensureDirectory(): Promise<void> {
    try {
      const dataDir = Zotero.DataDirectory.dir;
      const targetDir = OS.Path.join(dataDir, this.baseDir);
      await OS.File.makeDir(targetDir, { ignoreExisting: true, from: dataDir });

      Logger.debug({
        message: "Directory ensured",
        context: this.constructor.name,
        data: { path: targetDir },
      });
    } catch (error) {
      Logger.error({
        message: "Failed to ensure directory",
        context: this.constructor.name,
        error: error as Error,
      });
      throw error;
    }
  }

  /**
   * 从Prefs加载数据
   */
  protected async loadFromPrefs(): Promise<void> {
    try {
      const json = Zotero.Prefs.get(this.prefsKey, true) as string;

      if (json) {
        const data = JSON.parse(json);
        if (Array.isArray(data)) {
          this.items = new Map(data.map((item) => [item.id, item]));

          Logger.info({
            message: "Data loaded from prefs",
            context: this.constructor.name,
            data: {
              prefsKey: this.prefsKey,
              itemCount: this.items.size,
            },
          });
        }
      }
    } catch (error) {
      Logger.error({
        message: "Failed to load data from prefs",
        context: this.constructor.name,
        error: error as Error,
      });
      throw error;
    }
  }

  /**
   * 同步到Prefs
   */
  public async sync(): Promise<void> {
    if (!this.needsSync) return;

    try {
      // 获取当前数据
      const itemsArray = Array.from(this.items.values());

      Logger.debug({
        message: "Syncing data to prefs",
        context: this.constructor.name,
        data: {
          prefsKey: this.prefsKey,
          itemCount: this.items.size,
        },
      });

      try {
        // 尝试序列化数据
        const data = JSON.stringify(itemsArray);

        // 检查序列化后的数据大小
        const dataSize = data.length;
        if (dataSize > 500000) {
          // 约0.5MB, Zotero prefs可能有大小限制
          Logger.warn({
            message: "Large data being saved to prefs, may cause issues",
            context: this.constructor.name,
            data: { prefsKey: this.prefsKey, sizeBytes: dataSize },
          });
        }

        // 保存到 Prefs
        await Zotero.Prefs.set(this.prefsKey, data, true);
        this.needsSync = false;

        Logger.debug({
          message: "Storage synced to prefs successfully",
          context: this.constructor.name,
          data: {
            prefsKey: this.prefsKey,
            itemCount: this.items.size,
            dataSizeBytes: dataSize,
          },
        });
      } catch (jsonError) {
        Logger.error({
          message: "Failed to stringify data for sync",
          context: this.constructor.name,
          error: jsonError as Error,
          data: {
            prefsKey: this.prefsKey,
            itemCount: itemsArray.length,
          },
        });
        throw jsonError;
      }
    } catch (error) {
      Logger.error({
        message: "Failed to sync storage",
        context: this.constructor.name,
        error: error as Error,
        data: {
          prefsKey: this.prefsKey,
          errorMsg: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  }

  /**
   * 获取所有项目
   */
  public async getAll(): Promise<T[]> {
    return Array.from(this.items.values());
  }

  /**
   * 获取指定项目
   */
  public async get(id: string): Promise<T | undefined> {
    return this.items.get(id);
  }

  /**
   * 保存项目
   * @param item 要保存的项目
   * @param syncNow 是否立即同步到Prefs，默认为false
   */
  public async save(item: T, syncNow: boolean = false): Promise<void> {
    this.items.set(item.id, { ...item });
    this.needsSync = true;

    if (syncNow) {
      await this.sync();
    }
  }

  /**
   * 删除项目
   */
  public async delete(id: string): Promise<boolean> {
    const deleted = this.items.delete(id);
    if (deleted) {
      this.needsSync = true;
    }
    return deleted;
  }

  /**
   * 清空所有数据
   */
  public async clear(): Promise<void> {
    this.items.clear();
    this.needsSync = true;
  }
}
