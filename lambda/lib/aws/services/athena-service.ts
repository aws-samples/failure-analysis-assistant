import {
  AthenaClient,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  StartQueryExecutionCommand,
  QueryExecutionState,
  Row
} from "@aws-sdk/client-athena";
import { logger } from "../../logger.js";
import { AWSError } from '../errors/aws-error.js';

/**
 * Athenaサービスのラッパークラス
 */
export class AthenaService {
  private client: AthenaClient;
  
  /**
   * コンストラクタ
   * @param client AthenaClient（テスト用にモックを注入可能）
   */
  constructor(client?: AthenaClient) {
    this.client = client || new AthenaClient();
  }
  
  /**
   * Athenaでクエリを実行する
   * @param query クエリ文字列
   * @param queryExecutionContext クエリ実行コンテキスト
   * @param queryParams クエリパラメータ
   * @param outputLocation 出力場所
   * @returns キーと値のペアの配列
   */
  async queryToAthena(
    query: string,
    queryExecutionContext: { Database: string },
    queryParams: string[],
    outputLocation: string,
  ): Promise<{ result: string, query: string }> {
    logger.info("Start", {function: "queryToAthena", input: {query, queryExecutionContext, queryParams, outputLocation}});
    
    try {
      let results = [] as Row[];
      
      const startQueryExecutionCommand = new StartQueryExecutionCommand({
        QueryString: query,
        QueryExecutionContext: queryExecutionContext,
        ExecutionParameters: queryParams,
        ResultConfiguration: {
          OutputLocation: outputLocation
        }
      });
      
      const { QueryExecutionId } = await this.client.send(startQueryExecutionCommand);
      
      if (!QueryExecutionId) {
        throw new Error("Failed to get QueryExecutionId");
      }
      
      const getQueryExecutionCommand = new GetQueryExecutionCommand({
        QueryExecutionId
      });
      let queryExecution = await this.client.send(getQueryExecutionCommand);
      
      // クエリ完了を待機
      while (
        queryExecution.QueryExecution?.Status?.State === QueryExecutionState.QUEUED ||
        queryExecution.QueryExecution?.Status?.State === QueryExecutionState.RUNNING
      ) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        queryExecution = await this.client.send(getQueryExecutionCommand);
      }
      
      // クエリ結果を取得
      let getQueryResultsCommand = new GetQueryResultsCommand({
        QueryExecutionId
      });
      let queryResults = await this.client.send(getQueryResultsCommand);
      
      results = queryResults.ResultSet?.Rows || [];
      
      // 全ての結果を取得
      while (queryResults.NextToken) {
        getQueryResultsCommand = new GetQueryResultsCommand({
          QueryExecutionId,
          NextToken: queryResults.NextToken
        });
        queryResults = await this.client.send(getQueryResultsCommand);
        
        if (queryResults.ResultSet?.Rows) {
          results.push(...queryResults.ResultSet.Rows);
        }
      }
      
      // クエリ文字列にパラメータを適用
      const queryString = query.replace(
        /\?/g,
        () => `'${queryParams.shift() || ""}'`
      );
      
      logger.info("End", {function: "queryToAthena", output: {results, queryString}});
      
      // 結果をCSV形式に変換して返す
      return { 
        result: this.rowsToCSV(results),
        query: queryString
      };
    } catch (error) {
      logger.error("Error in queryToAthena", {error});
      throw new AWSError(
        'Failed to query Athena',
        'Athena',
        'queryToAthena',
        error as Error
      );
    }
  }
  
  /**
   * Row型の配列をCSV形式に変換する
   * @param rows Row型の配列
   * @returns CSV形式の文字列
   */
  private rowsToCSV(rows: Row[]): string {
    return rows
      .map((row) => row.Data?.map((data) => data.VarCharValue).join(","))
      .join("\n");
  }
}
