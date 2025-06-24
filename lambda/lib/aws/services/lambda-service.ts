import {
  LambdaClient,
  InvokeCommandInputType,
  InvokeCommand
} from "@aws-sdk/client-lambda";
import { logger } from "../../logger.js";
import { AWSError } from '../errors/aws-error.js';

/**
 * Lambda関数の呼び出し結果の型
 */
export interface LambdaInvokeResult {
  StatusCode?: number;
  FunctionError?: string;
  LogResult?: string;
  ExecutedVersion?: string;
  Payload?: Uint8Array | string | Record<string, unknown>;
}

/**
 * Lambdaサービスのラッパークラス
 */
export class LambdaService {
  private client: LambdaClient;
  
  /**
   * コンストラクタ
   * @param client LambdaClient（テスト用にモックを注入可能）
   */
  constructor(client?: LambdaClient) {
    this.client = client || new LambdaClient();
  }
  
  /**
   * Lambda関数を非同期で呼び出す
   * @param payload ペイロード
   * @param functionName 関数名
   * @returns 呼び出し結果
   */
  async invokeAsyncLambdaFunc(
    payload: string,
    functionName: string
  ): Promise<LambdaInvokeResult> {
    logger.info("Start", {function: "invokeAsyncLambdaFunc", input: {payload, functionName}});
    
    try {
      const input: InvokeCommandInputType = {
        FunctionName: functionName,
        InvocationType: "Event",
        Payload: payload
      };
      
      const invokeCommand = new InvokeCommand(input);
      logger.info("Send command", {command: invokeCommand});
      
      const response = await this.client.send(invokeCommand);
      
      logger.info("End", {function: "invokeAsyncLambdaFunc", output: {response}});
      return response as LambdaInvokeResult;
    } catch (error) {
      logger.error("Error in invokeAsyncLambdaFunc", {error});
      throw new AWSError(
        `Failed to invoke Lambda function ${functionName}`,
        'Lambda',
        'invokeAsyncLambdaFunc',
        error as Error
      );
    }
  }
}
