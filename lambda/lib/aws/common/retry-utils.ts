import { logger } from "../../logger.js";

/**
 * Function to perform retries
 * @param operation Asynchronous operation to execute
 * @param maxRetries Maximum number of retries
 * @param initialDelay Initial delay time (milliseconds)
 * @param maxDelay Maximum delay time (milliseconds)
 * @returns Result of the operation
 */
export async function retryWithExponentialBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 2,
  initialDelay: number = 1000,
  maxDelay: number = 60000
): Promise<T> {
  let retries = 0;
  let delay = initialDelay;
  
  while (true) {
    try {
      return await operation();
    } catch (error) {
      // Check if it's a throttling error
      const isThrottlingError = 
        error instanceof Error && 
        (error.name === 'ThrottlingException' || 
         error.message.includes('throttling') || 
         error.message.includes('TooManyRequests') ||
         error.message.includes('Rate exceeded'));
      
      // Throw error if maximum retries reached or if it's not a throttling error
      if (retries >= maxRetries || !isThrottlingError) {
        throw error;
      }
      
      // Calculate delay time (exponential backoff + jitter)
      delay = Math.min(delay * 2, maxDelay);
      const jitter = delay * 0.2 * Math.random();
      const waitTime = delay + jitter;
      
      logger.warn(`API throttled. Retrying in ${Math.round(waitTime)}ms (retry ${retries + 1}/${maxRetries})`, { 
        error: error instanceof Error ? error.message : String(error),
        retryCount: retries + 1,
        maxRetries,
        waitTime: Math.round(waitTime)
      });
      
      // Wait for specified time
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      retries++;
    }
  }
}

/**
 * Function to determine if an error is a throttling error
 * @param error Error object
 * @returns true if it's a throttling error
 */
export function isThrottlingError(error: unknown): boolean {
  return (
    error instanceof Error && 
    (error.name === 'ThrottlingException' || 
     error.message.includes('throttling') || 
     error.message.includes('TooManyRequests') ||
     error.message.includes('Rate exceeded'))
  );
}
