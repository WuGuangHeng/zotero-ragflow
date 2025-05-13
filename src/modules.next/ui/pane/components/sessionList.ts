import { BaseComponent } from "./base";
import { Session, Assistant } from "../../../services/core/session/types";
import { Events, eventBus } from "../eventBus";
import { SessionListProps, SessionListState } from "../../types";
import { sessionService } from "../../../services/core/session";
import { knowledgeBaseManager } from "../../../services/core/knowledge";
import { Logger } from "../../../services/logger";
import { styles, classes } from "./styles";
import "./sessionList.css";
import { ragflow } from "../../../services/ragflow";

export class SessionList extends BaseComponent {
  private state: SessionListState;
  private props: SessionListProps;
  private collapsedGroups: Set<string> = new Set();
  private knowledgeManager = knowledgeBaseManager;

  constructor(container: HTMLElement, props: SessionListProps) {
    super(container, classes.sessionList);
    this.props = props;
    this.state = {
      loading: false,
      sessions: props.sessions || [],
      selectedId: props.selectedId,
      filter: "",
      knowledgeBases: props.knowledgeBases || [],
      selectedKnowledgeBaseId: props.selectedKnowledgeBaseId,
      sessionsByKnowledgeBase: new Map(),
      assistantsByKnowledgeBase: new Map()
    };

    // Get singleton instance
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Session events
    this.on(Events.SESSION_CREATED, ({ id, name, knowledgeBaseId }) => {
      this.refreshSessions();
    });

    this.on(Events.SESSION_UPDATED, ({ id }) => {
      this.refreshSessions();
    });

    this.on(Events.SESSION_DELETED, ({ id }) => {
      this.refreshSessions();
    });

    // Knowledge base events
    this.on(Events.KB_SELECTED, ({ id, name }) => {
      this.setState({ selectedKnowledgeBaseId: id });
    });

    // Assistant events
    this.on(Events.ASSISTANT_CREATED, ({ assistant }) => {
      this.refreshAssistants();
    });

    this.on(Events.ASSISTANT_UPDATED, ({ assistant }) => {
      this.refreshAssistants();
    });
  }

  public async init(): Promise<void> {
    try {
      await Promise.all([
        this.refreshSessions(),
        this.refreshKnowledgeBases(),
        this.refreshAssistants()
      ]);
      this.render();
    } catch (error) {
      Logger.error({
        message: "Failed to initialize session list",
        context: "SessionList",
        error: error as Error
      });
      this.setError((error as Error).message);
    }
  }

  private async refreshSessions(): Promise<void> {
    this.setLoading(true);
    try {
      const sessions = await sessionService.getSessions();
      
      // Group sessions by knowledge base
      const sessionsByKB = new Map<string, Session[]>();
      sessions.forEach(session => {
        const kbId = session.knowledgeBaseId;
        if (!sessionsByKB.has(kbId)) {
          sessionsByKB.set(kbId, []);
        }
        sessionsByKB.get(kbId)!.push(session);
      });

      // Sort sessions within each group by updated time
      sessionsByKB.forEach((groupSessions, kbId) => {
        groupSessions.sort((a, b) => b.updated - a.updated);
      });

      this.setState({ 
        sessions, 
        loading: false,
        sessionsByKnowledgeBase: sessionsByKB
      });
    } catch (error) {
      Logger.error({
        message: "Failed to refresh sessions",
        context: "SessionList",
        error: error as Error
      });
      this.setState({ 
        error: (error as Error).message,
        loading: false 
      });
    }
  }

  private async refreshKnowledgeBases(): Promise<void> {
    try {
      // Use ragflow API to get datasets instead 
      const datasets = await ragflow.listDatasets();
      const knowledgeBases = datasets.map(dataset => ({
        id: dataset.id,
        name: dataset.name
      }));
      
      this.setState({ knowledgeBases });
    } catch (error) {
      Logger.error({
        message: "Failed to refresh knowledge bases",
        context: "SessionList",
        error: error as Error
      });
    }
  }

  private async refreshAssistants(): Promise<void> {
    try {
      const assistants = await sessionService.getAssistants();
      
      // Map assistants by knowledge base
      const assistantsByKB = new Map<string, Assistant>();
      assistants.forEach(assistant => {
        assistantsByKB.set(assistant.knowledgeBaseId, assistant);
      });

      this.setState({ assistantsByKnowledgeBase: assistantsByKB });
    } catch (error) {
      Logger.error({
        message: "Failed to refresh assistants",
        context: "SessionList",
        error: error as Error
      });
    }
  }

  private setState(updates: Partial<SessionListState>): void {
    this.state = { ...this.state, ...updates };
    this.render();
  }

  protected render(): void {
    const { 
      sessions, 
      loading, 
      error, 
      selectedId, 
      knowledgeBases,
      selectedKnowledgeBaseId,
      sessionsByKnowledgeBase,
      assistantsByKnowledgeBase
    } = this.state;

    // Update component state classes
    this.element.classList.toggle(classes.loading, loading);
    this.element.classList.toggle(classes.error, !!error);

    // Render content
    this.element.innerHTML = `
      <div class="${classes.sessionList}-header">
        <h2 class="${classes.sessionList}-title">会话列表</h2>
      </div>
      
      ${error ? `
        <div class="${classes.sessionList}-error">
          ${error}
        </div>
      ` : ""}

      <div class="ragflow-kb-selector">
        <label class="ragflow-kb-selector-label">选择知识库</label>
        <select class="ragflow-kb-selector-select" id="kb-selector">
          <option value="">选择知识库...</option>
          ${knowledgeBases.map(kb => `
            <option value="${kb.id}" ${kb.id === selectedKnowledgeBaseId ? 'selected' : ''}>
              ${kb.name}
            </option>
          `).join('')}
        </select>
      </div>
      
      <div class="${classes.sessionList}-content">
        ${sessions.length === 0 ? this.renderEmptyState() : this.renderSessionGroups()}
      </div>
    `;

    // Add event listeners
    this.addEventListeners();
  }

