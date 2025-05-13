import { UIManager } from "./uiManager";
import {
  eventBus,
  Events,
  type EventMap,
  type EventType,
  type EventData,
} from "./eventBus";
import {
  type UIConfig,
  type UIManagerConfig,
  type SessionListProps,
  type ChatViewProps,
  type KnowledgeBaseStatusProps,
  type SessionListState,
  type ChatViewState,
  type KnowledgeBaseStatusState,
} from "./types";

// Export UI components and types
export {
  // Components
  UIManager,

  // Event system
  eventBus,
  Events,

  // Types
  UIConfig,
  UIManagerConfig,
  SessionListProps,
  ChatViewProps,
  KnowledgeBaseStatusProps,
  SessionListState,
  ChatViewState,
  KnowledgeBaseStatusState,
  EventMap,
  EventType,
  EventData,
};

// Create and export UI manager instance
export const uiManager = UIManager.getInstance({
  defaultPaneWidth: 360,
  defaultPaneHeight: 600,
  minPaneWidth: 280,
  minPaneHeight: 400,
  resizable: true,
  draggable: true,
  position: "right",
  theme: "system",
});
