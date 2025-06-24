import { ITemplateProvider, LogParams, MessageTemplate, FormTemplate, RetrieveResultItem } from '../interfaces/template-provider.interface.js';
import { I18nProvider } from '../providers/i18n-provider.js';
import { ConfigProvider } from '../providers/config-provider.js';

/**
 * 抽象テンプレートプロバイダークラス
 * テンプレート生成の基本実装を提供する
 */
export abstract class AbstractTemplateProvider implements ITemplateProvider {
  /** 国際化プロバイダー */
  protected readonly i18n: I18nProvider;
  
  /** 設定プロバイダー */
  protected readonly config: ConfigProvider;
  
  /**
   * コンストラクタ
   * @param i18n 国際化プロバイダー
   * @param config 設定プロバイダー
   */
  constructor(i18n: I18nProvider, config: ConfigProvider) {
    this.i18n = i18n;
    this.config = config;
  }
  
  /**
   * ログ取得方法の説明テキストを生成する
   * @param params ログパラメータ
   * @returns マークダウン形式のテキスト
   */
  createHowToGetLogs(params: LogParams): string {
    // 基本構造を作成
    const baseTemplate = this.createBaseLogTemplate(params);
    
    // 各ログタイプ別のセクションを追加
    let template = baseTemplate;
    
    if (params.albQuery) {
      template += this.createAlbLogSection(params.albQuery);
    }
    
    if (params.trailQuery) {
      template += this.createTrailLogSection(params.trailQuery);
    }
    
    // メトリクスセクションを追加
    template += this.createMetricsSection(params.cwMetricQuery, params.startDate, params.endDate);
    
    // X-rayセクションを条件付きで追加
    if (params.xrayTraces) {
      template += this.createXraySection(params.startDate, params.endDate);
    }
    
    return template;
  }
  
  /**
   * フォームテンプレートを生成する
   * @param date 初期日付
   * @param time 初期時刻
   * @returns フォームテンプレート
   */
  abstract createFormTemplate(date: string, time: string): FormTemplate;
  
  /**
   * コマンド実行フォームテンプレートを生成する
   * @returns フォームテンプレート
   */
  abstract createCommandFormTemplate(): FormTemplate;
  
  /**
   * メッセージテンプレートを生成する
   * @param message メッセージテキスト
   * @returns メッセージテンプレート
   */
  abstract createMessageTemplate(message: string): MessageTemplate;
  
  /**
   * エラーメッセージテンプレートを生成する
   * @returns エラーメッセージテンプレート
   */
  abstract createErrorMessageTemplate(): MessageTemplate;
  
  /**
   * 検索結果メッセージテンプレートを生成する
   * @param retrieveResults 検索結果アイテムの配列
   * @returns 検索結果メッセージテンプレート
   */
  abstract createRetrieveResultTemplate(retrieveResults: RetrieveResultItem[]): MessageTemplate;
  
  /**
   * ログテンプレートの基本部分を生成する
   * @param params ログパラメータ
   * @returns マークダウン形式のテキスト
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
   * ALBログセクションを生成する
   * @param albQuery ALBクエリ
   * @returns マークダウン形式のテキスト
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
   * CloudTrailログセクションを生成する
   * @param trailQuery CloudTrailクエリ
   * @returns マークダウン形式のテキスト
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
   * メトリクスセクションを生成する
   * @param cwMetricQuery CloudWatchメトリクスクエリ
   * @param startDate 開始日
   * @param endDate 終了日
   * @returns マークダウン形式のテキスト
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
   * X-rayセクションを生成する
   * @param startDate 開始日
   * @param endDate 終了日
   * @returns マークダウン形式のテキスト
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