  private renderEmptyState(): string {
    return `
      <div class="${classes.sessionList}-empty">
        <p>暂无会话</p>
        <p>请选择知识库创建新会话</p>
      </div>
    `;
  }

  private renderSessionGroups(): string {
    const { 
      sessionsByKnowledgeBase, 
      knowledgeBases, 
      assistantsByKnowledgeBase 
    } = this.state;

    if (sessionsByKnowledgeBase.size === 0) {
      return this.renderEmptyState();
    }

    return Array.from(knowledgeBases)
      .filter(kb => sessionsByKnowledgeBase.has(kb.id))
      .map(kb => {
        const kbId = kb.id;
        const kbName = kb.name;
        const sessions = sessionsByKnowledgeBase.get(kbId) || [];
        const assistant = assistantsByKnowledgeBase.get(kbId);
        const isCollapsed = this.collapsedGroups.has(kbId);

        return `
          <div class="ragflow-kb-group ${isCollapsed ? 'ragflow-kb-group-collapsed' : ''}" 
               data-kb-id="${kbId}">
            <div class="ragflow-kb-group-header" data-kb-id="${kbId}">
              <div class="ragflow-kb-group-title">${kbName}</div>
              <div class="ragflow-kb-group-info">
                ${sessions.length} 个会话
              </div>
            </div>
            
            <div class="ragflow-kb-group-content">
              ${assistant ? `
                <div class="ragflow-assistant-info">
                  <span class="ragflow-assistant-name">${assistant.name}</span>
                  (模型: ${assistant.settings?.model || '默认'})
                </div>
              ` : ''}
              
              ${sessions.length === 0 ? `
                <div class="ragflow-kb-group-empty">
                  该知识库下暂无会话
                </div>
              ` : sessions.map(session => this.renderSessionItem(session)).join('')}
            </div>
            
            <div class="ragflow-kb-group-actions">
              <button class="${classes.button}" data-action="create-session" data-kb-id="${kbId}" data-kb-name="${kbName}">
                创建会话
              </button>
            </div>
          </div>
        `;
      }).join('');
  }

  private renderSessionItem(session: Session): string {
    const { id, name, messages, updated } = session;
    const isSelected = id === this.state.selectedId;
    const messageCount = messages.length;
    const updatedTime = new Date(updated).toLocaleString();

    return `
      <div class="${classes.sessionItem} ${isSelected ? classes.selected : ""}" 
           data-session-id="${id}">
        <div class="${classes.sessionItem}-content">
          <div class="${classes.sessionItem}-title ellipsis">${name}</div>
          <div class="${classes.sessionItem}-info">
            <span class="${classes.sessionItem}-time">${updatedTime}</span>
            <span class="${classes.sessionItem}-messages">
              ${messageCount} 条消息
            </span>
          </div>
        </div>
        <div class="${classes.sessionItem}-actions">
          <button class="${classes.sessionItem}-button delete" 
                  data-action="delete" 
                  data-session-id="${id}">
            删除
          </button>
        </div>
      </div>
    `;
  }

  private addEventListeners(): void {
    // Knowledge base selector
    const kbSelector = this.element.querySelector("#kb-selector") as HTMLSelectElement;
    if (kbSelector) {
      kbSelector.addEventListener("change", () => {
        const kbId = kbSelector.value;
        const selectedOption = kbSelector.options[kbSelector.selectedIndex];
        const kbName = selectedOption.text;
        
        if (kbId) {
          this.setState({ selectedKnowledgeBaseId: kbId });
          this.props.onSelectKnowledgeBase(kbId, kbName);
          eventBus.emit(Events.KB_SELECTED, { id: kbId, name: kbName });
        }
      });
    }

    // Create session buttons
    const createButtons = this.element.querySelectorAll("[data-action='create-session']");
    createButtons.forEach(button => {
      button.addEventListener("click", () => {
        const kbId = button.getAttribute("data-kb-id");
        const kbName = button.getAttribute("data-kb-name");
        if (kbId && kbName) {
          this.props.onCreate(kbId, kbName);
        }
      });
    });

    // Knowledge base group headers
    const groupHeaders = this.element.querySelectorAll(".ragflow-kb-group-header");
    groupHeaders.forEach(header => {
      header.addEventListener("click", () => {
        const kbId = header.getAttribute("data-kb-id");
        if (kbId) {
          const group = this.element.querySelector(`.ragflow-kb-group[data-kb-id="${kbId}"]`);
          if (group) {
            const isCollapsed = group.classList.toggle("ragflow-kb-group-collapsed");
            if (isCollapsed) {
              this.collapsedGroups.add(kbId);
            } else {
              this.collapsedGroups.delete(kbId);
            }
          }
        }
      });
    });

    // Session items
    const sessionItems = this.element.querySelectorAll(`.${classes.sessionItem}`);
    sessionItems.forEach(item => {
      item.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        const sessionId = item.getAttribute("data-session-id");
        
        if (!sessionId) return;

        // Handle delete action
        if (target.closest(`[data-action="delete"]`)) {
          e.stopPropagation();
          this.props.onDelete(sessionId);
          return;
        }

        // Handle selection
        this.setState({ selectedId: sessionId });
        this.props.onSelect(sessionId);
      });
    });
  }

  public setSelectedSession(sessionId: string | undefined): void {
    if (this.state.selectedId !== sessionId) {
      this.setState({ selectedId: sessionId });
    }
  }

  public override destroy(): void {
    // Clean up event listeners
    super.destroy();
  }
}
