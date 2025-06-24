import { CloudWatchService } from './services/cloudwatch-service.js';
import { CloudWatchLogsService } from './services/cloudwatch-logs-service.js';
import { AthenaService } from './services/athena-service.js';
import { XRayService } from './services/xray-service.js';
import { BedrockService } from './services/bedrock-service.js';
import { LambdaService } from './services/lambda-service.js';

/**
 * AWSサービスのファクトリークラス
 * シングルトンパターンでサービスインスタンスを提供する
 */
export class AWSServiceFactory {
  private static cloudWatchService: CloudWatchService;
  private static cloudWatchLogsService: CloudWatchLogsService;
  private static athenaService: AthenaService;
  private static xrayService: XRayService;
  private static bedrockService: BedrockService;
  private static lambdaService: LambdaService;
  
  /**
   * CloudWatchServiceのインスタンスを取得する
   * @returns CloudWatchServiceのインスタンス
   */
  static getCloudWatchService(): CloudWatchService {
    if (!this.cloudWatchService) {
      this.cloudWatchService = new CloudWatchService();
    }
    return this.cloudWatchService;
  }
  
  /**
   * CloudWatchLogsServiceのインスタンスを取得する
   * @returns CloudWatchLogsServiceのインスタンス
   */
  static getCloudWatchLogsService(): CloudWatchLogsService {
    if (!this.cloudWatchLogsService) {
      this.cloudWatchLogsService = new CloudWatchLogsService();
    }
    return this.cloudWatchLogsService;
  }
  
  /**
   * AthenaServiceのインスタンスを取得する
   * @returns AthenaServiceのインスタンス
   */
  static getAthenaService(): AthenaService {
    if (!this.athenaService) {
      this.athenaService = new AthenaService();
    }
    return this.athenaService;
  }
  
  /**
   * XRayServiceのインスタンスを取得する
   * @returns XRayServiceのインスタンス
   */
  static getXRayService(): XRayService {
    if (!this.xrayService) {
      this.xrayService = new XRayService();
    }
    return this.xrayService;
  }
  
  /**
   * BedrockServiceのインスタンスを取得する
   * @returns BedrockServiceのインスタンス
   */
  static getBedrockService(): BedrockService {
    if (!this.bedrockService) {
      this.bedrockService = new BedrockService();
    }
    return this.bedrockService;
  }
  
  /**
   * LambdaServiceのインスタンスを取得する
   * @returns LambdaServiceのインスタンス
   */
  static getLambdaService(): LambdaService {
    if (!this.lambdaService) {
      this.lambdaService = new LambdaService();
    }
    return this.lambdaService;
  }
}
