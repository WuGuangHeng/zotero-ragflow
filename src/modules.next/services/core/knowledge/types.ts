import { KnowledgeBaseStatusType, KnowledgeBaseStatus } from "../../../services/types/common";

/** Watcher configuration */
export interface WatcherConfig {
  id: string;
  name: string;
  interval?: number;
  handlers?: {
    onStatusChanged?: (id: string, status: KnowledgeBaseStatus) => void;
    onTaskUpdated?: (id: string, task: KnowledgeBaseTask) => void;
    onError?: (id: string, error: Error) => void;
  };
}

/** Required watcher configuration */
export interface RequiredWatcherConfig {
  id: string;
  name: string;
  interval: number;
  handlers: {
    onStatusChanged: (id: string, status: KnowledgeBaseStatus) => void;
    onTaskUpdated: (id: string, task: KnowledgeBaseTask) => void;
    onError: (id: string, error: Error) => void;
  };
}

/** Watcher event types */
export type WatcherEvent = 
  | { type: "status"; id: string; status: KnowledgeBaseStatus }
  | { type: "task"; id: string; task: KnowledgeBaseTask }
  | { type: "error"; id: string; error: Error };

/**
 * Task type for knowledge base operations
 */
export interface KnowledgeBaseTask {
  id: string;
  type: "upload" | "process" | "parse" | "index" | "search" | "general";
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  total: number;
  message?: string;
  error?: string;
}

/**
 * Knowledge base status
 */
export interface KnowledgeBaseStatus {
  id: string;
  name?: string;
  status: KnowledgeBaseStatusType;
  timestamp: number;
  documentCount?: number;
  chunkCount?: number;
  tokenCount?: number;
  currentTask?: KnowledgeBaseTask;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Knowledge base configuration
 */
export interface KnowledgeBaseConfig {
  id: string;
  name: string;
  description?: string;
  chunkSize?: number;
  overlapSize?: number;
  maxDocuments?: number;
  maxTokens?: number;
  embeddingModel?: string;
  similarityThreshold?: number;
  metadata?: Record<string, any>;
}

/**
 * Document metadata
 */
export interface DocumentMetadata {
  title?: string;
  author?: string;
  date?: string;
  language?: string;
  tags?: string[];
  type?: string;
  size?: number;
  [key: string]: any;
}

/**
 * Document chunk
 */
export interface DocumentChunk {
  id: string;
  content: string;
  metadata?: DocumentMetadata;
  embedding?: number[];
}

/**
 * Knowledge base document
 */
export interface KnowledgeBaseDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  chunks?: DocumentChunk[];
  metadata?: DocumentMetadata;
  status: "pending" | "processing" | "completed" | "failed";
  error?: {
    code: string;
    message: string;
  };
  createdAt: number;
  updatedAt: number;
}

/**
 * Upload document options
 */
export interface UploadDocumentOptions {
  metadata?: DocumentMetadata;
  chunkSize?: number;
  overlapSize?: number;
  skipEmbedding?: boolean;
}

/**
 * Document processing result 
 */
export interface ProcessingResult {
  documentId: string;
  success: boolean;
  chunkCount: number;
  tokenCount: number;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Search query options
 */
export interface SearchOptions {
  limit?: number;
  offset?: number;
  filters?: Record<string, any>;
  similarityThreshold?: number;
  includeMetadata?: boolean;
}
