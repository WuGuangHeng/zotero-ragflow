import { BaseComponent } from "./components/base";
import { KBStatus } from "./components/kbStatus";
import { SessionList } from "./components/sessionList";
import { ChatView } from "./components/chatView";
import { Session } from "../../services/core/session/types";
import { KnowledgeBaseStatus } from "../../services/core/knowledge/types";
import { sessionService } from "../../services/core/session";
import { knowledgeBaseManager, syncManager } from "../../services/core/knowledge";
import { Logger } from "../../services/logger";
import { eventBus, Events, EventMap } from "./eventBus";
import { cssModule } from "../../services/cssUtils";
import { SyncStatus } from "../../services/core/knowledge/sync";
import { ragflow } from "../../services/ragflow";

/**
 * CSS classes for RAGFlow pane
 */
const CSS_CLASSES = {
  panel: "ragflow-panel",
  kbPanel: "ragflow-kb-panel",
  sessionPanel: "ragflow-session-panel",
  chatPanel: "ragflow-chat-panel"
} as const;

const DEFAULT_KB_ID = "default";
const DEFAULT_SESSION_NAME = "默认会话";

export class RAGFlowPane extends BaseComponent {
  private sessionList?: SessionList;
  private chatView?: ChatView;
  private kbStatus?: KBStatus;
  private currentSession?: Session;
  private knowledgeBases: Array<{ id: string; name: string }> = [];
  private selectedKnowledgeBaseId?: string;
  private knowledgeManager = knowledgeBaseManager;

  constructor(container: HTMLElement) {
    super(container, "ragflow-pane");
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Session events
    eventBus.on(Events.SESSION_SELECTED, ({ id }) => {
      this.loadSession(id);
    });

    eventBus.on(Events.SESSION_CREATED, ({ id, name, knowledgeBaseId, assistantId }) => {
      this.loadSession(id);
    });

    eventBus.on(Events.SESSION_DELETED, ({ id }) => {
      if (this.currentSession?.id === id) {
        this.currentSession = undefined;
        this.chatView?.updateSession(undefined);
      }
    });

    // Knowledge base events
    eventBus.on(Events.KB_SELECTED, ({ id, name }) => {
      this.selectedKnowledgeBaseId = id;
      // Just reset the session selection when KB changes
      if (this.sessionList) {
        this.sessionList.setSelectedSession(undefined);
      }
    });

    eventBus.on(Events.KB_STATUS_CHANGED, ({ id, status }) => {
      if (this.kbStatus) {
        this.kbStatus.updateStatus(status);
      }
    });

    eventBus.on(Events.KB_TASK_UPDATED, ({ id, task }) => {
      // Handle task updates if needed
      Logger.debug({
        message: "KB task updated",
        context: "RAGFlowPane",
        data: { id, task }
      });
    });

    // Knowledge base sync events
    eventBus.on(Events.KB_SYNC_STARTED, ({ id, collectionId }) => {
      if (this.kbStatus && id === this.selectedKnowledgeBaseId) {
        this.kbStatus.updateCollectionId(collectionId);
      }
    });

    eventBus.on(Events.KB_SYNC_PROGRESS, ({ id, progress }) => {
      if (this.kbStatus && id === this.selectedKnowledgeBaseId) {
        this.kbStatus.updateSyncProgress(progress);
      }
    });

    eventBus.on(Events.KB_SYNC_COMPLETED, ({ id, stats }) => {
      if (this.kbStatus && id === this.selectedKnowledgeBaseId) {
        const syncStatus = syncManager.getStatus(stats.collectionId);
        if (syncStatus) {
          this.kbStatus.updateSyncStatus(syncStatus);
        }
      }
    });

    eventBus.on(Events.KB_SYNC_FAILED, ({ id, error }) => {
      if (this.kbStatus && id === this.selectedKnowledgeBaseId) {
        this.kbStatus.setError(error.message);
      }
    });

    eventBus.on(Events.KB_SYNC_PAUSED, ({ id }) => {
      if (this.kbStatus && id === this.selectedKnowledgeBaseId) {
        // We need to find the collection id some other way
        const collectionId = this.findCollectionIdForKB(id);
        if (collectionId) {
          const syncStatus = syncManager.getStatus(collectionId);
          if (syncStatus) {
            this.kbStatus.updateSyncStatus(syncStatus);
          }
        }
      }
    });

    eventBus.on(Events.KB_SYNC_RESUMED, ({ id }) => {
      if (this.kbStatus && id === this.selectedKnowledgeBaseId) {
        // We need to find the collection id some other way
        const collectionId = this.findCollectionIdForKB(id);
        if (collectionId) {
          const syncStatus = syncManager.getStatus(collectionId);
          if (syncStatus) {
            this.kbStatus.updateSyncStatus(syncStatus);
          }
        }
      }
    });
  }

