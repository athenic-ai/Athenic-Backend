import WebSocket from 'ws';

/**
 * Helper function to wait for a WebSocket to reach a specific state
 * @param socket WebSocket instance to monitor
 * @param state The desired state to wait for
 * @returns Promise that resolves when the socket reaches the desired state
 */
export function waitForSocketState(socket: WebSocket, state: number): Promise<void> {
  return new Promise((resolve) => {
    // If the socket is already in the desired state, resolve immediately
    if (socket.readyState === state) {
      resolve();
      return;
    }
    
    // Create a small delay to periodically check socket state
    const interval = setInterval(() => {
      if (socket.readyState === state) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
    
    // Add event listeners for socket events
    socket.on('open', () => {
      if (state === WebSocket.OPEN) {
        clearInterval(interval);
        resolve();
      }
    });
    
    socket.on('close', () => {
      if (state === WebSocket.CLOSED) {
        clearInterval(interval);
        resolve();
      }
    });
  });
}

/**
 * Waits for a specific message matching the predicate to be received
 * @param socket WebSocket instance to monitor
 * @param predicate Function that checks if a message matches what we're waiting for
 * @param timeout Timeout in milliseconds, defaults to 10000 (10 seconds)
 * @returns Promise that resolves with the message when received, or rejects on timeout
 */
export function waitForMessage(
  socket: WebSocket, 
  predicate: (data: any) => boolean,
  timeout = 10000
): Promise<any> {
  return new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout;
    const messageHandler = (data: WebSocket.RawData) => {
      try {
        const message = JSON.parse(data.toString());
        if (predicate(message)) {
          clearTimeout(timeoutId);
          socket.off('message', messageHandler);
          resolve(message);
        }
      } catch (e) {
        // Ignore parsing errors
      }
    };
    
    // Setup timeout
    timeoutId = setTimeout(() => {
      socket.off('message', messageHandler);
      reject(new Error(`Timed out waiting for matching message after ${timeout}ms`));
    }, timeout);
    
    // Add message listener
    socket.on('message', messageHandler);
  });
} 