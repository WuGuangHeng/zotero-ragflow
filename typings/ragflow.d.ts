import { Session, ChatMessage, KnowledgeBaseStatus, KnowledgeBaseStatusType } from "../src/modules.next";

declare namespace RAGFlow {
    interface IVersion {
        MAJOR: number;
        MINOR: number;
        PATCH: number;
        toString(): string;
    }

    interface IRagFlowService {
        setApiKey(apiKey: string): void;
        setBaseURL(baseURL: string): void;
        createDataset(name: string): Promise<string>;
        uploadFiles(files: Array<{ path: string; name: string; mimeType: string }>, collectionName: string): Promise<string>;
        createChatAssistant(datasetId: string, name: string, params?: any): Promise<string>;
        createSession(chatId: string, name?: string): Promise<string>;
        sendMessage(chatId: string, sessionId: string, question: string): Promise<{
            answer: string;
            sources: Array<{ content: string; document_name: string }>;
        }>;
        getKnowledgeBaseStatus(datasetId: string): Promise<KnowledgeBaseStatusType>;
    }

    interface ISessionService {
        init(): Promise<void>;
        createSession(name: string, chatId: string): Promise<Session>;
        getSessions(): Promise<Session[]>;
        getSession(sessionId: string): Promise<Session>;
        sendMessage(sessionId: string, content: string): Promise<ChatMessage>;
        dispose(): Promise<void>;
    }

    interface IKnowledgeBaseManager {
        addWatcher(config: { id: string; name: string }): void;
        removeWatcher(id: string): void;
        getStatus(id: string): Promise<KnowledgeBaseStatus>;
        onStatusChanged(callback: (event: { id: string; status: KnowledgeBaseStatus }) => void): void;
        offStatusChanged(callback: (event: { id: string; status: KnowledgeBaseStatus }) => void): void;
        dispose(): void;
    }

    interface ILogger {
        debug(options: { message: string; context?: string; data?: any; }): void;
        info(options: { message: string; context?: string; data?: any; }): void;
        warn(options: { message: string; context?: string; data?: any; error?: Error }): void;
        error(options: { message: string; context?: string; data?: any; error: Error }): void;
    }

    interface IPlugin {
        onInit(): Promise<void>;
        onUnload(): Promise<void>;
    }

    interface IRAGFlow {
        plugin: IPlugin;
        ragflow: IRagFlowService;
        sessionService: ISessionService;
        knowledgeBaseManager: IKnowledgeBaseManager;
        Logger: ILogger;
        VERSION: IVersion;
        isCompatibleVersion(version: string, minVersion?: string): boolean;
        getVersionStatus(version: string): string;
    }
}

declare global {
    interface Zotero {
        RAGFlow: RAGFlow.IRAGFlow;
    }
}

export = RAGFlow;
