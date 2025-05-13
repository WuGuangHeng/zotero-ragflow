// Re-export all services and types
export * from "./services";

// Export initialization functions
import { initializeServices } from "./services";
import { Logger } from "./services/logger";

/**
 * Initialize the entire RAGFlow plugin
 */
export async function initialize(): Promise<void> {
    try {
        // Initialize core services
        await initializeServices();

        Logger.info({
            message: "RAGFlow plugin initialized successfully",
            context: "Plugin"
        });
    } catch (error) {
        Logger.error({
            message: "Failed to initialize RAGFlow plugin",
            context: "Plugin",
            error: error as Error
        });
        throw error;
    }
}

/**
 * Clean up and dispose of all resources
 */
export async function dispose(): Promise<void> {
    try {
        const { sessionService, knowledgeBaseManager } = await import("./services");
        
        // Cleanup services in reverse order of initialization
        await sessionService.dispose();
        knowledgeBaseManager.dispose();

        Logger.info({
            message: "RAGFlow plugin disposed successfully",
            context: "Plugin"
        });
    } catch (error) {
        Logger.error({
            message: "Error during RAGFlow plugin disposal",
            context: "Plugin",
            error: error as Error
        });
        throw error;
    }
}
