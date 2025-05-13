import { 
    ragflow, 
    Logger,
    sessionService,
    knowledgeBaseManager,
    type Session,
    type ChatMessage,
    type KnowledgeBaseStatus,
    type KnowledgeBaseStatusType,
} from "./modules.next";

import { VERSION, isCompatibleVersion, getVersionStatus } from "./modules.next/version";

// 只导出类型
export type {
    Session,
    ChatMessage,
    KnowledgeBaseStatus,
    KnowledgeBaseStatusType,
};

// 重新导出服务
export {
    ragflow,
    sessionService,
    knowledgeBaseManager,
    Logger,
    VERSION,
    isCompatibleVersion,
    getVersionStatus,
};