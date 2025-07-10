import { ITemplateProvider, LogParams, MessageTemplate, FormTemplate, RetrieveResultItem } from '../interfaces/template-provider.interface.js';
import { I18nProvider } from '../providers/i18n-provider.js';
import { ConfigProvider } from '../providers/config-provider.js';

/**
 * Abstract template provider class
 * Provides basic implementation for template generation
 */
export abstract class AbstractTemplateProvider implements ITemplateProvider {
  /** Internationalization provider */
  protected readonly i18n: I18nProvider;
  
  /** Configuration provider */
  protected readonly config: ConfigProvider;
  
  /**
   * Constructor
   * @param i18n Internationalization provider
   * @param config Configuration provider
   */
  constructor(i18n: I18nProvider, config: ConfigProvider) {
    this.i18n = i18n;
    this.config = config;
  }
  
  /**
   * Generate explanatory text for log retrieval method
   * @param params Log parameters
   * @returns Markdown formatted text
   */
  createHowToGetLogs(params: LogParams): string {
    const baseTemplate = this.createBaseLogTemplate(params);
    
    let template = baseTemplate;
    
    if (params.albQuery) {
      template += this.createAlbLogSection(params.albQuery);
    }
    
    if (params.trailQuery) {
      template += this.createTrailLogSection(params.trailQuery);
    }
    
    template += this.createMetricsSection(params.cwMetricQuery, params.startDate, params.endDate);
    
    if (params.xrayTraces) {
      template += this.createXraySection(params.startDate, params.endDate);
    }
    
    return template;
  }
  
  /**
   * Generate form template
   * @param date Initial date
   * @param time Initial time
   * @returns Form template
   */
  abstract createFormTemplate(date: string, time: string): FormTemplate;
  
  /**
   * Generate command execution form template
   * @returns Form template
   */
  abstract createCommandFormTemplate(): FormTemplate;
  
  /**
   * Generate message template
   * @param message Message text
   * @returns Message template
   */
  abstract createMessageTemplate(message: string): MessageTemplate;
  
  /**
   * Generate error message template
   * @returns Error message template
   */
  abstract createErrorMessageTemplate(): MessageTemplate;
  
  /**
   * Generate search result message template
   * @param retrieveResults Array of search result items
   * @returns Search result message template
   */
  abstract createRetrieveResultTemplate(retrieveResults: RetrieveResultItem[]): MessageTemplate;
  
  /**
   * Generate basic part of log template
   * @param params Log parameters
   * @returns Markdown formatted text
   */
  protected createBaseLogTemplate(params: LogParams): string {
    const language = this.i18n.getLanguage();
    const title = this.i18n.translate("howToGetLogsTitle");
    
    let template = `
# ${title}

`;

    if (language === "ja") {
      template += `参考にしたログは、それぞれ以下の手順とクエリで取得可能です。\n\n`;
    } else {
      template += `You can get the logs that LLM refered followed ways.\n\n`;
    }

    // CloudWatch Logsセクション
    template += language === "ja"
      ? `## CloudWatch Logs

CloudWatch Logs Insightのコンソールにて、対象ロググループを指定し、時間範囲を \`${params.startDate}\` から \`${params.endDate}\` と設定した上で、クエリを実行してください。\n

### 対象ロググループ

\`\`\`${params.logGroups.join(", ")}\`\`\`

### クエリ

\`\`\`${params.cwLogsQuery}\`\`\`

`
      : `## CloudWatch Logs

CloudWatch Logs Insight Console, you choose target log groups and set time range like from \`${params.startDate}\` to \`${params.endDate}\`. Finally, you run query as below:\n

### Target log groups

\`\`\`${params.logGroups.join(", ")}\`\`\`

### Query

\`\`\`${params.cwLogsQuery}\`\`\`
`;

    return template;
  }
  
  /**
   * Generate ALB log section
   * @param albQuery ALB query
   * @returns Markdown formatted text
   */
  protected createAlbLogSection(albQuery: string): string {
    const language = this.i18n.getLanguage();
    const athenaDatabase = this.config.getAthenaDatabase();
    
    return language === "ja"
      ? `## ALB

Athenaのコンソールで、 \`${athenaDatabase}\` のデータベースに対し、クエリを実行してください。\n

### クエリ

\`\`\`${albQuery} \`\`\`

`
      : `## ALB

In Athena's management console, You run the query to \`${athenaDatabase}\` database.\n

### Query

\`\`\`${albQuery} \`\`\`

`;
  }
  
  /**
   * Generate CloudTrail log section
   * @param trailQuery CloudTrail query
   * @returns Markdown formatted text
   */
  protected createTrailLogSection(trailQuery: string): string {
    const language = this.i18n.getLanguage();
    const athenaDatabase = this.config.getAthenaDatabase();
    
    return language === "ja"
      ? `## CloudTrail

Athenaのコンソールで、 \`${athenaDatabase}\` のデータベースに対し、クエリを実行してください。

### クエリ

\`\`\`${trailQuery}\`\`\`

`
      : `## CloudTrail

In Athena's management console, You run the query to \`${athenaDatabase}\` database.\n

### Query

\`\`\`${trailQuery}\`\`\`

`;
  }
  
  /**
   * Generate metrics section
   * @param cwMetricQuery CloudWatch metrics query
   * @param startDate Start date
   * @param endDate End date
   * @returns Markdown formatted text
   */
  protected createMetricsSection(cwMetricQuery: string, startDate: string, endDate: string): string {
    const language = this.i18n.getLanguage();
    
    return language === "ja"
      ? `## CloudWatchのメトリクス

次のクエリをローカル環境にJSON形式で保存し、CLIでコマンドを実行してください。

### クエリ

\`\`\`${cwMetricQuery}\`\`\`

### コマンド

\`\`\`aws cloudwatch get-metric-data --metric-data-queries file://{path-to-file/name-you-saved.json} --start-time ${startDate} --end-time ${endDate} --profile {your-profile-name} \`\`\`

`
      : `## CloudWatch Metrics

You should save below query as JSON file to your local environment and run the command.

### Query

\`\`\`${typeof cwMetricQuery === 'string' ? cwMetricQuery : JSON.stringify(cwMetricQuery)}\`\`\`
  
### Command

\`\`\`aws cloudwatch get-metric-data --metric-data-queries file://{path-to-file/name-you-saved.json} --start-time ${startDate} --end-time ${endDate} --profile {your-profile-name} \`\`\`

`;
  }
  
  /**
   * Generate X-ray section
   * @param startDate Start date
   * @param endDate End date
   * @returns Markdown formatted text
   */
  protected createXraySection(startDate: string, endDate: string): string {
    const language = this.i18n.getLanguage();
    
    return language === "ja"
      ? `## X-rayのトレース情報

X-rayのコンソールで、時間範囲を \`${startDate}\` から \`${endDate}\` に指定してください。`
      : `## X-ray Traces

X-ray's management console, please set data range like from \`${startDate}\` to \`${endDate}\` .`;
  }
}
