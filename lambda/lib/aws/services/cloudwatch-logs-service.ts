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
 * CloudWatch Logs field type
 */
export interface LogField {
  field?: string;
  value?: string;
}

/**
 * CloudWatch Logs result type
 */
export type LogResults = LogField[][];

/**
 * Wrapper class for CloudWatch Logs service
 */
export class CloudWatchLogsService {
  private client: CloudWatchLogsClient;
  
  // Fixed value settings
  private readonly DEFAULT_QUERY_TIMEOUT_MS = 60000; // 60 seconds
  private readonly QUERY_POLL_INTERVAL_MS = 3000;   // 3 seconds
  
  /**
   * Constructor
   * @param client CloudWatchLogsClient 
   */
  constructor(client?: CloudWatchLogsClient) {
    this.client = client || new CloudWatchLogsClient();
  }
  
  /**
   * Get list of log groups
   * @param logGroupNamePrefixes Array of log group name prefixes
   * @returns Array of log groups
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
          // Filter if specific prefixes are specified
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
   * Execute query in CloudWatch Logs Insight
   * @param startDate Start date and time
   * @param endDate End date and time
   * @param logGroups Array of log group names
   * @param queryString Query string
   * @returns Query results
   */
  async queryLogs(
    startDate: string,
    endDate: string,
    logGroups: string[],
    queryString: string
  ): Promise<LogResults> {
    logger.info("Start", {function: "queryLogs", input: {startDate, endDate, logGroups, queryString}});
    
    try {
      // Start query
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
      
      // Get query results
      const getQueryResultsCommand = new GetQueryResultsCommand({
        queryId: resStartQuery.queryId
      });
      
      let resQueryResults = await this.client.send(getQueryResultsCommand);
      const startTime = Date.now();
      
      // Wait until query completes
      while (
        resQueryResults.status === QueryStatus.Running ||
        resQueryResults.status === QueryStatus.Scheduled
      ) {
        // Timeout check
        if (Date.now() - startTime > this.DEFAULT_QUERY_TIMEOUT_MS) {
          throw new Error(`Query timed out after ${this.DEFAULT_QUERY_TIMEOUT_MS / 1000} seconds`);
        }
        
        await new Promise((resolve) => setTimeout(resolve, this.QUERY_POLL_INTERVAL_MS));
        resQueryResults = await this.client.send(getQueryResultsCommand);
      }
      
      // Convert results
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
   * Convert ISO8601 format date and time string to milliseconds
   * @param isoDate ISO8601 format date and time string
   * @returns Milliseconds
   */
  private iso8601ToMilliseconds(isoDate: string): number {
    const date = new Date(isoDate);
    return date.getTime();
  }
}
