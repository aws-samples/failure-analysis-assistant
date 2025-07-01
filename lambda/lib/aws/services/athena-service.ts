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
 * Wrapper class for Athena service
 */
export class AthenaService {
  private client: AthenaClient;
  
  /**
   * Constructor
   * @param client AthenaClient 
   */
  constructor(client?: AthenaClient) {
    this.client = client || new AthenaClient();
  }
  
  /**
   * Execute query in Athena
   * @param query Query string
   * @param queryExecutionContext Query execution context
   * @param queryParams Query parameters
   * @param outputLocation Output location
   * @returns Array of key-value pairs
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
      
      // Wait for query completion
      while (
        queryExecution.QueryExecution?.Status?.State === QueryExecutionState.QUEUED ||
        queryExecution.QueryExecution?.Status?.State === QueryExecutionState.RUNNING
      ) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        queryExecution = await this.client.send(getQueryExecutionCommand);
      }
      
      // Get query results
      let getQueryResultsCommand = new GetQueryResultsCommand({
        QueryExecutionId
      });
      let queryResults = await this.client.send(getQueryResultsCommand);
      
      results = queryResults.ResultSet?.Rows || [];
      
      // Get all results
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
      
      // Apply parameters to query string
      const queryString = query.replace(
        /\?/g,
        () => `'${queryParams.shift() || ""}'`
      );
      
      logger.info("End", {function: "queryToAthena", output: {results, queryString}});
      
      // Convert results to CSV format and return
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
   * Convert array of Row type to CSV format
   * @param rows Array of Row type
   * @returns String in CSV format
   */
  private rowsToCSV(rows: Row[]): string {
    return rows
      .map((row) => row.Data?.map((data) => data.VarCharValue).join(","))
      .join("\n");
  }
}
