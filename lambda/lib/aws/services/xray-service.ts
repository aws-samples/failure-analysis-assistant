import {
  GetTraceSummariesCommand,
  TimeRangeType,
  TraceSummary,
  XRayClient
} from "@aws-sdk/client-xray";
import { logger } from "../../logger.js";
import { AWSError } from '../errors/aws-error.js';

/**
 * X-Rayサービスのラッパークラス
 */
export class XRayService {
  private client: XRayClient;
  
  /**
   * コンストラクタ
   * @param client XRayClient（テスト用にモックを注入可能）
   */
  constructor(client?: XRayClient) {
    this.client = client || new XRayClient();
  }
  
  /**
   * X-Rayのトレースサマリーを取得する
   * @param startDate 開始日時
   * @param endDate 終了日時
   * @returns トレースサマリーの配列
   */
  async queryToXray(
    startDate: string,
    endDate: string
  ): Promise<TraceSummary[]> {
    logger.info("Start", {function: "queryToXray", input: {startDate, endDate}});
    
    try {
      const input = {
        StartTime: new Date(startDate),
        EndTime: new Date(endDate),
        TimeRangeType: TimeRangeType.Event
      };
      
      let command = new GetTraceSummariesCommand(input);
      let response = await this.client.send(command);
      
      const traces = response.TraceSummaries || [] as TraceSummary[];
      
      // 全てのトレースを取得
      while (response.NextToken) {
        command = new GetTraceSummariesCommand({
          ...input,
          NextToken: response.NextToken
        });
        response = await this.client.send(command);
        
        if (response.TraceSummaries) {
          traces.push(...response.TraceSummaries);
        }
      }
      
      logger.info("End", {function: "queryToXray", output: {traces}});
      return traces;
    } catch (error) {
      logger.error("Error in queryToXray", {error});
      throw new AWSError(
        'Failed to query X-Ray traces',
        'XRay',
        'queryToXray',
        error as Error
      );
    }
  }
}
