import { Session, ChatMessage, Assistant } from "../services/core/session/types";
import { KnowledgeBaseStatus, KnowledgeBaseTask } from "../services/core/knowledge/types";
import { SyncStatus } from "../services/core/knowledge/sync";
import { TaskProgress } from "../services/core/knowledge/queue";

/**
 * UI Component Props
 */
export interface SessionListProps {
  sessions: Session[];
  selectedId?: string;
  knowledgeBases?: Array<{ id: string; name: string }>;
  selectedKnowledgeBaseId?: string;
  assistants?: Assistant[];
  onSelect: (sessionId: string) => void;
  onCreate: (knowledgeBaseId: string, knowledgeBaseName: string) => void;
  onDelete: (sessionId: string) => void;
  onSelectKnowledgeBase: (id: string, name: string) => void;
}

export interface ChatViewProps {
  session?: Session;
  assistant?: Assistant;
  knowledgeBaseName?: string;
  onSendMessage: (content: string) => Promise<void>;
  onClose: () => void;
}

export interface KnowledgeBaseStatusProps {
  status: KnowledgeBaseStatus;
  syncStatus?: SyncStatus;
  collectionId?: string;
  onSelect?: () => void;
  onSync?: () => void;
  onPauseSync?: () => void;
  onResumeSync?: () => void;
  onCancelSync?: () => void;
  onConfigSync?: () => void;
}

/**
 * UI Component States
 */
export interface SessionListState {
  loading: boolean;
  error?: string;
  filter: string;
  sessions: Session[];
  selectedId?: string;
  knowledgeBases: Array<{ id: string; name: string }>;
  selectedKnowledgeBaseId?: string;
  // Group sessions by knowledge base
  sessionsByKnowledgeBase: Map<string, Session[]>;
  assistantsByKnowledgeBase: Map<string, Assistant>;
}

export interface ChatViewState {
  sending: boolean;
  error?: string;
  input: string;
  messages: ChatMessage[];
  scrollToBottom: boolean;
  assistant?: Assistant;
  knowledgeBaseName?: string;
}

export interface KnowledgeBaseStatusState {
  loading: boolean;
  error?: string;
  status: KnowledgeBaseStatus;
  currentTask?: KnowledgeBaseTask;
  syncStatus?: SyncStatus;
  syncProgress?: TaskProgress;
  showSyncDetails: boolean;
  collectionId?: string;
}

/**
 * UI Configuration
 */
export interface UIConfig {
  paneWidth?: number;
  paneHeight?: number;
  chatViewHeight?: number;
  sessionListHeight?: number;
  statusBarHeight?: number;
  animationDuration?: number;
  theme?: "light" | "dark" | "system";
}

/**
 * UI Manager Configuration
 */
export interface UIManagerConfig extends UIConfig {
  containerId?: string;
  defaultPaneWidth?: number;
  defaultPaneHeight?: number;
  minPaneWidth?: number;
  minPaneHeight?: number;
  maxPaneWidth?: number;
  maxPaneHeight?: number;
  resizable?: boolean;
  draggable?: boolean;
  position?: "left" | "right";
}
