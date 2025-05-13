/**
 * 会话类型
 */
export interface Session {
  id: string;
  name: string;
  description?: string;
  assistantId: string;       // 关联的助手ID
  knowledgeBaseId: string;   // 关联的知识库ID
  knowledgeBaseName?: string;// 知识库名称
  messages: ChatMessage[];
  created: number;
  updated: number;
  tags?: string[];
}

/**
 * 助手类型
 */
export interface Assistant {
  id: string;
  name: string;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  created: number;
  updated: number;
  settings?: AssistantSettings;
}

/**
 * 助手设置
 */
export interface AssistantSettings {
  model: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
  similarity_threshold: number;
  top_n: number;
}

/**
 * 消息角色类型
 */
export type MessageRole = "user" | "assistant" | "system" | "error";

/**
 * 消息类型
 */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  sources?: Array<{
    content: string;
    document_name: string;
  }>;
}

/**
 * 会话服务配置
 */
export interface SessionServiceConfig {
  storageKey?: string;
  assistantStorageKey?: string;
  maxSessions?: number;
  maxAssistants?: number;
  maxMessagesPerSession?: number;
  autoSave?: boolean;
  autoSaveInterval?: number;
}
