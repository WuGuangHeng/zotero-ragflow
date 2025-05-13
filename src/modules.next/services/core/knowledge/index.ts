import { KnowledgeBaseManager } from "./manager";
import { EventEmitter, KnowledgeBaseEvent } from "./events";
import { WatcherConfig, KnowledgeBaseStatus } from "./types";
import { 
  SyncManager, 
  SyncConfig, 
  SyncStatus, 
  SyncEvent, 
  syncManager, 
  collectionWatcher, 
  SyncExecutor 
} from "./sync";

export {
  // KnowledgeBaseManager,
  EventEmitter,
  KnowledgeBaseEvent,
  WatcherConfig,
  KnowledgeBaseStatus,
  SyncManager,
  SyncConfig,
  SyncStatus,
  SyncEvent,
  syncManager,
  collectionWatcher,
  SyncExecutor
};

export const knowledgeBaseManager = KnowledgeBaseManager.getInstance();