/**
 * Style for rich text elements
 */
export interface RichTextStyle {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
}

/**
 * Basic structure for rich text elements
 */
export interface RichTextElement {
  type: string;
  text?: string;
  url?: string;
  name?: string;
  style?: string | RichTextStyle;
  elements?: RichTextElement[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Basic structure for message blocks
 */
export interface MessageBlock {
  type: string;
  text?: string;
  elements?: RichTextElement[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Basic structure for message templates
 */
export interface MessageTemplate {
  blocks: MessageBlock[];
}

/**
 * Structure for form templates
 */
export interface FormTemplate extends MessageTemplate {
  title?: string;
  submitLabel?: string;
  callbackId?: string;
}

/**
 * Structure for search result items
 */
export interface RetrieveResultItem {
  index: number;
  text: string;
  source: string;
  score: number;
}

/**
 * Structure for log parameters
 */
export interface LogParams {
  startDate: string;
  endDate: string;
  logGroups: string[];
  cwLogsQuery: string;
  cwMetricQuery: string;
  xrayTraces: boolean;
  albQuery?: string;
  trailQuery?: string;
}

/**
 * Abstract interface for template provider
 * Generates various message templates
 */
export interface ITemplateProvider {
  /**
   * Generate explanatory text for log retrieval method
   * @param params Log parameters
   * @returns Markdown formatted text
   */
  createHowToGetLogs(params: LogParams): string;
  
  /**
   * Generate form template
   * @param date Initial date
   * @param time Initial time
   * @returns Form template
   */
  createFormTemplate(date: string, time: string): FormTemplate;
  
  /**
   * Generate command execution form template
   * @returns Form template
   */
  createCommandFormTemplate(): FormTemplate;
  
  /**
   * Generate message template
   * @param message Message text
   * @returns Message template
   */
  createMessageTemplate(message: string): MessageTemplate;
  
  /**
   * Generate error message template
   * @returns Error message template
   */
  createErrorMessageTemplate(): MessageTemplate;
  
  /**
   * Generate search result message template
   * @param retrieveResults Array of search result items
   * @returns Search result message template
   */
  createRetrieveResultTemplate(retrieveResults: RetrieveResultItem[]): MessageTemplate;
}
