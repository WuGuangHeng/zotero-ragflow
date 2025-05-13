import { ragflow } from "./ragflow";
import { Logger } from "./logger";
import { sessionService } from "./core/session";
import { knowledgeBaseManager } from "./core/knowledge";

// Import types explicitly
import {
  RAGFlowAPIResponse,
  ApiConfig,
  RequestMethod,
  LogLevel,
  LogOptions,
  KnowledgeBaseStatusType,
  DatasetResponse,
  DocumentResponse,
  DocumentListResponse,
  RetrievalResponse,
  ChatCompletionResponse,
  ChatAssistantResponse,
  SessionResponse,
  CompletionResponse,
  ChatAssistantParams,
} from "./types/common";

import {
  Session,
  ChatMessage,
  SessionServiceConfig,
} from "./core/session/types";

import { KnowledgeBaseStatus, WatcherConfig } from "./core/knowledge/types";

// Export services
export { ragflow, Logger, sessionService, knowledgeBaseManager };

// Export common types
export {
  RAGFlowAPIResponse,
  ApiConfig,
  RequestMethod,
  LogLevel,
  LogOptions,
  KnowledgeBaseStatusType,
  DatasetResponse,
  DocumentResponse,
  DocumentListResponse,
  RetrievalResponse,
  ChatCompletionResponse,
  ChatAssistantResponse,
  SessionResponse,
  CompletionResponse,
  ChatAssistantParams,
};

// Export session types
export { Session, ChatMessage, SessionServiceConfig };

// Export knowledge base types
export { KnowledgeBaseStatus, WatcherConfig };

// Initialize all services
export async function initializeServices(): Promise<void> {
  try {
    // Initialize session service first
    await sessionService.init();

    // Initialize knowledge base manager
    try {
      await initializeKnowledgeBaseManager();
      Logger.info({
        message: "Knowledge base manager initialized successfully",
        context: "Services",
      });
    } catch (kbError) {
      // Only log error, doesn't affect other services
      Logger.error({
        message:
          "Failed to initialize knowledge base manager, other services will continue",
        context: "Services",
        error: kbError as Error,
      });
    }

    Logger.info({
      message: "All services initialized successfully",
      context: "Services",
    });
  } catch (error) {
    Logger.error({
      message: "Failed to initialize services",
      context: "Services",
      error: error as Error,
    });
    throw error;
  }
}

// Add a separate function to initialize knowledge base manager
async function initializeKnowledgeBaseManager(): Promise<void> {
  // Ensure knowledgeBaseManager instance is created (this is done automatically by import)
  if (!knowledgeBaseManager) {
    throw new Error("Knowledge base manager instance not available");
  }

  // Import necessary components from knowledge module
  const { syncManager, collectionWatcher } = await import("./core/knowledge");

  // Set up collection watcher event listeners if available
  if (typeof collectionWatcher.setupEventListeners === "function") {
    collectionWatcher.setupEventListeners();
    Logger.info({
      message: "Collection watcher event listeners have been set up",
      context: "KnowledgeBaseManager",
    });
  } else {
    Logger.warn({
      message: "Collection watcher setupEventListeners method not found",
      context: "KnowledgeBaseManager",
    });
  }

  // Set longer polling interval to reduce log output
  if (typeof knowledgeBaseManager.setPollingInterval === "function") {
    knowledgeBaseManager.setPollingInterval(60000); // Set to 60 seconds
    Logger.info({
      message: "Knowledge base polling interval set to 60 seconds",
      context: "KnowledgeBaseManager",
    });
  }
}
