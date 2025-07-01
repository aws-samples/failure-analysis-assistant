import {
  CloudWatchClient,
  GetMetricDataCommand,
  GetMetricDataCommandInput,
  ListMetricsCommand,
  Metric,
  MetricDataQuery,
  MetricDataResult
} from '@aws-sdk/client-cloudwatch';
import { logger } from "../../logger.js";
import { AWSError } from '../errors/aws-error.js';

/**
 * Wrapper class for CloudWatch service
 */
export class CloudWatchService {
  private client: CloudWatchClient;
  
  /**
   * Constructor
   * @param client CloudWatchClient 
   */
  constructor(client?: CloudWatchClient) {
    this.client = client || new CloudWatchClient();
  }
  
  /**
   * Get metrics for the specified namespace
   * @param namespace Metrics namespace
   * @returns Array of metrics
   */
  async listMetrics(namespace: string): Promise<Metric[]> {
    logger.info("Start", {function: "listMetrics", input: {namespace}});
    
    try {
      const command = new ListMetricsCommand({
        Namespace: namespace, 
        RecentlyActive: "PT3H" // 型を合わせるために直接リテラルを使用
      });
      
      const response = await this.client.send(command);
      const metrics = response.Metrics || [];
      
      logger.info("End", {function: "listMetrics", output: {metrics}});
      return metrics;
    } catch (error) {
      logger.error("Error in listMetrics", {error});
      throw new AWSError(
        `Failed to list metrics for namespace ${namespace}`,
        'CloudWatch',
        'listMetrics',
        error as Error
      );
    }
  }
  
  /**
   * Get metrics data
   * @param startDate Start date and time
   * @param endDate End date and time
   * @param query Metrics data query
   * @returns Key-value pairs
   */
  async queryMetrics(
    startDate: string,
    endDate: string,
    query: MetricDataQuery[],
    outputKey: string
  ): Promise<MetricDataResult[]> {
    logger.info("Start", {function: "queryMetrics", input: {startDate, endDate, query, outputKey}});
    
    try {
      const input: GetMetricDataCommandInput = {
        MetricDataQueries: query,
        StartTime: new Date(startDate),
        EndTime: new Date(endDate) 
      };
      
      let resGetMetricDataCommand = await this.client.send(new GetMetricDataCommand(input));
      const metricsData = resGetMetricDataCommand.MetricDataResults ? 
        resGetMetricDataCommand.MetricDataResults : [] as MetricDataResult[];
      
      while(resGetMetricDataCommand.NextToken){
        resGetMetricDataCommand = await this.client.send(
          new GetMetricDataCommand({
            NextToken: resGetMetricDataCommand.NextToken, 
            ...input
          })
        );
        
        if(resGetMetricDataCommand.MetricDataResults){
          metricsData.push(...resGetMetricDataCommand.MetricDataResults);
        }
      }
      
      logger.info("End", {function: "queryMetrics", output: {metricsData}});
      return metricsData;
    } catch (error) {
      logger.error("Error in queryMetrics", {error});
      throw new AWSError(
        'Failed to query CloudWatch metrics',
        'CloudWatch',
        'queryMetrics',
        error as Error
      );
    }
  }
}
