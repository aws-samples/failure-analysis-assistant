import {
  GetTraceSummariesCommand,
  TimeRangeType,
  TraceSummary,
  XRayClient
} from "@aws-sdk/client-xray";
import { logger } from "../../logger.js";
import { AWSError } from '../errors/aws-error.js';

/**
 * Wrapper class for X-Ray service
 */
export class XRayService {
  private client: XRayClient;
  
  /**
   * Constructor
   * @param client XRayClient 
   */
  constructor(client?: XRayClient) {
    this.client = client || new XRayClient();
  }
  
  /**
   * Get X-Ray trace summaries
   * @param startDate Start date and time
   * @param endDate End date and time
   * @returns Array of trace summaries
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
      
      // Get all traces
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
