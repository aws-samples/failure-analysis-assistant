import { logger } from "./logger.js";

/**
 * アプリケーション全体の設定を管理するインターフェース
 */
export interface Configuration {
  // 共通設定
  language: string;
  modelId: string;
  
  // セッション関連
  sessionTableName: string | null;
  maxAgentCycles: number;
  
  // CloudWatch関連
  cwLogsLogGroups: string[];
  cwLogsInsightQuery: string;
  
  // Athena関連
  athenaDatabase: string | null;
  athenaQueryBucket: string | null;
  albAccessLogTable: string | null;
  cloudTrailLogTable: string | null;
  
  // X-Ray関連
  xrayTraceEnabled: boolean;
  
  // Knowledge Base関連
  knowledgeBaseEnabled: boolean;
  knowledgeBaseId: string | null;
  rerankModelId: string | null;
  
  // Slack関連
  slackAppTokenKey: string;
  slackSigningSecretKey: string | null;
  
  // アーキテクチャ
  architectureDescription: string;
  
  // AWS関連
  region: string;
  
  // Lambda関数名関連
  lambdaFunctionName: string | null;
  metricsInsightName: string | null;
  findingsReportName: string | null;
  
  // GuardDuty関連
  detectorId: string | null;
}

/**
 * アプリケーション全体の設定を管理するサービス
 * シングルトンパターンを使用して、アプリケーション全体で一貫した設定を提供する
 */
export class ConfigurationService {
  private static instance: ConfigurationService | null = null;
  private config: Configuration;
  
  // 初期化状態を表すグローバル変数
  private static isInitialized: boolean = false;
  private static initializationError: Error | null = null;
  
  /**
   * プライベートコンストラクタ
   * 環境変数から設定を読み込み、重要な設定のバリデーションを行う
   */
  private constructor() {
    logger.info("Initializing ConfigurationService");
    
    try {
      // 環境変数からの読み込み
      this.loadConfigFromEnvironment();
      
      // 初期化成功
      ConfigurationService.isInitialized = true;
      logger.info("ConfigurationService initialized successfully", { 
        language: this.config.language,
        hasAthenaDatabase: !!this.config.athenaDatabase,
        hasAlbAccessLogTable: !!this.config.albAccessLogTable,
        hasCloudTrailLogTable: !!this.config.cloudTrailLogTable,
        xrayTraceEnabled: this.config.xrayTraceEnabled,
        knowledgeBaseEnabled: this.config.knowledgeBaseEnabled,
        logGroupsCount: this.config.cwLogsLogGroups.length
      });
    } catch (error) {
      // 初期化失敗
      ConfigurationService.initializationError = error as Error;
      logger.error("ConfigurationService initialization failed", { error });
      // 例外はスローせず、エラー状態を記録するだけ
    }
  }
  
  /**
   * 環境変数から設定を読み込む
   */
  private loadConfigFromEnvironment(): void {
    // 環境変数からの読み込みをここに集約
    const configuredLogGroups = process.env.CW_LOGS_LOGGROUPS ? 
      JSON.parse(process.env.CW_LOGS_LOGGROUPS).loggroups || [] : 
      [];
    
    this.config = {
      language: process.env.LANG || "en",
      modelId: process.env.MODEL_ID || "",
      sessionTableName: process.env.SESSION_TABLE_NAME || null,
      maxAgentCycles: Number(process.env.MAX_AGENT_CYCLES || "5"),
      cwLogsLogGroups: configuredLogGroups,
      cwLogsInsightQuery: process.env.CW_LOGS_INSIGHT_QUERY || "",
      athenaDatabase: process.env.ATHENA_DATABASE_NAME || null,
      athenaQueryBucket: process.env.ATHENA_QUERY_BUCKET || null,
      albAccessLogTable: process.env.ALB_ACCESS_LOG_TABLE_NAME || null,
      cloudTrailLogTable: process.env.CLOUD_TRAIL_LOG_TABLE_NAME || null,
      xrayTraceEnabled: process.env.XRAY_TRACE === "true",
      knowledgeBaseEnabled: !!process.env.KNOWLEDGEBASE_ID,
      knowledgeBaseId: process.env.KNOWLEDGEBASE_ID || null,
      rerankModelId: process.env.RERANK_MODEL_ID || null,
      slackAppTokenKey: process.env.SLACK_APP_TOKEN_KEY || "",
      slackSigningSecretKey: process.env.SLACK_SIGNING_SECRET_KEY || null,
      architectureDescription: process.env.ARCHITECTURE_DESCRIPTION || "",
      region: process.env.AWS_REGION || "us-east-1",
      lambdaFunctionName: process.env.FUNCTION_NAME || process.env.AWS_LAMBDA_FUNCTION_NAME || null,
      metricsInsightName: process.env.METRICS_INSIGHT_NAME || null,
      findingsReportName: process.env.FINDINGS_REPORT_NAME || null,
      detectorId: process.env.DETECTOR_ID || null
    };
  }
  
