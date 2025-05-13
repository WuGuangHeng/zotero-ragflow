import { BaseComponent } from "./base";
import { styles, theme, classes, animations } from "./styles";
import "./styles.css";

export {
  // Base component
  BaseComponent,
  
  // Styles
  styles,
  theme,
  classes,
  animations
};

// Re-export component types
export type { 
  SessionListProps,
  ChatViewProps,
  KnowledgeBaseStatusProps,
  SessionListState,
  ChatViewState,
  KnowledgeBaseStatusState
} from "../../types";

// Note: Individual components (ChatView, SessionList, etc.) 
// will be exported once they are implemented
