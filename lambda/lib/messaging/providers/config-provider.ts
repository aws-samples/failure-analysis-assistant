/**
 * 設定プロバイダークラス
 * 環境変数やアプリケーション設定へのアクセスを抽象化する
 */
export class ConfigProvider {
  /** 設定データ */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly config: Record<string, any>;
  
  /**
   * コンストラクタ
   * @param config 初期設定（オプション）
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(config?: Record<string, any>) {
    this.config = config || {};
  }
  
  /**
   * 指定されたキーに対応する設定値を取得する
   * 環境変数 > 設定オブジェクト > デフォルト値 の優先順位で値を取得
   * 
   * @param key 設定キー
   * @param defaultValue デフォルト値（オプション）
   * @returns 設定値
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(key: string, defaultValue?: any): any {
    return process.env[key] || this.config[key] || defaultValue;
  }
  
  /**
   * Athenaデータベース名を取得する
   * @returns Athenaデータベース名
   */
  getAthenaDatabase(): string {
    return this.get("ATHENA_DATABASE_NAME", "default_database");
  }
  
  /**
   * デフォルトのSlackチャンネルIDを取得する
   * @returns SlackチャンネルID
   */
  getDefaultSlackChannel(): string {
    return this.get("DEFAULT_SLACK_CHANNEL", "general");
  }
  
  /**
   * ログ取得のデフォルト期間（日数）を取得する
   * @returns デフォルト期間（日数）
   */
  getDefaultLogPeriodDays(): number {
    return parseInt(this.get("DEFAULT_LOG_PERIOD_DAYS", "7"), 10);
  }
}
