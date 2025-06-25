import { WebClient } from "@slack/web-api";
import { KnownBlock, View } from "@slack/types";
import { IMessageClient, MessageContent, FileContent } from '../../interfaces/message-client.interface.js';
import { MessageDestination } from '../../interfaces/message-destination.interface.js';
import { SlackDestination } from './slack-destination.js';
import { I18nProvider } from '../../providers/i18n-provider.js';
import { SlackTemplateConverter } from './slack-template-converter.js';
import { ITemplateProvider } from '../../interfaces/template-provider.interface.js';
import { GenericTemplateProvider } from '../../templates/generic-template-provider.js';
import { ConfigProvider } from '../../providers/config-provider.js';
import { Logger } from "@aws-lambda-powertools/logger";
import { logger as defaultLogger } from '../../../logger.js';

/**
 * Slack向けのメッセージクライアント
 * Slack APIを使用してメッセージを送信する
 */
export class SlackMessageClient implements IMessageClient {
  /** Slack Web API クライアント */
  private readonly slackClient: WebClient;
  
  /** 国際化プロバイダー */
  private readonly i18n: I18nProvider;
  
  /** ロガー */
  private readonly logger: Logger;
  
  /** テンプレートプロバイダー */
  private readonly templateProvider: ITemplateProvider;
  
  /** テンプレートコンバーター */
  private readonly templateConverter: SlackTemplateConverter;
  
  /**
   * コンストラクタ
   * @param token Slack API トークン
   * @param i18n 国際化プロバイダー
   * @param logger ロガー
   * @param config 設定プロバイダー
   */
  constructor(
    token: string,
    i18n: I18nProvider,
    logger: Logger = defaultLogger,
    config: ConfigProvider = new ConfigProvider()
  ) {
    this.slackClient = new WebClient(token);
    this.i18n = i18n;
    this.logger = logger;
    this.templateProvider = new GenericTemplateProvider(i18n, config);
    this.templateConverter = new SlackTemplateConverter();
  }
  
  /**
   * メッセージを送信する
   * @param message メッセージの内容
   * @param destination メッセージの宛先
   * @returns 送信処理の結果を表すPromise
   */
  async sendMessage(message: MessageContent, destination: MessageDestination): Promise<void> {
    if (!(destination instanceof SlackDestination)) {
      throw new Error("SlackMessageClient requires SlackDestination");
    }
    
    const slackDest = destination as SlackDestination;
    const channelId = slackDest.getChannelId();
    const threadTs = slackDest.getThreadTs();
    
    try {
      if (typeof message === "string") {
        await this.slackClient.chat.postMessage({
          channel: channelId,
          text: message,
          ...(threadTs && { thread_ts: threadTs })
        });
      } else if (Array.isArray(message)) {
        // KnownBlock[] として処理
        await this.slackClient.chat.postMessage({
          channel: channelId,
          text: this.i18n.translate("defaultMessageText"),
          blocks: message as KnownBlock[],
          ...(threadTs && { thread_ts: threadTs })
        });
      } else {
        // その他のオブジェクトはJSON文字列に変換
        await this.slackClient.chat.postMessage({
          channel: channelId,
          text: JSON.stringify(message),
          ...(threadTs && { thread_ts: threadTs })
        });
      }
    } catch (error) {
      await this.handleError(error, channelId, threadTs);
    }
  }
  
  /**
   * マークダウン形式のコンテンツを送信する
   * @param filename ファイル名
   * @param markdownText マークダウン形式のテキスト
   * @param destination メッセージの宛先
   * @returns 送信処理の結果を表すPromise
   */
  async sendMarkdownContent(filename: string, markdownText: string, destination: MessageDestination): Promise<void> {
    if (!(destination instanceof SlackDestination)) {
      throw new Error("SlackMessageClient requires SlackDestination");
    }
    
    const slackDest = destination as SlackDestination;
    const channelId = slackDest.getChannelId();
    const threadTs = slackDest.getThreadTs();
    
    try {
      const params = {
        channel_id: channelId,
        filename,
        content: markdownText,
        snippet_type: 'markdown' as const,
        ...(threadTs ? { thread_ts: threadTs } : { thread_ts: ""})
      };
      
      await this.slackClient.filesUploadV2(params);
    } catch (error) {
      await this.handleError(error, channelId, threadTs);
    }
  }
  
