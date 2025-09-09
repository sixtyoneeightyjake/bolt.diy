import type { UIMessage } from 'ai';

// Extended UIMessage type for v5 UI messages with optional convenience fields
export interface ExtendedUIMessage extends UIMessage {
  // Optional timestamp for client-side rendering
  createdAt?: Date;

  // Transitional convenience field for legacy code paths
  content?: string;
}
