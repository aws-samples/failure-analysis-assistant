import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
  QueryStatus,
  DescribeLogGroupsCommand,
  LogGroup
} from "@aws-sdk/client-cloudwatch-logs";
import { logger } from "../../logger.js";
import { AWSError } from '../errors/aws-error.js';

/**
 * CloudWatch Logsのフィールド型
 */
export interface LogField {
  field?: string;
  value?: string;
}

/**
 * CloudWatch Logsの結果型
 */
export type LogResults = LogField[][];

/**
 * CloudWatch Logsサービスのラッパークラス
 */
export class CloudWatchLogsService {
  private client: CloudWatchLogsClient;
  
  // 固定値の設定
  private readonly DEFAULT_QUERY_TIMEOUT_MS = 60000; // 60秒
  private readonly QUERY_POLL_INTERVAL_MS = 3000;   // 3秒
  
  /**
   * コンストラクタ
   * @param client CloudWatchLogsClient（テスト用にモックを注入可能）
   */
  constructor(client?: CloudWatchLogsClient) {
    this.client = client || new CloudWatchLogsClient();
  }
  
  /**
   * ロググループの一覧を取得する
   * @param logGroupNamePrefixes ロググループ名のプレフィックス配列
   * @returns ロググループの配列
   */
  async describeLogGroups(logGroupNamePrefixes?: string[]): Promise<LogGroup[]> {
    logger.info("Start", {function: "describeLogGroups", input: {logGroupNamePrefixes}});
    
    try {
      const logGroups: LogGroup[] = [];
      let nextToken: string | undefined;
      
      do {
        const command = new DescribeLogGroupsCommand({
          logGroupNamePrefix: logGroupNamePrefixes && logGroupNamePrefixes.length === 1 ? logGroupNamePrefixes[0] : undefined,
          nextToken
        });
        
        const response = await this.client.send(command);
        
        if (response.logGroups && response.logGroups.length > 0) {
          // 特定のプレフィックスが指定されている場合はフィルタリング
          if (logGroupNamePrefixes && logGroupNamePrefixes.length > 1) {
            const filteredGroups = response.logGroups.filter(group => 
              group.logGroupName && logGroupNamePrefixes.some(prefix => 
                group.logGroupName && prefix && group.logGroupName.startsWith(prefix)
              )
            );
            logGroups.push(...filteredGroups);
          } else {
            logGroups.push(...response.logGroups);
          }
        }
        
        nextToken = response.nextToken;
      } while (nextToken);
      
      logger.info("End", {function: "describeLogGroups", output: {logGroupsCount: logGroups.length}});
      return logGroups;
    } catch (error) {
      logger.error("Error in describeLogGroups", {error});
      throw new AWSError(
        'Failed to describe log groups',
        'CloudWatchLogs',
        'describeLogGroups',
        error as Error
      );
    }
  }
  
  /**
   * CloudWatch Logs Insightでクエリを実行する
   * @param startDate 開始日時
   * @param endDate 終了日時
   * @param logGroups ロググループ名の配列
   * @param queryString クエリ文字列
   * @returns クエリ結果
   */
  async queryLogs(
    startDate: string,
    endDate: string,
    logGroups: string[],
    queryString: string
  ): Promise<LogResults> {
    logger.info("Start", {function: "queryLogs", input: {startDate, endDate, logGroups, queryString}});
    
    try {
      // クエリの開始
      const startQueryCommand = new StartQueryCommand({
        logGroupNames: [...logGroups],
        startTime: this.iso8601ToMilliseconds(startDate),
        endTime: this.iso8601ToMilliseconds(endDate),
        queryString
      });
      
      const resStartQuery = await this.client.send(startQueryCommand);
      
      if (!resStartQuery.queryId) {
        throw new Error("Failed to start query: No query ID returned");
      }
      
      // クエリ結果の取得
      const getQueryResultsCommand = new GetQueryResultsCommand({
        queryId: resStartQuery.queryId
      });
      
      let resQueryResults = await this.client.send(getQueryResultsCommand);
      const startTime = Date.now();
      
      // クエリが完了するまで待機
      while (
        resQueryResults.status === QueryStatus.Running ||
        resQueryResults.status === QueryStatus.Scheduled
      ) {
        // タイムアウトチェック
        if (Date.now() - startTime > this.DEFAULT_QUERY_TIMEOUT_MS) {
          throw new Error(`Query timed out after ${this.DEFAULT_QUERY_TIMEOUT_MS / 1000} seconds`);
        }
        
        await new Promise((resolve) => setTimeout(resolve, this.QUERY_POLL_INTERVAL_MS));
        resQueryResults = await this.client.send(getQueryResultsCommand);
      }
      
      // 結果の変換
      const results = resQueryResults.results || [];
      
      logger.info("End", {function: "queryLogs", output: {resultCount: results.length}});
      return results as LogResults;
    } catch (error) {
      logger.error("Error in queryLogs", {error});
      throw new AWSError(
        'Failed to query CloudWatch Logs',
        'CloudWatchLogs',
        'queryLogs',
        error as Error
      );
    }
  }
  
  /**
   * ISO8601形式の日時文字列をミリ秒に変換する
   * @param isoDate ISO8601形式の日時文字列
   * @returns ミリ秒
   */
  private iso8601ToMilliseconds(isoDate: string): number {
    const date = new Date(isoDate);
    return date.getTime();
  }
}
