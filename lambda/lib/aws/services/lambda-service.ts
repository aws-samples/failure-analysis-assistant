import {
  LambdaClient,
  InvokeCommandInputType,
  InvokeCommand
} from "@aws-sdk/client-lambda";
import { logger } from "../../logger.js";
import { AWSError } from '../errors/aws-error.js';

/**
 * Type for Lambda function invocation result
 */
export interface LambdaInvokeResult {
  StatusCode?: number;
  FunctionError?: string;
  LogResult?: string;
  ExecutedVersion?: string;
  Payload?: Uint8Array | string | Record<string, unknown>;
}

/**
 * Wrapper class for Lambda service
 */
export class LambdaService {
  private client: LambdaClient;
  
  /**
   * Constructor
   * @param client LambdaClient 
   */
  constructor(client?: LambdaClient) {
    this.client = client || new LambdaClient();
  }
  
  /**
   * Invoke Lambda function asynchronously
   * @param payload Payload
   * @param functionName Function name
   * @returns Invocation result
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
