import { SessionService } from "./service";
import { SessionStorage, SessionMetadata } from "./sessionStorage";
import { AssistantStorage } from "./assistantStorage";
import { HybridStorage } from "./hybridStorage";
import { Session, ChatMessage, SessionServiceConfig, Assistant, AssistantSettings, MessageRole } from "./types";
import { SessionError, ErrorType, StorageError, StorageErrorType } from "./errors";

export {
    // Services
    SessionService,
    SessionStorage,
    AssistantStorage,
    HybridStorage,
    
    // Types
    Session,
    SessionMetadata,
    ChatMessage,
    MessageRole,
    SessionServiceConfig,
    Assistant,
    AssistantSettings,
    
    // Errors
    SessionError,
    ErrorType,
    StorageError,
    StorageErrorType
};

// Export singleton instance
export const sessionService = SessionService.getInstance();
