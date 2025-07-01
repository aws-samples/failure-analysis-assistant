import { MessageDestination } from '../../interfaces/message-destination.interface.js';

/**
 * Message destination class for Slack
 * Manages channel ID and thread timestamp
 */
export class SlackDestination implements MessageDestination {
  /** Slack channel ID */
  private readonly channelId: string;
  
  /** Thread timestamp (optional) */
  private readonly threadTs?: string;
  
  /**
   * Constructor
   * @param channelId Slack channel ID
   * @param threadTs Thread timestamp (optional)
   */
  constructor(channelId: string, threadTs?: string) {
    this.channelId = channelId;
    this.threadTs = threadTs;
  }
  
  /**
   * Get unique identifier for the destination
   * @returns String identifying the destination
   */
  getIdentifier(): string {
    return this.threadTs 
      ? `slack:${this.channelId}:thread:${this.threadTs}` 
      : `slack:${this.channelId}`;
  }
  
  /**
   * Get Slack channel ID
   * @returns Slack channel ID
   */
  getChannelId(): string {
    return this.channelId;
  }
  
  /**
   * Get thread timestamp
   * @returns Thread timestamp (if exists)
   */
  getThreadTs(): string | undefined {
    return this.threadTs;
  }
}
