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
 * Message client for Slack
 * Sends messages using Slack API
 */
export class SlackMessageClient implements IMessageClient {
  /** Slack Web API client */
  private readonly slackClient: WebClient;
  
  /** Internationalization provider */
  private readonly i18n: I18nProvider;
  
  /** Logger */
  private readonly logger: Logger;
  
  /** Template provider */
  private readonly templateProvider: ITemplateProvider;
  
  /** Template converter */
  private readonly templateConverter: SlackTemplateConverter;
  
  /**
   * Constructor
   * @param token Slack API token
   * @param i18n Internationalization provider
   * @param logger Logger
   * @param config Configuration provider
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
   * Send message
   * @param message Message content
   * @param destination Message destination
   * @returns Promise representing the result of the send operation
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
        await this.slackClient.chat.postMessage({
          channel: channelId,
          text: this.i18n.translate("defaultMessageText"),
          blocks: message as KnownBlock[],
          ...(threadTs && { thread_ts: threadTs })
        });
      } else {
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
   * Send markdown content
   * @param filename Filename
   * @param markdownText Markdown formatted text
   * @param destination Message destination
   * @returns Promise representing the result of the send operation
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
   * Send file
   * @param file File content
   * @param filename Filename
   * @param destination Message destination
   * @returns Promise representing the result of the send operation
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
   * Generate form block
   * @param date Initial date
   * @param time Initial time
   * @returns Array of Slack blocks
   */
  createFormBlock(date: string, time: string): KnownBlock[] {
    const template = this.templateProvider.createFormTemplate(date, time);
    return this.templateConverter.convertMessageTemplate(template);
  }
  
  /**
   * Generate command execution form view
   * @returns Slack view
   */
  createInsightCommandFormView(): View {
    const template = this.templateProvider.createCommandFormTemplate();
    return this.templateConverter.convertFormTemplate(template);
  }
  
  /**
   * Generate message block
   * @param message Message text
   * @returns Array of Slack blocks
   */
  createMessageBlock(message: string): KnownBlock[] {
    const template = this.templateProvider.createMessageTemplate(message);
    return this.templateConverter.convertMessageTemplate(template);
  }
  
  /**
   * Generate error message block
   * @returns Array of Slack blocks
   */
  createErrorMessageBlock(): KnownBlock[] {
    const template = this.templateProvider.createErrorMessageTemplate();
    return this.templateConverter.convertMessageTemplate(template);
  }
  
  /**
   * Generate search result message block
   * @param retrieveResults Array of search result items
   * @returns Array of Slack blocks
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createRetrieveResultMessage(retrieveResults: any[]): KnownBlock[] {
    const template = this.templateProvider.createRetrieveResultTemplate(retrieveResults);
    return this.templateConverter.convertMessageTemplate(template);
  }
  
  /**
   * Handle error
   * @param error Error object
   * @param channelId Slack channel ID
   * @param threadTs Thread timestamp (optional)
   * @returns Promise representing the result of error handling
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
      // Prevent further recursion
    }
  }
}
