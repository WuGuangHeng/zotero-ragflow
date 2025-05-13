﻿/** API 错误码枚举 */
export enum ApiErrorCode {
  Success = 0,
  InvalidRequest = 100,
  AuthError = 101,
  BusinessError = 102,
  InsufficientBalance = 402,
  SystemError = 500
}

/** 基础类型定义 */
export type LogLevel = "debug" | "info" | "warn" | "error";
export type RequestMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

/** 知识库状态类型 */
export type KnowledgeBaseStatusType = 
  | "0"      // 未开始
  | "1"      // 就绪
  | "2"      // 处理中
  | "3"      // 出错
  | "4";     // 已删除

// 常量用于状态比较
export const KnowledgeBaseStatus = {
  None: "0" as KnowledgeBaseStatusType,
  Ready: "1" as KnowledgeBaseStatusType,
  Processing: "2" as KnowledgeBaseStatusType,
  Error: "3" as KnowledgeBaseStatusType,
  Deleted: "4" as KnowledgeBaseStatusType
} as const;

/** API 配置接口 */
export interface ApiConfig {
  baseURL: string;
  headers?: Record<string, string>;
  timeout?: number;
}

/** 日志选项接口 */
export interface LogOptions {
  level: LogLevel;
  message: string;
  context?: string;
  data?: any;
  error?: Error;
  timestamp?: number;
}

/** API 错误接口 */
export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, any>;
}

/** API 分页查询参数 */
export interface PaginationParams {
  page?: number;
  page_size?: number;
  orderby?: "create_time" | "update_time";
  desc?: boolean;
}

/** RAGFlow API 响应格式 */
export interface RAGFlowAPIResponse<T = any> {
  code: ApiErrorCode;
  message: string;
  data: T;
}

/** 数据集响应接口 */
export interface DatasetResponse {
  id: string;
  name: string;
  avatar?: string;
  description?: string;
  language: string;
  embedding_model: string;
  chunk_method: string;
  permission: string;
  document_count: number;
  chunk_count: number;
  token_num: number;
  status: KnowledgeBaseStatusType;
  create_time: number;
  update_time: number;
  similarity_threshold: number;
  vector_similarity_weight: number;
  parser_config: {
    chunk_token_count: number;
    layout_recognize: boolean;
    html4excel: boolean;
    delimiter: string;
    task_page_size: number;
    raptor: {
      use_raptor: boolean;
    };
    entity_types?: string[];
  };
}

/** 文档上传请求参数 */
export interface UploadDocumentRequest {
  file: File;
  metadata?: Record<string, any>;
  chunk_method?: string;
  parser_config?: Partial<DatasetResponse['parser_config']>;
}

/** 文档解析请求参数 */
export interface ParseDocumentsRequest {
  document_ids: string[];
  parser_config?: Partial<DatasetResponse['parser_config']>;
}

/** 文档响应接口 */
export interface DocumentResponse {
  id: string;
  name: string;
  location: string;
  chunk_count: number;
  create_time: number;
  update_time: number;
  created_by: string;
  knowledgebase_id: string;
  parser_config?: {
    chunk_token_count: number;
    delimiter: string;
    layout_recognize: boolean;
    task_page_size: number;
  };
  chunk_method: string;
  process_begin_at: string | null;
  process_duation: number;
  size: number;
  status: string;
  type: string;
  thumbnail?: string;
}

/** 文档列表响应接口 */
export interface DocumentListResponse {
  docs: Array<DocumentResponse>;
  total: number;
}

/** 检索文档接口 */
export interface RetrievalDocument {
  id: string;
  content: string;
  document_id: string;
  document_name: string;
  dataset_id: string;
  image_id: string;
  similarity: number;
  vector_similarity: number;
  term_similarity: number;
  positions: string[];
}

/** 检索响应接口 */
export interface RetrievalResponse {
  chunks: RetrievalDocument[];
  doc_aggs: Array<{
    doc_id: string;
    doc_name: string;
    count: number;
  }>;
  total: number;
}

/** LLM 参数接口 */
export interface LLMParams {
  model_name: string;
  temperature: number;
  top_p: number;
  presence_penalty: number;
  frequency_penalty: number;
  max_tokens: number;
}

/** Prompt 模板参数接口 */
export interface PromptTemplateParams {
  similarity_threshold: number;
  keywords_similarity_weight: number;
  top_n: number;
  variables: Array<{ key: string; optional: boolean }>;
  rerank_model?: string;
  empty_response?: string;
  opener?: string;
  show_quote?: boolean;
  prompt?: string;
}

/** Chat 会话相关接口 */
export interface ChatAssistantParams {
  // 基础参数
  model: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
  similarity_threshold: number;
  top_n: number;

  // 可选参数
  name?: string;
  avatar?: string;
  dataset_ids?: string[];
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
}

/** Chat Assistant 响应接口 */
export interface ChatAssistantResponse {
  id: string;
  name: string;
  avatar?: string;
  dataset_ids: string[];
  create_time: number;
  update_time: number;
  llm: Required<LLMParams>;
  prompt: Required<PromptTemplateParams>;
}

/** Chat Session 接口 */
export interface SessionResponse {
  id: string;
  name: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: number;
  }>;
  create_time: number;
  update_time: number;
}

/** Chat 完成响应接口 */
export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    delta?: {
      content: string;
      role: string;
      function_call: null;
      tool_calls: null;
    };
    message?: {
      content: string;
      role: string;
    };
    finish_reason: string | null;
    index: number;
    logprobs: null;
  }>;
  created: number;
  model: string;
  object: string;
  system_fingerprint: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** 完成接口 */
export interface CompletionResponse {
  answer: string;
  reference?: {
    chunks: Array<{
      id: string;
      content: string;
      document_id: string;
      document_name: string;
      similarity: number;
    }>;
    doc_aggs: Array<{
      doc_id: string;
      doc_name: string;
      count: number;
    }>;
    total: number;
  };
  audio_binary?: null;
  id?: string;
  session_id: string;
}
