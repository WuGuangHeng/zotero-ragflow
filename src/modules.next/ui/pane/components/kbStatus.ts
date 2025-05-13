import { BaseComponent } from "./base";
import { KnowledgeBaseStatus, KnowledgeBaseTask } from "../../../services/core/knowledge/types";
import { Events } from "../eventBus";
import { KnowledgeBaseStatusProps, KnowledgeBaseStatusState } from "../../types";
import { Logger } from "../../../services/logger";
import { cssModule, cssModuleCondition } from "../../../services/cssUtils";
import styles from "./kbStatus.css";
import { SyncStatus } from "../../../services/core/knowledge/sync";
import { TaskProgress } from "../../../services/core/knowledge/queue";

export class KBStatus extends BaseComponent {
  private state: KnowledgeBaseStatusState;
  private props: KnowledgeBaseStatusProps;

  constructor(container: HTMLElement, props: KnowledgeBaseStatusProps) {
    super(container, styles.kbStatus);
    this.props = props;
    this.state = {
      loading: false,
      status: props.status,
      syncStatus: props.syncStatus,
      collectionId: props.collectionId,
      showSyncDetails: false
    };
  }

  public async init(): Promise<void> {
    try {
      this.render();
    } catch (error) {
      Logger.error({
        message: "Failed to initialize KB status component",
        context: "KBStatus",
        error: error as Error
      });
      this.setError((error as Error).message);
    }
  }

  private setState(updates: Partial<KnowledgeBaseStatusState>): void {
    this.state = { ...this.state, ...updates };
    this.render();
  }

  public updateSyncStatus(syncStatus: SyncStatus): void {
    this.setState({ syncStatus });
  }

  public updateSyncProgress(progress: TaskProgress): void {
    this.setState({ syncProgress: progress });
  }

  public updateCollectionId(collectionId: string): void {
    this.setState({ collectionId });
  }

  protected render(): void {
    const { status, currentTask, syncStatus, syncProgress, loading, error, showSyncDetails, collectionId } = this.state;
    const { documentCount = 0, chunkCount = 0 } = status;

    // Update component state classes
    const statusClasses = cssModuleCondition(styles, {
      loading,
      error: !!error,
      [status.status]: true,
      syncing: syncStatus?.state === "syncing",
      syncPaused: syncStatus?.state === "paused",
      syncError: syncStatus?.state === "error"
    });

    this.element.className = cssModule(styles, ["kbStatus"]) + " " + statusClasses;

    // Render content
    this.element.innerHTML = `
      <div class="${styles.kbStatusHeader}">
        <h3 class="${styles.kbStatusTitle}">${status.name || "知识库"}</h3>
        <div class="${styles.kbStatusActions}">
          ${this.renderSyncButton()}
          ${this.props.onSelect ? `
            <button class="${styles.kbStatusSelect}" id="select-kb">
              选择
            </button>
          ` : ""}
        </div>
      </div>

      <div class="${styles.kbStatusContent}">
        <div class="${styles.kbStatusInfo}">
          <div class="${styles.kbStatusState}">
            ${this.renderStatus(status.status)}
          </div>
          <div class="${styles.kbStatusStats}">
            <span>${documentCount} 文档</span>
            <span>${chunkCount} 片段</span>
          </div>
        </div>

        ${currentTask ? `
          <div class="${styles.kbStatusProgress}">
            <div class="${styles.kbStatusProgressBar}"
                 style="width: ${(currentTask.progress / currentTask.total * 100).toFixed(1)}%">
            </div>
            <div class="${styles.kbStatusProgressText}">
              ${currentTask.message || this.getTaskMessage(currentTask)}
            </div>
          </div>
        ` : ""}

        ${error ? `
          <div class="${styles.kbStatusError}">
            ${error}
          </div>
        ` : ""}

        ${this.renderSyncStatus()}
      </div>
    `;

    // Add event listeners
    this.addEventListeners();
  }

