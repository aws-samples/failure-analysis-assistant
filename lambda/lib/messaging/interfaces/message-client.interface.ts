import { MessageDestination } from './message-destination.interface.js';

/**
 * Type representing message content
 * String or platform-specific message blocks
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MessageContent = any;

/**
 * Type representing file content
 */
export type FileContent = Uint8Array | Buffer | string;

/**
 * Abstract interface for message client
 * Base interface for implementations targeting various messaging platforms
 */
export interface IMessageClient {
  /**
   * Send message
   * @param message Message content
   * @param destination Message destination
   * @returns Promise representing the result of the send operation
   */
  sendMessage(message: MessageContent, destination: MessageDestination): Promise<void>;
  
  /**
   * Send markdown content
   * @param filename Filename
   * @param markdownText Markdown formatted text
   * @param destination Message destination
   * @returns Promise representing the result of the send operation
   */
  sendMarkdownContent(filename: string, markdownText: string, destination: MessageDestination): Promise<void>;
  
  /**
   * Send file
   * @param file File content
   * @param filename Filename
   * @param destination Message destination
   * @returns Promise representing the result of the send operation
   */
  sendFile(file: FileContent, filename: string, destination: MessageDestination): Promise<void>;
}