  /**
   * ファイルを送信する
   * @param file ファイルの内容
   * @param filename ファイル名
   * @param destination メッセージの宛先
   * @returns 送信処理の結果を表すPromise
   */
  async sendFile(file: FileContent, filename: string, destination: MessageDestination): Promise<void> {
    if (!(destination instanceof SlackDestination)) {
      throw new Error("SlackMessageClient requires SlackDestination");
    }
    
    const slackDest = destination as SlackDestination;
    const channelId = slackDest.getChannelId();
    const threadTs = slackDest.getThreadTs();
    
    try {
      const params = {
        channel_id: channelId,
        file: Buffer.from(file),
        filename,
        initial_comment: this.i18n.translate("uploadedFile"),
        ...(threadTs ? { thread_ts: threadTs } : { thread_ts: ""})
      };
      
      const uploadedFile = await this.slackClient.filesUploadV2(params);
      this.logger.info('Uploaded file', {uploadFile: JSON.stringify(uploadedFile.files.at(0)?.files?.at(0))});
    } catch (error) {
      await this.handleError(error, channelId, threadTs);
    }
  }
  
  /**
   * フォームブロックを生成する
   * @param date 初期日付
   * @param time 初期時刻
   * @returns Slackブロックの配列
   */
  createFormBlock(date: string, time: string): KnownBlock[] {
    const template = this.templateProvider.createFormTemplate(date, time);
    return this.templateConverter.convertMessageTemplate(template);
  }
  
  /**
   * コマンド実行フォームビューを生成する
   * @returns Slackビュー
   */
  createInsightCommandFormView(): View {
    const template = this.templateProvider.createCommandFormTemplate();
    return this.templateConverter.convertFormTemplate(template);
  }
  
  /**
   * メッセージブロックを生成する
   * @param message メッセージテキスト
   * @returns Slackブロックの配列
   */
  createMessageBlock(message: string): KnownBlock[] {
    const template = this.templateProvider.createMessageTemplate(message);
    return this.templateConverter.convertMessageTemplate(template);
  }
  
  /**
   * エラーメッセージブロックを生成する
   * @returns Slackブロックの配列
   */
  createErrorMessageBlock(): KnownBlock[] {
    const template = this.templateProvider.createErrorMessageTemplate();
    return this.templateConverter.convertMessageTemplate(template);
  }
  
  /**
   * 検索結果メッセージブロックを生成する
   * @param retrieveResults 検索結果アイテムの配列
   * @returns Slackブロックの配列
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createRetrieveResultMessage(retrieveResults: any[]): KnownBlock[] {
    const template = this.templateProvider.createRetrieveResultTemplate(retrieveResults);
    return this.templateConverter.convertMessageTemplate(template);
  }
  
  /**
   * エラーを処理する
   * @param error エラーオブジェクト
   * @param channelId Slackチャンネル ID
   * @param threadTs スレッドタイムスタンプ（オプション）
   * @returns エラー処理の結果を表すPromise
   */
  private async handleError(error: unknown, channelId: string, threadTs?: string): Promise<void> {
    this.logger.error("Slack API call failed", error instanceof Error ? error : new Error(String(error)));
    try {
      await this.slackClient.chat.postMessage({
        channel: channelId,
        text: this.i18n.translate("errorMessage"),
        ...(threadTs && { thread_ts: threadTs })
      });
    } catch (secondaryError) {
      this.logger.error("Failed to send error message", 
        secondaryError instanceof Error ? secondaryError : new Error(String(secondaryError)));
      // これ以上の再帰を防ぐ
    }
  }
}
