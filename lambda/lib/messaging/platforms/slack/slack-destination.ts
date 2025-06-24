import { MessageDestination } from '../../interfaces/message-destination.interface.js';

/**
 * Slack向けのメッセージ宛先クラス
 * チャンネルIDとスレッドタイムスタンプを管理する
 */
export class SlackDestination implements MessageDestination {
  /** Slackチャンネル ID */
  private readonly channelId: string;
  
  /** スレッドタイムスタンプ（オプション） */
  private readonly threadTs?: string;
  
  /**
   * コンストラクタ
   * @param channelId Slackチャンネル ID
   * @param threadTs スレッドタイムスタンプ（オプション）
   */
  constructor(channelId: string, threadTs?: string) {
    this.channelId = channelId;
    this.threadTs = threadTs;
  }
  
  /**
   * 宛先の一意の識別子を取得する
   * @returns 宛先を識別する文字列
   */
  getIdentifier(): string {
    return this.threadTs 
      ? `slack:${this.channelId}:thread:${this.threadTs}` 
      : `slack:${this.channelId}`;
  }
  
  /**
   * Slackチャンネル IDを取得する
   * @returns Slackチャンネル ID
   */
  getChannelId(): string {
    return this.channelId;
  }
  
  /**
   * スレッドタイムスタンプを取得する
   * @returns スレッドタイムスタンプ（存在する場合）
   */
  getThreadTs(): string | undefined {
    return this.threadTs;
  }
}
