import {
  GuardDutyClient,
  ListFindingsCommand,
  GetFindingsCommand,
  ListFindingsCommandInput,
  GetFindingsCommandInput,
  Finding
} from "@aws-sdk/client-guardduty";
import { logger } from "../../logger.js";
import { AWSError } from '../errors/aws-error.js';
import { retryWithExponentialBackoff } from '../common/retry-utils.js';

/**
 * Wrapper class for GuardDuty service
 */
export class GuardDutyService {
  private client: GuardDutyClient;
  
  /**
   * Constructor
   * @param client GuardDutyClient
   */
  constructor(client?: GuardDutyClient) {
    this.client = client || new GuardDutyClient();
  }
  
  /**
   * List GuardDuty findings
   * @param detectorId GuardDuty detector ID
   * @returns Array of findings
   */
  async listFindings(detectorId: string): Promise<Finding[]> {
    logger.info("Start", {function: "listFindings", input: {detectorId}});
    
    try {
      // First, get finding IDs
      const listFindingsInput: ListFindingsCommandInput = {
        DetectorId: detectorId,
        MaxResults: 50,
        FindingCriteria: {
          Criterion: {
            'service.archived': {
              Eq: ['false']
            }
          }
        },
        SortCriteria: {
          AttributeName: 'updatedAt',
          OrderBy: 'DESC'
        }
      };
      
      // Retry with exponential backoff
      const listFindingsResponse = await retryWithExponentialBackoff(
        () => this.client.send(new ListFindingsCommand(listFindingsInput))
      );
      
      const findingIds = listFindingsResponse.FindingIds || [];
      
      if (findingIds.length === 0) {
        logger.info("No findings found", {function: "listFindings", detectorId});
        return [];
      }
      
      // Then, get detailed findings
      const getFindingsInput: GetFindingsCommandInput = {
        DetectorId: detectorId,
        FindingIds: findingIds
      };
      
      // Retry with exponential backoff
      const getFindingsResponse = await retryWithExponentialBackoff(
        () => this.client.send(new GetFindingsCommand(getFindingsInput))
      );
      
      const findings = getFindingsResponse.Findings || [];
      
      logger.info("End", {
        function: "listFindings", 
        output: {
          findingCount: findings.length,
        }
      });
      
      return findings;
    } catch (error) {
      logger.error("Error in listFindings", {error});
      throw new AWSError(
        'Failed to list GuardDuty findings',
        'GuardDuty',
        'listFindings',
        error as Error
      );
    }
  }
}