  /**
   * シングルトンインスタンスを取得する
   * 初期化に失敗していても例外はスローせず、不完全なインスタンスを返す
   */
  public static getInstance(): ConfigurationService {
    if (!ConfigurationService.instance) {
      ConfigurationService.instance = new ConfigurationService();
    }
    return ConfigurationService.instance;
  }
  
  /**
   * 初期化状態を確認する
   * @returns 初期化状態と、失敗した場合はエラー情報
   */
  public static getInitializationStatus(): { isInitialized: boolean; error: Error | null } {
    return {
      isInitialized: ConfigurationService.isInitialized,
      error: ConfigurationService.initializationError
    };
  }
  
  /**
   * 設定全体を取得する
   */
  public getConfig(): Configuration {
    return this.config;
  }
  
  /**
   * テスト用に設定を上書きする
   * @param config 上書きする設定
   */
  public setConfig(config: Partial<Configuration>): void {
    this.config = { ...this.config, ...config };
    logger.info("Configuration updated", { updatedKeys: Object.keys(config) });
  }
  
  /**
   * 言語設定を取得する
   */
  public getLanguage(): string {
    return this.config.language;
  }
  
  /**
   * モデルIDを取得する
   */
  public getModelId(): string {
    return this.config.modelId;
  }
  
  /**
   * セッションテーブル名を取得する
   */
  public getSessionTableName(): string | null {
    return this.config.sessionTableName;
  }
  
  /**
   * 最大エージェントサイクル数を取得する
   */
  public getMaxAgentCycles(): number {
    return this.config.maxAgentCycles;
  }
  
  /**
   * CloudWatch Logsのロググループを取得する
   */
  public getCwLogsLogGroups(): string[] {
    return this.config.cwLogsLogGroups;
  }
  
  /**
   * CloudWatch Logs Insightsのデフォルトクエリを取得する
   */
  public getCwLogsInsightQuery(): string {
    return this.config.cwLogsInsightQuery;
  }
  
  /**
   * Athenaデータベース名を取得する
   */
  public getAthenaDatabase(): string | null {
    return this.config.athenaDatabase;
  }
  
  /**
   * Athenaクエリバケット名を取得する
   */
  public getAthenaQueryBucket(): string | null {
    return this.config.athenaQueryBucket;
  }
  
  /**
   * ALBアクセスログテーブル名を取得する
   */
  public getAlbAccessLogTable(): string | null {
    return this.config.albAccessLogTable;
  }
  
  /**
   * CloudTrailログテーブル名を取得する
   */
  public getCloudTrailLogTable(): string | null {
    return this.config.cloudTrailLogTable;
  }
  
  /**
   * X-Rayトレースが有効かどうかを取得する
   */
  public isXrayTraceEnabled(): boolean {
    return this.config.xrayTraceEnabled;
  }
  
  /**
   * Knowledge Baseが有効かどうかを取得する
   */
  public isKnowledgeBaseEnabled(): boolean {
    return this.config.knowledgeBaseEnabled;
  }
  
  /**
   * Knowledge Base IDを取得する
   */
  public getKnowledgeBaseId(): string | null {
    return this.config.knowledgeBaseId;
  }
  
  /**
   * 再ランキングモデルIDを取得する
   */
  public getRerankModelId(): string | null {
    return this.config.rerankModelId;
  }
  
  /**
   * Slackアプリトークンキーを取得する
   */
  public getSlackAppTokenKey(): string {
    return this.config.slackAppTokenKey;
  }
  
  /**
   * Slack署名シークレットキーを取得する
   */
  public getSlackSigningSecretKey(): string | null {
    return this.config.slackSigningSecretKey;
  }
  
  /**
   * アーキテクチャ説明を取得する
   */
  public getArchitectureDescription(): string {
    return this.config.architectureDescription;
  }
  
  /**
   * AWSリージョンを取得する
   */
  public getRegion(): string {
    return this.config.region;
  }
  
  /**
   * Lambda関数名を取得する
   */
  public getLambdaFunctionName(): string | null {
    return this.config.lambdaFunctionName;
  }
  
  /**
   * Lambda関数名を取得する（getFunctionNameはgetLambdaFunctionNameのエイリアス）
   */
  public getFunctionName(): string | null {
    return this.getLambdaFunctionName();
  }
  
  /**
   * Metrics Insight Lambda関数名を取得する
   */
  public getMetricsInsightName(): string | null {
    return this.config.metricsInsightName;
  }
  
  /**
   * Findings Report Lambda関数名を取得する
   */
  public getFindingsReportName(): string | null {
    return this.config.findingsReportName;
  }
  
  /**
   * GuardDutyのDetector IDを取得する
   */
  public getDetectorId(): string | null {
    return this.config.detectorId;
  }
}
