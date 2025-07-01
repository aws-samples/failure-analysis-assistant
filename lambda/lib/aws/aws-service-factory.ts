import { CloudWatchService } from './services/cloudwatch-service.js';
import { CloudWatchLogsService } from './services/cloudwatch-logs-service.js';
import { AthenaService } from './services/athena-service.js';
import { XRayService } from './services/xray-service.js';
import { BedrockService } from './services/bedrock-service.js';
import { LambdaService } from './services/lambda-service.js';

/**
 * AWS service factory class
 * Provides service instances using singleton pattern
 */
export class AWSServiceFactory {
  private static cloudWatchService: CloudWatchService;
  private static cloudWatchLogsService: CloudWatchLogsService;
  private static athenaService: AthenaService;
  private static xrayService: XRayService;
  private static bedrockService: BedrockService;
  private static lambdaService: LambdaService;
  
  /**
   * Get CloudWatchService instance
   * @returns CloudWatchService instance
   */
  static getCloudWatchService(): CloudWatchService {
    if (!this.cloudWatchService) {
      this.cloudWatchService = new CloudWatchService();
    }
    return this.cloudWatchService;
  }
  
  /**
   * Get CloudWatchLogsService instance
   * @returns CloudWatchLogsService instance
   */
  static getCloudWatchLogsService(): CloudWatchLogsService {
    if (!this.cloudWatchLogsService) {
      this.cloudWatchLogsService = new CloudWatchLogsService();
    }
    return this.cloudWatchLogsService;
  }
  
  /**
   * Get AthenaService instance
   * @returns AthenaService instance
   */
  static getAthenaService(): AthenaService {
    if (!this.athenaService) {
      this.athenaService = new AthenaService();
    }
    return this.athenaService;
  }
  
  /**
   * Get XRayService instance
   * @returns XRayService instance
   */
  static getXRayService(): XRayService {
    if (!this.xrayService) {
      this.xrayService = new XRayService();
    }
    return this.xrayService;
  }
  
  /**
   * Get BedrockService instance
   * @returns BedrockService instance
   */
  static getBedrockService(): BedrockService {
    if (!this.bedrockService) {
      this.bedrockService = new BedrockService();
    }
    return this.bedrockService;
  }
  
  /**
   * Get LambdaService instance
   * @returns LambdaService instance
   */
  static getLambdaService(): LambdaService {
    if (!this.lambdaService) {
      this.lambdaService = new LambdaService();
    }
    return this.lambdaService;
  }
}
