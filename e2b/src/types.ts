// E2B SDK types to enhance TypeScript support
// Note: These are simplified versions based on the actual API

export interface SandboxRunResult {
  stdout: string;
  stderr: string;
  error: string | null;
  [key: string]: any;
}

// OutputMessage interface for the E2B code-interpreter
// Matches the actual library implementation
export interface OutputMessage {
  // Make 'text' optional to match the library implementation
  text?: string;
  // Add 'line' property which is what the library actually sends
  line?: string;
  // Flag for error status
  error?: boolean;
  // Timestamp field
  timestamp?: number;
  [key: string]: any;
}

export interface RunCodeOptions {
  timeoutMs?: number;
  onStdout?: (stdout: OutputMessage) => void;
  onStderr?: (stderr: OutputMessage) => void;
}

export interface SandboxOptions {
  apiKey?: string;
}

// Sandbox interface that matches the e2b library structure
export interface ISandbox {
  sandboxId: string;
  runCode(code: string, options?: RunCodeOptions): Promise<any>;
  kill(): Promise<void>;
}

// WebSocket message types
export interface WSStatusMessage {
  type: 'status';
  executionId: string;
  status: string;
  message: string;
  sandboxId?: string;
  duration?: number; // Add duration field for completion status
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

export interface WSResultMessage {
  type: 'result';
  executionId: string;
  data: any;
  duration: number;
}

export type WSMessage = WSStatusMessage | WSOutputMessage | WSErrorMessage | WSResultMessage;

// API request/response types
export interface ExecuteCodeRequest {
  code: string;
  language: string;
  timeout?: number;
}

export interface ExecuteStreamRequest extends ExecuteCodeRequest {
  clientId: string; // Additional field for WebSocket client identification
}

export interface ExecuteCodeResponse {
  executionId: string;
  result?: any;
  error?: string;
  exitCode?: number;
  duration: number;
} 