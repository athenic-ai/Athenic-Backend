/**
 * Utility functions for E2B tests
 */

/**
 * Retry a function with exponential backoff
 * @param fn The function to retry
 * @param maxRetries Maximum number of retries
 * @param initialDelay Initial delay in ms
 * @returns The result of the function
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      console.log(`Attempt ${i + 1}/${maxRetries} failed:`, error);
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Retry failed with unknown error');
}

/**
 * Check if E2B service is available
 * @param url The E2B service URL
 * @returns True if the service is available, false otherwise
 */
export async function isE2BServiceAvailable(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      return false;
    }
    
    const data = await response.json();
    return data?.status === 'healthy';
  } catch (error) {
    console.warn('E2B service health check failed:', error);
    return false;
  }
}

/**
 * Check if E2B API key is available in environment
 * @returns True if the API key is available, false otherwise
 */
export function hasE2BApiKey(): boolean {
  return !!process.env.E2B_API_KEY;
} 