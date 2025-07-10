/**
 * Configuration provider class
 * Abstracts access to environment variables and application settings
 */
export class ConfigProvider {
  /** Configuration data */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly config: Record<string, any>;
  
  /**
   * Constructor
   * @param config Initial configuration (optional)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(config?: Record<string, any>) {
    this.config = config || {};
  }
  
  /**
   * Get configuration value for the specified key
   * Retrieves value with priority: environment variable > configuration object > default value
   * 
   * @param key Configuration key
   * @param defaultValue Default value (optional)
   * @returns Configuration value
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(key: string, defaultValue?: any): any {
    return process.env[key] || this.config[key] || defaultValue;
  }
  
  /**
   * Get Athena database name
   * @returns Athena database name
   */
  getAthenaDatabase(): string {
    return this.get("ATHENA_DATABASE_NAME", "default_database");
  }
  
  /**
   * Get default Slack channel ID
   * @returns Slack channel ID
   */
  getDefaultSlackChannel(): string {
    return this.get("DEFAULT_SLACK_CHANNEL", "general");
  }
  
  /**
   * Get default log retrieval period (days)
   * @returns Default period (days)
   */
  getDefaultLogPeriodDays(): number {
    return parseInt(this.get("DEFAULT_LOG_PERIOD_DAYS", "7"), 10);
  }
}
