import { logger } from "../../logger.js";

/**
 * リトライを行う関数
 * @param operation 実行する非同期操作
 * @param maxRetries 最大リトライ回数
 * @param initialDelay 初期遅延時間（ミリ秒）
 * @param maxDelay 最大遅延時間（ミリ秒）
 * @returns 操作の結果
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
      // スロットリングエラーかどうかを確認
      const isThrottlingError = 
        error instanceof Error && 
        (error.name === 'ThrottlingException' || 
         error.message.includes('throttling') || 
         error.message.includes('TooManyRequests') ||
         error.message.includes('Rate exceeded'));
      
      // 最大リトライ回数に達したか、スロットリングエラーでない場合はエラーをスロー
      if (retries >= maxRetries || !isThrottlingError) {
        throw error;
      }
      
      // 遅延時間を計算（エクスポネンシャルバックオフ + ジッター）
      delay = Math.min(delay * 2, maxDelay);
      const jitter = delay * 0.2 * Math.random();
      const waitTime = delay + jitter;
      
      logger.warn(`API throttled. Retrying in ${Math.round(waitTime)}ms (retry ${retries + 1}/${maxRetries})`, { 
        error: error instanceof Error ? error.message : String(error),
        retryCount: retries + 1,
        maxRetries,
        waitTime: Math.round(waitTime)
      });
      
      // 指定時間待機
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      retries++;
    }
  }
}

/**
 * スロットリングエラーかどうかを判定する関数
 * @param error エラーオブジェクト
 * @returns スロットリングエラーの場合はtrue
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
