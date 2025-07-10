/**
 * Abstract interface representing message destination
 * Abstracts destination information specific to each messaging platform
 */
export interface MessageDestination {
  /**
   * Get unique identifier for the destination
   * @returns String identifying the destination
   */
  getIdentifier(): string;
}
