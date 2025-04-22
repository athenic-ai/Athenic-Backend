// E2B SDK types to enhance TypeScript support
// Note: These are simplified versions based on the actual API

export interface SandboxRunResult {
  stdout: string;
  stderr: string;
  error: string | null;
  [key: string]: any;
}

export interface RunCodeOptions {
  timeout?: number;
  onStdout?: (stdout: string) => void;
  onStderr?: (stderr: string) => void;
}

export interface SandboxOptions {
  apiKey?: string;
}

// Sandbox interface that matches the e2b library structure
export interface ISandbox {
  id: string;
  runCode(code: string, options?: RunCodeOptions): Promise<SandboxRunResult>;
  close(): Promise<void>;
}

// WebSocket message types
export interface WSStatusMessage {
  type: 'status';
  executionId: string;
  status: string;
  message: string;
  sandboxId?: string;
}

export interface WSOutputMessage {
  type: 'stdout' | 'stderr';
  executionId: string;
  data: string;
}

export interface WSErrorMessage {
  type: 'error';
  executionId: string;
  error: string;
}

export type WSMessage = WSStatusMessage | WSOutputMessage | WSErrorMessage;

// API request/response types
export interface ExecuteCodeRequest {
  code: string;
  language: string;
  timeout?: number;
}

export interface ExecuteCodeResponse {
  executionId: string;
  result?: any;
  error?: string;
  exitCode?: number;
  duration: number;
} 