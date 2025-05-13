export const theme = {
  // Colors
  colors: {
    primary: "var(--ragflow-primary-color, #0060df)",
    secondary: "var(--ragflow-secondary-color, #0a84ff)",
    text: "var(--ragflow-text-color, #0c0c0d)",
    textSecondary: "var(--ragflow-text-secondary-color, #737373)",
    background: "var(--ragflow-background-color, #ffffff)",
    backgroundAlt: "var(--ragflow-background-alt-color, #f9f9fa)",
    border: "var(--ragflow-border-color, #d7d7db)",
    error: "var(--ragflow-error-color, #d70022)",
    success: "var(--ragflow-success-color, #058b00)",
    warning: "var(--ragflow-warning-color, #d7b600)",
    info: "var(--ragflow-info-color, #0a84ff)",
    shadow: "var(--ragflow-shadow-color, rgba(12, 12, 13, 0.1))",
  },

  // Typography
  fonts: {
    primary: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    monospace: "Menlo, Consolas, Monaco, 'Liberation Mono', 'Courier New', monospace",
  },

  // Font sizes
  fontSizes: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
  },

  // Spacing
  spacing: {
    xs: "0.25rem",
    sm: "0.5rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
  },

  // Border radius
  borderRadius: {
    sm: "0.125rem",
    md: "0.25rem",
    lg: "0.5rem",
    full: "9999px",
  },

  // Transitions
  transitions: {
    fast: "150ms ease-in-out",
    normal: "250ms ease-in-out",
    slow: "350ms ease-in-out",
  },

  // Z-index
  zIndex: {
    base: 1,
    dropdown: 1000,
    modal: 1100,
    tooltip: 1200,
  },
};

// CSS class names
export const classes = {
  // Layout
  container: "ragflow-container",
  pane: "ragflow-pane",
  panel: "ragflow-panel",
  section: "ragflow-section",
  
  // Components
  button: "ragflow-button",
  input: "ragflow-input",
  textarea: "ragflow-textarea",
  select: "ragflow-select",
  checkbox: "ragflow-checkbox",
  radio: "ragflow-radio",
  
  // Session
  sessionList: "ragflow-session-list",
  sessionItem: "ragflow-session-item",
  
  // Chat
  chatView: "ragflow-chat-view",
  messageList: "ragflow-message-list",
  message: "ragflow-message",
  messageUser: "ragflow-message-user",
  messageAssistant: "ragflow-message-assistant",
  messageError: "ragflow-message-error",
  messageInput: "ragflow-message-input",
  
  // Knowledge base
  kbStatus: "ragflow-kb-status",
  
  // States
  active: "active",
  selected: "selected",
  loading: "loading",
  error: "error",
  success: "success",
  warning: "warning",
  info: "info",
  disabled: "disabled",
  
  // Animations
  fadeIn: "ragflow-fade-in",
  fadeOut: "ragflow-fade-out",
  slideIn: "ragflow-slide-in",
  slideOut: "ragflow-slide-out",
  
  // Utilities
  hidden: "hidden",
  visuallyHidden: "visually-hidden",
  noScroll: "no-scroll",
  noSelect: "no-select",
  ellipsis: "ellipsis",
};

// CSS animations/transitions
export const animations = {
  fadeIn: "opacity: 0 -> 1",
  fadeOut: "opacity: 1 -> 0",
  slideIn: "transform: translateX(-100%) -> translateX(0)",
  slideOut: "transform: translateX(0) -> translateX(100%)",
};

// Export combined styles
export const styles = {
  theme,
  classes,
  animations,
};