  private renderStatus(status: string): string {
    const statusMap: Record<string, { text: string; icon: string }> = {
      none: { text: "未初始化", icon: "❓" },
      ready: { text: "就绪", icon: "✅" },
      processing: { text: "处理中", icon: "⏳" },
      error: { text: "错误", icon: "❌" }
    };

    const { text, icon } = statusMap[status] || statusMap.none;
    return `<span class="${styles.kbStatusIcon}">${icon}</span> ${text}`;
  }

  private renderSyncButton(): string {
    if (!this.props.onSync && !this.state.syncStatus) {
      return '';
    }

    const { syncStatus } = this.state;
    
    if (syncStatus?.state === "syncing") {
      return `
        <div class="${styles.kbSyncControls}">
          <button id="pause-sync" class="${styles.kbSyncButton} ${styles.kbSyncPauseButton}" title="暂停同步">
            <span class="${styles.kbSyncButtonIcon}">⏸</span>
          </button>
          <button id="cancel-sync" class="${styles.kbSyncButton} ${styles.kbSyncCancelButton}" title="取消同步">
            <span class="${styles.kbSyncButtonIcon}">⏹</span>
          </button>
        </div>
      `;
    }
    
    if (syncStatus?.state === "paused") {
      return `
        <div class="${styles.kbSyncControls}">
          <button id="resume-sync" class="${styles.kbSyncButton} ${styles.kbSyncResumeButton}" title="恢复同步">
            <span class="${styles.kbSyncButtonIcon}">▶</span>
          </button>
          <button id="cancel-sync" class="${styles.kbSyncButton} ${styles.kbSyncCancelButton}" title="取消同步">
            <span class="${styles.kbSyncButtonIcon}">⏹</span>
          </button>
        </div>
      `;
    }
    
    return `
      <button id="sync-kb" class="${styles.kbSyncButton}" title="同步知识库">
        <span class="${styles.kbSyncButtonIcon}">🔄</span>
      </button>
    `;
  }

  private renderSyncStatus(): string {
    const { syncStatus, syncProgress, showSyncDetails } = this.state;
    
    if (!syncStatus) {
      return '';
    }
    
    const lastSyncTime = syncStatus.lastSync 
      ? new Date(syncStatus.lastSync).toLocaleString() 
      : '从未';
    
    const syncStateMap: Record<string, { text: string; icon: string }> = {
      idle: { text: "未同步", icon: "⚪" },
      syncing: { text: "同步中", icon: "🔄" },
      error: { text: "同步失败", icon: "❌" },
      paused: { text: "已暂停", icon: "⏸" }
    };
    
    const { text, icon } = syncStateMap[syncStatus.state] || syncStateMap.idle;
    
    let syncProgressBar = '';
    if (syncProgress && (syncStatus.state === 'syncing' || syncStatus.state === 'paused')) {
      syncProgressBar = `
        <div class="${styles.kbSyncProgress}">
          <div class="${styles.kbSyncProgressBar}" 
               style="width: ${syncProgress.percent}%">
          </div>
          <div class="${styles.kbSyncProgressText}">
            ${syncProgress.message || `同步进度: ${syncProgress.percent}%`}
          </div>
        </div>
      `;
    }
    
    // Basic sync status info (always visible)
    const basicInfo = `
      <div class="${styles.kbSyncStatus}">
        <div class="${styles.kbSyncStatusHeader}">
          <div class="${styles.kbSyncState}">
            <span class="${styles.kbSyncIcon}">${icon}</span> ${text}
          </div>
          <div class="${styles.kbSyncLastTime}">
            上次同步: ${lastSyncTime}
          </div>
          <button id="toggle-sync-details" class="${styles.kbSyncDetailsToggle}">
            ${showSyncDetails ? '隐藏' : '详情'} ${showSyncDetails ? '▲' : '▼'}
          </button>
        </div>
        ${syncProgressBar}
      </div>
    `;
    
    // Detailed sync info (only visible when expanded)
    let detailedInfo = '';
    if (showSyncDetails && syncStatus.stats) {
      const stats = syncStatus.stats;
      detailedInfo = `
        <div class="${styles.kbSyncDetails}">
          <div class="${styles.kbSyncStat}">
            <span>总文件数:</span> <strong>${stats.totalFiles}</strong>
          </div>
          <div class="${styles.kbSyncStat}">
            <span>已处理:</span> <strong>${stats.processedFiles}</strong>
          </div>
          <div class="${styles.kbSyncStat}">
            <span>失败:</span> <strong>${stats.failedFiles}</strong>
          </div>
          ${stats.avgProcessingTime ? `
            <div class="${styles.kbSyncStat}">
              <span>平均处理时间:</span> <strong>${Math.round(stats.avgProcessingTime)}ms</strong>
            </div>
          ` : ''}
          ${syncStatus.error ? `
            <div class="${styles.kbSyncError}">
              ${syncStatus.error.message}
            </div>
          ` : ''}
        </div>
      `;
    }
    
    return basicInfo + detailedInfo;
  }