  private findCollectionIdForKB(kbId: string): string | undefined {
    // This is a placeholder - in the real implementation, we would need to
    // get this from the KB status component or from a stored mapping
    return '';
  }

  protected render(): void {
    // This method is called by BaseComponent's constructor
    // Actual initialization is done in init()
  }

  public async init(): Promise<void> {
    try {
      // Create pane structure
      this.element.innerHTML = `
        <div class="${cssModule(CSS_CLASSES, ["panel", "kbPanel"])}">
          <div id="kb-status"></div>
        </div>
        <div class="${cssModule(CSS_CLASSES, ["panel", "sessionPanel"])}">
          <div id="session-list"></div>
        </div>
        <div class="${cssModule(CSS_CLASSES, ["panel", "chatPanel"])}">
          <div id="chat-view"></div>
        </div>
      `;

      // Fetch knowledge bases
      try {
        const kbs = await ragflow.listDatasets();
        this.knowledgeBases = kbs.map(kb => ({
          id: kb.id,
          name: kb.name
        }));
        
        if (kbs.length > 0 && !this.selectedKnowledgeBaseId) {
          this.selectedKnowledgeBaseId = kbs[0].id;
        }
      } catch (error) {
        Logger.error({
          message: "Failed to fetch knowledge bases",
          context: "RAGFlowPane",
          error: error as Error
        });
        this.knowledgeBases = [];
      }

      // Initialize KB status component
      const kbContainer = this.element.querySelector("#kb-status") as HTMLElement;
      if (kbContainer) {
        const kbId = this.selectedKnowledgeBaseId || DEFAULT_KB_ID;
        const status = await this.knowledgeManager.getStatus(kbId);
        
        // Get sync status if available
        let syncStatus: SyncStatus | undefined;
        let collectionId: string | undefined;
        
        if (this.selectedKnowledgeBaseId) {
          // Check if there's a sync config for this KB
          // Iterate over all configs to find one matching our dataset ID
          const configs = await Promise.all(
            Array.from(this.knowledgeBases).map(async kb => {
              const config = syncManager.getConfig(kb.id);
              return { kb, config };
            })
          );
          
          const matchingConfig = configs.find(({ kb, config }) => 
            config && config.datasetId === this.selectedKnowledgeBaseId
          );
          
          if (matchingConfig?.config) {
            collectionId = matchingConfig.config.collectionId;
            syncStatus = syncManager.getStatus(collectionId);
          }
        }
        
        this.kbStatus = new KBStatus(kbContainer, {
          status,
          syncStatus,
          collectionId,
          onSelect: () => {
            eventBus.emit(Events.KB_SELECTED, { 
              id: status.id,
              name: status.name || "未命名知识库"
            });
          },
          onSync: async () => {
            if (!collectionId) return;
            
            try {
              await syncManager.manualSync(collectionId);
              
              // Update sync status
              const newSyncStatus = syncManager.getStatus(collectionId);
              if (newSyncStatus && this.kbStatus) {
                this.kbStatus.updateSyncStatus(newSyncStatus);
              }
            } catch (error) {
              Logger.error({
                message: "Failed to start sync",
                context: "RAGFlowPane",
                error: error as Error
              });
              this.kbStatus?.setError((error as Error).message);
            }
          },
          onPauseSync: () => {
            if (!collectionId) return;
            
            try {
              syncManager.pauseSync(collectionId);
              
              // Update sync status
              const newSyncStatus = syncManager.getStatus(collectionId);
              if (newSyncStatus && this.kbStatus) {
                this.kbStatus.updateSyncStatus(newSyncStatus);
              }
            } catch (error) {
              Logger.error({
                message: "Failed to pause sync",
                context: "RAGFlowPane",
                error: error as Error
              });
            }
          },
          onResumeSync: () => {
            if (!collectionId) return;
            
            try {
              syncManager.resumeSync(collectionId);
              
              // Update sync status
              const newSyncStatus = syncManager.getStatus(collectionId);
              if (newSyncStatus && this.kbStatus) {
                this.kbStatus.updateSyncStatus(newSyncStatus);
              }
            } catch (error) {
              Logger.error({
                message: "Failed to resume sync",
                context: "RAGFlowPane",
                error: error as Error
              });
            }
          },
          onCancelSync: () => {
            if (!collectionId) return;
            
            try {
              syncManager.cancelSync(collectionId);
              
              // Update sync status
              const newSyncStatus = syncManager.getStatus(collectionId);
              if (newSyncStatus && this.kbStatus) {
                this.kbStatus.updateSyncStatus(newSyncStatus);
              }
            } catch (error) {
              Logger.error({
                message: "Failed to cancel sync",
                context: "RAGFlowPane",
                error: error as Error
              });
            }
          }
        });
        await this.kbStatus.init();
      }

      // Initialize session list component
      const sessionContainer = this.element.querySelector("#session-list") as HTMLElement;
      if (sessionContainer) {
        const sessions = await sessionService.getSessions();
        this.sessionList = new SessionList(sessionContainer, {
          sessions,
          selectedId: this.currentSession?.id,
          knowledgeBases: this.knowledgeBases,
          selectedKnowledgeBaseId: this.selectedKnowledgeBaseId,
          onSelect: async (id) => {
            await this.loadSession(id);
          },
          onCreate: async (knowledgeBaseId, knowledgeBaseName) => {
            await this.createSession(knowledgeBaseId, knowledgeBaseName);
          },
          onDelete: async (id) => {
            await this.deleteSession(id);
          },
          onSelectKnowledgeBase: (id, name) => {
            eventBus.emit(Events.KB_SELECTED, { id, name });
          }
        });
        await this.sessionList.init();
      }

      // Initialize chat view component
      const chatContainer = this.element.querySelector("#chat-view") as HTMLElement;
      if (chatContainer) {
        this.chatView = new ChatView(chatContainer, {
          session: this.currentSession,
          onSendMessage: async (content) => {
            await this.sendMessage(content);
          },
          onClose: () => {
            this.closeChat();
          }
        });
        await this.chatView.init();
      }

      Logger.info({
        message: "RAGFlow pane initialized",
        context: "RAGFlowPane"
      });
    } catch (error) {
      Logger.error({
        message: "Failed to initialize RAGFlow pane",
        context: "RAGFlowPane",
        error: error as Error
      });
      throw error;
    }
  }

