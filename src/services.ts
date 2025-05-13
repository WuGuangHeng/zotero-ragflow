/**
 * Internal services for plugin use
 */

// Export from next generation services
export {
  Logger,
  ragflow,
  knowledgeBaseManager,
  sessionService,
} from "./modules.next/services";

export { UIManager } from "./modules.next/ui/uiManager";

export { Events, eventBus } from "./modules.next/ui/eventBus";

export { KnowledgeBaseStatus } from "./modules.next/services/types/common";

// Types
export type { KnowledgeBaseStatusType } from "./modules.next/services/types/common";

export type {
  Session,
  ChatMessage,
} from "./modules.next/services/core/session/types";