  private getTaskMessage(task: KnowledgeBaseTask): string {
    const { type, progress, total } = task;
    const percent = ((progress / total) * 100).toFixed(1);
    
    const typeMap: Record<string, string> = {
      upload: "上传文件",
      process: "处理文件",
      parse: "解析文档",
      index: "建立索引",
      search: "搜索文档",
      general: "处理中"
    };

    return `${typeMap[type] || "处理中"} (${percent}%)`;
  }

  private addEventListeners(): void {
    if (this.props.onSelect) {
      const selectButton = this.element.querySelector("#select-kb");
      if (selectButton) {
        selectButton.addEventListener("click", () => {
          this.props.onSelect?.();
        });
      }
    }

    // Sync button event listeners
    const syncButton = this.element.querySelector("#sync-kb");
    if (syncButton && this.props.onSync) {
      syncButton.addEventListener("click", () => {
        this.props.onSync?.();
      });
    }

    // Pause sync button
    const pauseButton = this.element.querySelector("#pause-sync");
    if (pauseButton && this.props.onPauseSync) {
      pauseButton.addEventListener("click", () => {
        this.props.onPauseSync?.();
      });
    }

    // Resume sync button
    const resumeButton = this.element.querySelector("#resume-sync");
    if (resumeButton && this.props.onResumeSync) {
      resumeButton.addEventListener("click", () => {
        this.props.onResumeSync?.();
      });
    }

    // Cancel sync button
    const cancelButton = this.element.querySelector("#cancel-sync");
    if (cancelButton && this.props.onCancelSync) {
      cancelButton.addEventListener("click", () => {
        this.props.onCancelSync?.();
      });
    }

    // Toggle sync details button
    const toggleDetailsButton = this.element.querySelector("#toggle-sync-details");
    if (toggleDetailsButton) {
      toggleDetailsButton.addEventListener("click", () => {
        this.setState({ showSyncDetails: !this.state.showSyncDetails });
      });
    }
  }

  public updateStatus(status: KnowledgeBaseStatus): void {
    this.setState({ status });
  }

  public setError(message: string): void {
    this.setState({ error: message });
  }

  public override destroy(): void {
    if (this.props.onSelect) {
      const selectButton = this.element.querySelector("#select-kb");
      if (selectButton) {
        selectButton.removeEventListener("click", this.props.onSelect);
      }
    }

    // Clean up sync button listeners
    if (this.props.onSync) {
      const syncButton = this.element.querySelector("#sync-kb");
      if (syncButton) {
        syncButton.removeEventListener("click", this.props.onSync);
      }
    }

    const pauseButton = this.element.querySelector("#pause-sync");
    if (pauseButton && this.props.onPauseSync) {
      pauseButton.removeEventListener("click", this.props.onPauseSync);
    }

    const resumeButton = this.element.querySelector("#resume-sync");
    if (resumeButton && this.props.onResumeSync) {
      resumeButton.removeEventListener("click", this.props.onResumeSync);
    }

    const cancelButton = this.element.querySelector("#cancel-sync");
    if (cancelButton && this.props.onCancelSync) {
      cancelButton.removeEventListener("click", this.props.onCancelSync);
    }

    super.destroy();
  }
}
