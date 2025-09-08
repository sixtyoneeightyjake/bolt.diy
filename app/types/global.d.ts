import type { UIMessage } from 'ai';

interface Window {
  showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
  webkitSpeechRecognition: typeof SpeechRecognition;
  SpeechRecognition: typeof SpeechRecognition;
}

interface Performance {
  memory?: {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
  };
}

// Extended UIMessage type with createdAt property
declare global {
  interface ExtendedUIMessage extends UIMessage {
    createdAt?: Date;
    content?: string;
  }
}
