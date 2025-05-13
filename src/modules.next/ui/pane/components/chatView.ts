import { BaseComponent } from "./base";
import { Session, ChatMessage, MessageRole, Assistant } from "../../../services/core/session/types";
import { Events } from "../eventBus";
import { ChatViewProps, ChatViewState } from "../../types";
import { Logger } from "../../../services/logger";
import { classes } from "./styles";
import cssStyles from "./chatView.css";

export class ChatView extends BaseComponent {
  private state: ChatViewState;
  private props: ChatViewProps;
  private messageList?: HTMLElement;
  private inputElement?: HTMLTextAreaElement;

  constructor(container: HTMLElement, props: ChatViewProps) {
    super(container, cssStyles.chatView);
    this.props = props;
    this.state = {
      sending: false,
      input: "",
      messages: props.session?.messages || [],
      scrollToBottom: true,
      assistant: props.assistant,
      knowledgeBaseName: props.knowledgeBaseName
    };

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Handle session updates
    this.on(Events.SESSION_UPDATED, ({ id }) => {
      if (this.props.session && id === this.props.session.id) {
        this.setState({ messages: this.props.session.messages });
      }
    });

    // Handle assistant updates
    this.on(Events.ASSISTANT_UPDATED, ({ assistant }) => {
      if (this.props.session && assistant.id === this.props.session.assistantId) {
        this.setState({ assistant });
      }
    });
  }

  public async init(): Promise<void> {
    this.render();
    this.scrollToBottom();
  }

  private setState(updates: Partial<ChatViewState>): void {
    this.state = { ...this.state, ...updates };
    this.render();

    if (this.state.scrollToBottom) {
      this.scrollToBottom();
    }
  }

  protected render(): void {
    const { session } = this.props;
    const { sending, error, messages, assistant, knowledgeBaseName } = this.state;

    // Update component state classes
    this.element.classList.toggle(cssStyles.loading, sending);
    this.element.classList.toggle(cssStyles.error, !!error);

    // Render content
    this.element.innerHTML = `
      <div class="${cssStyles.chatHeader}">
        <h2 class="${cssStyles.chatTitle}">
          ${session ? session.name : "新会话"}
        </h2>
        <button class="${cssStyles.chatClose}" id="close-chat">
          关闭
        </button>
      </div>
      
      ${this.renderKnowledgeBaseInfo()}
      
      ${error ? `
        <div class="${cssStyles.chatError}">
          ${error}
        </div>
      ` : ""}
      
      <div class="${cssStyles.chatMessages}" id="message-list">
        ${messages.map(msg => this.renderMessage(msg)).join("")}
      </div>
      
      <div class="${cssStyles.chatInputContainer}">
        <div class="${cssStyles.chatInputWrapper}">
          <textarea 
            class="${cssStyles.chatInput}"
            id="chat-input"
            placeholder="输入消息..."
            rows="1"
            ${sending ? "disabled" : ""}
          >${this.state.input}</textarea>
          <button 
            class="${cssStyles.chatSend}"
            id="send-message"
            ${sending || !this.state.input.trim() ? "disabled" : ""}
          >
            发送
          </button>
        </div>
      </div>
    `;

    // Cache elements
    this.messageList = this.element.querySelector("#message-list") || undefined;
    this.inputElement = this.element.querySelector("#chat-input") || undefined;

    // Add event listeners
    this.addEventListeners();
  }

  private renderKnowledgeBaseInfo(): string {
    const { assistant, knowledgeBaseName } = this.state;
    
    if (!assistant && !knowledgeBaseName) {
      return '';
    }
    
    return `
      <div class="${cssStyles.chatInfo}">
        ${knowledgeBaseName ? `
          <div class="${cssStyles.chatKbName}">
            知识库: ${knowledgeBaseName}
          </div>
        ` : ''}
        
        ${assistant ? `
          <div class="${cssStyles.chatAssistantInfo}">
            <span class="${cssStyles.chatAssistantName}">
              助手: ${assistant.name}
            </span>
            ${assistant.settings?.model ? `
              <span class="${cssStyles.chatAssistantModel}">
                ${assistant.settings.model}
              </span>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderMessage(message: ChatMessage): string {
    const { role, content, sources } = message;
    const roleClass = cssStyles[`message${role.charAt(0).toUpperCase() + role.slice(1)}`];

    return `
      <div class="${cssStyles.message} ${roleClass}">
        <div class="${cssStyles.messageContent}">
          ${content}
        </div>
        ${sources && sources.length > 0 ? `
          <div class="${cssStyles.messageSources}">
            <div>参考来源：</div>
            ${sources.map(source => `
              <div class="${cssStyles.messageSource}">
                <div class="${cssStyles.messageSourceTitle}">
                  ${source.document_name}
                </div>
                <div class="${cssStyles.messageSourceContent}">
                  ${source.content}
                </div>
              </div>
            `).join("")}
          </div>
        ` : ""}
      </div>
    `;
  }

  private addEventListeners(): void {
    // Close button
    const closeButton = this.element.querySelector("#close-chat");
    if (closeButton) {
      closeButton.addEventListener("click", this.props.onClose);
    }

    // Input handling
    if (this.inputElement) {
      // Auto-resize input
      this.inputElement.addEventListener("input", () => {
        this.resizeInput();
        this.setState({ input: this.inputElement!.value });
      });

      // Handle enter key
      this.inputElement.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
    }

    // Send button
    const sendButton = this.element.querySelector("#send-message");
    if (sendButton) {
      sendButton.addEventListener("click", () => this.sendMessage());
    }
  }

  private async sendMessage(): Promise<void> {
    const { input, sending } = this.state;
    const trimmedInput = input.trim();

    if (sending || !trimmedInput) return;

    try {
      this.setState({ sending: true, error: undefined });
      await this.props.onSendMessage(trimmedInput);
      this.setState({ 
        input: "",
        sending: false,
        scrollToBottom: true
      });
      this.resizeInput();
    } catch (error) {
      Logger.error({
        message: "Failed to send message",
        context: "ChatView",
        error: error as Error
      });
      this.setState({
        sending: false,
        error: (error as Error).message,
        scrollToBottom: true
      });
    }
  }

  private resizeInput(): void {
    if (!this.inputElement) return;

    // Reset height to calculate actual scroll height
    this.inputElement.style.height = "auto";
    
    // Calculate new height
    const newHeight = Math.min(
      Math.max(44, this.inputElement.scrollHeight),
      120
    );

    this.inputElement.style.height = `${newHeight}px`;
  }

  private scrollToBottom(): void {
    if (this.messageList) {
      this.messageList.scrollTop = this.messageList.scrollHeight;
    }
  }

  public updateSession(session?: Session, assistant?: Assistant, knowledgeBaseName?: string): void {
    this.props.session = session;
    this.props.assistant = assistant;
    this.props.knowledgeBaseName = knowledgeBaseName;
    
    this.setState({ 
      messages: session?.messages || [],
      assistant,
      knowledgeBaseName,
      scrollToBottom: true
    });
  }

  public override destroy(): void {
    const closeButton = this.element.querySelector("#close-chat");
    if (closeButton) {
      closeButton.removeEventListener("click", this.props.onClose);
    }

    if (this.inputElement) {
      this.inputElement.removeEventListener("input", () => {});
      this.inputElement.removeEventListener("keydown", () => {});
    }

    const sendButton = this.element.querySelector("#send-message");
    if (sendButton) {
      sendButton.removeEventListener("click", () => {});
    }

    super.destroy();
  }
}
