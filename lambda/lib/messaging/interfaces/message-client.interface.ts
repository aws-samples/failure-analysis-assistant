import { MessageDestination } from './message-destination.interface.js';

/**
 * メッセージの内容を表す型
 * 文字列またはプラットフォーム固有のメッセージブロック
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MessageContent = any;

/**
 * ファイルの内容を表す型
 */
export type FileContent = Uint8Array | Buffer | string;

/**
 * メッセージクライアントの抽象インターフェース
 * 各メッセージングプラットフォーム向けの実装の基底インターフェース
 */
export interface IMessageClient {
  /**
   * メッセージを送信する
   * @param message メッセージの内容
   * @param destination メッセージの宛先
   * @returns 送信処理の結果を表すPromise
   */
  sendMessage(message: MessageContent, destination: MessageDestination): Promise<void>;
  
  /**
   * マークダウン形式のコンテンツを送信する
   * @param filename ファイル名
   * @param markdownText マークダウン形式のテキスト
   * @param destination メッセージの宛先
   * @returns 送信処理の結果を表すPromise
   */
  sendMarkdownContent(filename: string, markdownText: string, destination: MessageDestination): Promise<void>;
  
  /**
   * ファイルを送信する
   * @param file ファイルの内容
   * @param filename ファイル名
   * @param destination メッセージの宛先
   * @returns 送信処理の結果を表すPromise
   */
  sendFile(file: FileContent, filename: string, destination: MessageDestination): Promise<void>;
}
