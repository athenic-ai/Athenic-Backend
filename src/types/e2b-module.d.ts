declare module '@e2b/e2b-service' {
  /**
   * Create a new E2B sandbox
   * @param template The E2B template to use (default: 'base')
   * @returns The sandbox ID
   */
  export function createSandbox(template?: string): Promise<string>;
  
  /**
   * Run code in a sandbox and stream output to a client via WebSocket
   * @param sandboxId The ID of the sandbox to use
   * @param code The code to execute
   * @param clientId The WebSocket client ID to stream output to
   * @param timeoutMs Timeout in milliseconds (default: 30000)
   * @returns A promise that resolves when execution completes
   */
  export function runCodeAndStream(
    sandboxId: string,
    code: string,
    clientId: string,
    timeoutMs?: number
  ): Promise<void>;
  
  /**
   * Close a sandbox and release resources
   * @param sandboxId The ID of the sandbox to close
   */
  export function closeSandbox(sandboxId: string): Promise<void>;
  
  /**
   * Get the number of active sandboxes
   * @returns The count of active sandboxes
   */
  export function getActiveSandboxCount(): number;
  
  /**
   * Clean up all active sandboxes
   */
  export function cleanupAllSandboxes(): Promise<void>;
} 