  private async loadSession(id: string): Promise<void> {
    try {
      const session = await sessionService.getSession(id);
      this.currentSession = session;
      
      // Get assistant for the session
      let assistant = undefined;
      if (session.assistantId) {
        try {
          assistant = await sessionService.getAssistant(session.assistantId);
        } catch (error) {
          Logger.warn({
            message: "Failed to load assistant for session",
            context: "RAGFlowPane",
            error: error as Error,
            data: { assistantId: session.assistantId, sessionId: session.id }
          });
        }
      }
      
      this.chatView?.updateSession(session, assistant, session.knowledgeBaseName);
      this.sessionList?.setSelectedSession(id);
    } catch (error) {
      Logger.error({
        message: "Failed to load session",
        context: "RAGFlowPane",
        error: error as Error
      });
    }
  }

  private async createSession(knowledgeBaseId: string, knowledgeBaseName: string): Promise<void> {
    try {
      const sessionName = `会话 ${new Date().toLocaleString()}`;
      const session = await sessionService.createSession(
        knowledgeBaseId,
        knowledgeBaseName,
        {
          name: sessionName,
          description: `Created for knowledge base: ${knowledgeBaseName}`
        }
      );
      
      await this.loadSession(session.id);
      
      // Refresh session list - need to reinitialize
      await this.sessionList?.init();
    } catch (error) {
      Logger.error({
        message: "Failed to create session",
        context: "RAGFlowPane",
        error: error as Error
      });
    }
  }

  private async deleteSession(id: string): Promise<void> {
    try {
      await sessionService.deleteSession(id);
      
      // If the deleted session is the current one, clear it
      if (this.currentSession?.id === id) {
        this.currentSession = undefined;
        this.chatView?.updateSession(undefined);
      }
      
      // Refresh session list - need to reinitialize
      await this.sessionList?.init();
    } catch (error) {
      Logger.error({
        message: "Failed to delete session",
        context: "RAGFlowPane",
        error: error as Error
      });
    }
  }

  private async sendMessage(content: string): Promise<void> {
    if (!this.currentSession) return;

    try {
      await sessionService.sendMessage(this.currentSession.id, content);
      
      // Reload session to get the updated messages
      await this.loadSession(this.currentSession.id);
    } catch (error) {
      Logger.error({
        message: "Failed to send message",
        context: "RAGFlowPane",
        error: error as Error
      });
      throw error;
    }
  }

  private closeChat(): void {
    this.currentSession = undefined;
    this.chatView?.updateSession(undefined);
    this.sessionList?.setSelectedSession(undefined);
  }

  public override destroy(): void {
    this.kbStatus?.destroy();
    this.sessionList?.destroy();
    this.chatView?.destroy();
    super.destroy();
  }
}
