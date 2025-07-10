import {
  SecurityHubClient,
  GetFindingsCommand,
  GetFindingsCommandInput,
  AwsSecurityFinding
} from "@aws-sdk/client-securityhub";
import { logger } from "../../logger.js";
import { AWSError } from '../errors/aws-error.js';
import { retryWithExponentialBackoff } from '../common/retry-utils.js';

/**
 * Wrapper class for SecurityHub service
 */
export class SecurityHubService {
  private client: SecurityHubClient;
  
  /**
   * Constructor
   * @param client SecurityHubClient
   */
  constructor(client?: SecurityHubClient) {
    this.client = client || new SecurityHubClient();
  }
  
  /**
   * List SecurityHub findings
   * @returns Array of findings
   */
  async listFindings(): Promise<AwsSecurityFinding[]> {
    logger.info("Start", {function: "listFindings"});
    
    try {
      const getFindingsInput: GetFindingsCommandInput = {
        MaxResults: 50,
        Filters: {
          RecordState: [{
            Comparison: 'EQUALS',
            Value: 'ACTIVE'
          }],
          WorkflowStatus: [{
            Comparison: 'EQUALS',
            Value: 'NEW'
          }]
        },
        SortCriteria: [{
          Field: 'UpdatedAt',
          SortOrder: 'desc'
        }]
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
        'Failed to list SecurityHub findings',
        'SecurityHub',
        'listFindings',
        error as Error
      );
    }
  }
}
