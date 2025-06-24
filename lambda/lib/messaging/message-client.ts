import { KnownBlock, View } from "@slack/types";
import { I18nProvider, Language } from './providers/i18n-provider.js';
import { ConfigProvider } from './providers/config-provider.js';
import { IMessageClient, FileContent } from './interfaces/message-client.interface.js';
import { SlackMessageClient } from './platforms/slack/slack-message-client.js';
import { SlackDestination } from './platforms/slack/slack-destination.js';
import { ITemplateProvider } from './interfaces/template-provider.interface.js';
import { GenericTemplateProvider } from './templates/generic-template-provider.js';
import { RetrieveResultItem } from './interfaces/template-provider.interface.js';
import { logger as defaultLogger } from '../logger.js';
import { Logger } from "@aws-lambda-powertools/logger";

/**
 * メッセージクライアントのファサードクラス
 * 各種メッセージングプラットフォームへのアクセスを提供する
 */
export class MessageClient {
  /** メッセージクライアント */
  private readonly client: IMessageClient;
  
  /** テンプレートプロバイダー */
  private readonly templateProvider: ITemplateProvider;
  
  /** 国際化プロバイダー */
  private readonly i18n: I18nProvider;
  
  /** 設定プロバイダー */
  private readonly config: ConfigProvider;
  
  /**
   * コンストラクタ
   * @param token API トークン
   * @param language 言語設定（デフォルトは英語）
   * @param platform プラットフォーム（デフォルトはSlack）
   * @param logger ロガー
   */
  constructor(
    token: string,
    language: Language = "en",
    platform: string = "slack",
    logger: Logger = defaultLogger
  ) {
    this.i18n = new I18nProvider(language);
    this.config = new ConfigProvider();
    this.templateProvider = new GenericTemplateProvider(this.i18n, this.config);
    
    switch (platform) {
      case "slack":
        this.client = new SlackMessageClient(token, this.i18n, logger, this.config);
        break;
      // 将来的に他のプラットフォームを追加する場合はここに追加
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }
  
  /**
   * メッセージを送信する
   * @param message メッセージの内容
   * @param channelId チャンネル ID
   * @param threadTs スレッドタイムスタンプ（オプション）
   * @returns 送信処理の結果を表すPromise
   */
  async sendMessage(
    message: KnownBlock[] | string,
    channelId: string,
    threadTs?: string
  ): Promise<void> {
    const destination = new SlackDestination(channelId, threadTs);
    return this.client.sendMessage(message, destination);
  }
  
  /**
   * マークダウン形式のスニペットを送信する
   * @param filename ファイル名
   * @param markdownText マークダウン形式のテキスト
   * @param channelId チャンネル ID
   * @param threadTs スレッドタイムスタンプ（オプション）
   * @returns 送信処理の結果を表すPromise
   */
  async sendMarkdownSnippet(
    filename: string,
    markdownText: string,
    channelId: string,
    threadTs?: string
  ): Promise<void> {
    const destination = new SlackDestination(channelId, threadTs);
    return this.client.sendMarkdownContent(filename, markdownText, destination);
  }
  
  /**
   * ファイルを送信する
   * @param file ファイルの内容
   * @param filename ファイル名
   * @param channelId チャンネル ID
   * @param threadTs スレッドタイムスタンプ（オプション）
   * @returns 送信処理の結果を表すPromise
   */
  async sendFile(
    file: FileContent,
    filename: string,
    channelId: string,
    threadTs?: string
  ): Promise<void> {
    const destination = new SlackDestination(channelId, threadTs);
    return this.client.sendFile(file, filename, destination);
  }
  
  /**
   * ログ取得方法の説明テキストを生成する
   * @param startDate 開始日
   * @param endDate 終了日
   * @param logGroups ロググループの配列
   * @param cwLogsQuery CloudWatchログクエリ
   * @param cwMetricQuery CloudWatchメトリクスクエリ
   * @param xrayTraces X-rayトレース情報を含めるかどうか
   * @param albQuery ALBクエリ（オプション）
   * @param trailQuery CloudTrailクエリ（オプション）
   * @returns マークダウン形式のテキスト
   */
  createHowToGetLogs(
    startDate: string,
    endDate: string,
    logGroups: string[],
    cwLogsQuery: string,
    cwMetricQuery: string,
    xrayTraces: boolean,
    albQuery?: string,
    trailQuery?: string,
  ): string {
    return this.templateProvider.createHowToGetLogs({
      startDate,
      endDate,
      logGroups,
      cwLogsQuery,
      cwMetricQuery,
      xrayTraces,
      albQuery,
      trailQuery
    });
  }
  
  /**
   * フォームブロックを生成する
   * @param date 初期日付
   * @param time 初期時刻
   * @returns ブロックの配列
   */
  createFormBlock(date: string, time: string): KnownBlock[] {
    if (this.client instanceof SlackMessageClient) {
      return (this.client as SlackMessageClient).createFormBlock(date, time);
    }
    throw new Error("Current client does not support blocks");
  }
  
  /**
   * コマンド実行フォームビューを生成する
   * @returns ビュー
   */
  createInsightCommandFormView(): View {
    if (this.client instanceof SlackMessageClient) {
      return (this.client as SlackMessageClient).createInsightCommandFormView();
    }
    throw new Error("Current client does not support views");
  }
  
  /**
   * メッセージブロックを生成する
   * @param message メッセージテキスト
   * @returns ブロックの配列
   */
  createMessageBlock(message: string): KnownBlock[] {
    if (this.client instanceof SlackMessageClient) {
      return (this.client as SlackMessageClient).createMessageBlock(message);
    }
    throw new Error("Current client does not support blocks");
  }
  
  /**
   * エラーメッセージブロックを生成する
   * @returns ブロックの配列
   */
  createErrorMessageBlock(): KnownBlock[] {
    if (this.client instanceof SlackMessageClient) {
      return (this.client as SlackMessageClient).createErrorMessageBlock();
    }
    throw new Error("Current client does not support blocks");
  }
  
  /**
   * 検索結果メッセージブロックを生成する
   * @param retrieveResults 検索結果アイテムの配列
   * @returns ブロックの配列
   */
  createRetrieveResultMessage(retrieveResults: RetrieveResultItem[]): KnownBlock[] {
    if (this.client instanceof SlackMessageClient) {
      return (this.client as SlackMessageClient).createRetrieveResultMessage(retrieveResults);
    }
    throw new Error("Current client does not support blocks");
  }
  
  /**
   * 現在の言語設定を取得する
   * @returns 言語設定
   */
  getLanguage(): Language {
    return this.i18n.getLanguage();
  }
}
