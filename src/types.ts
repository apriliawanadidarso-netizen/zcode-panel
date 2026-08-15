/** Shared types between the extension host and the webview. */

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface FileContext {
  /** Workspace-relative path, shown to the user. */
  name: string;
  /** Full file content sent to the model. */
  content: string;
}

/** Messages sent from the webview to the extension host. */
export type WebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'send'; text: string }
  | { type: 'stop' }
  | { type: 'clear' }
  | { type: 'removeContext'; name: string };

/** Messages sent from the extension host to the webview. */
export type HostToWebviewMessage =
  | { type: 'user'; text: string; contextFiles: string[] }
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'streaming'; on: boolean }
  | { type: 'error'; text: string }
  | { type: 'cleared' }
  | { type: 'context'; files: string[] };
