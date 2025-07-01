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
 * Facade class for message client
 * Provides access to various messaging platforms
 */
export class MessageClient {
  /** Message client */
  private readonly client: IMessageClient;
  
  /** Template provider */
  private readonly templateProvider: ITemplateProvider;
  
  /** Internationalization provider */
  private readonly i18n: I18nProvider;
  
  /** Configuration provider */
  private readonly config: ConfigProvider;
  
  /**
   * Constructor
   * @param token API token
   * @param language Language setting (default is English)
   * @param platform Platform (default is Slack)
   * @param logger Logger
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
   * Send message
   * @param message Message content
   * @param channelId Channel ID
   * @param threadTs Thread timestamp (optional)
   * @returns Promise representing the result of the send operation
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
   * Send markdown snippet
   * @param filename Filename
   * @param markdownText Markdown formatted text
   * @param channelId Channel ID
   * @param threadTs Thread timestamp (optional)
   * @returns Promise representing the result of the send operation
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
   * Send file
   * @param file File content
   * @param filename Filename
   * @param channelId Channel ID
   * @param threadTs Thread timestamp (optional)
   * @returns Promise representing the result of the send operation
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
   * Generate explanatory text for log retrieval method
   * @param startDate Start date
   * @param endDate End date
   * @param logGroups Array of log groups
   * @param cwLogsQuery CloudWatch logs query
   * @param cwMetricQuery CloudWatch metrics query
   * @param xrayTraces Whether to include X-ray trace information
   * @param albQuery ALB query (optional)
   * @param trailQuery CloudTrail query (optional)
   * @returns Markdown formatted text
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
   * Generate form block
   * @param date Initial date
   * @param time Initial time
   * @returns Array of blocks
   */
  createFormBlock(date: string, time: string): KnownBlock[] {
    if (this.client instanceof SlackMessageClient) {
      return (this.client as SlackMessageClient).createFormBlock(date, time);
    }
    throw new Error("Current client does not support blocks");
  }
  
  /**
   * Generate command execution form view
   * @returns View
   */
  createInsightCommandFormView(): View {
    if (this.client instanceof SlackMessageClient) {
      return (this.client as SlackMessageClient).createInsightCommandFormView();
    }
    throw new Error("Current client does not support views");
  }
  
  /**
   * Generate message block
   * @param message Message text
   * @returns Array of blocks
   */
  createMessageBlock(message: string): KnownBlock[] {
    if (this.client instanceof SlackMessageClient) {
      return (this.client as SlackMessageClient).createMessageBlock(message);
    }
    throw new Error("Current client does not support blocks");
  }
  
  /**
   * Generate error message block
   * @returns Array of blocks
   */
  createErrorMessageBlock(): KnownBlock[] {
    if (this.client instanceof SlackMessageClient) {
      return (this.client as SlackMessageClient).createErrorMessageBlock();
    }
    throw new Error("Current client does not support blocks");
  }
  
  /**
   * Generate search result message block
   * @param retrieveResults Array of search result items
   * @returns Array of blocks
   */
  createRetrieveResultMessage(retrieveResults: RetrieveResultItem[]): KnownBlock[] {
    if (this.client instanceof SlackMessageClient) {
      return (this.client as SlackMessageClient).createRetrieveResultMessage(retrieveResults);
    }
    throw new Error("Current client does not support blocks");
  }
  
  /**
   * Get current language setting
   * @returns Language setting
   */
  getLanguage(): Language {
    return this.i18n.getLanguage();
  }
}
