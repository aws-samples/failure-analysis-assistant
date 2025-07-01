/**
 * リッチテキスト要素のスタイル
 */
export interface RichTextStyle {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
}

/**
 * リッチテキスト要素の基本構造
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
 * メッセージブロックの基本構造
 */
export interface MessageBlock {
  type: string;
  text?: string;
  elements?: RichTextElement[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * メッセージテンプレートの基本構造
 */
export interface MessageTemplate {
  blocks: MessageBlock[];
}

/**
 * フォームテンプレートの構造
 */
export interface FormTemplate extends MessageTemplate {
  title?: string;
  submitLabel?: string;
  callbackId?: string;
}

/**
 * 検索結果アイテムの構造
 */
export interface RetrieveResultItem {
  index: number;
  text: string;
  source: string;
  score: number;
}

/**
 * ログパラメータの構造
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
 * テンプレートプロバイダーの抽象インターフェース
 * 各種メッセージテンプレートを生成する
 */
export interface ITemplateProvider {
  /**
   * ログ取得方法の説明テキストを生成する
   * @param params ログパラメータ
   * @returns マークダウン形式のテキスト
   */
  createHowToGetLogs(params: LogParams): string;
  
  /**
   * フォームテンプレートを生成する
   * @param date 初期日付
   * @param time 初期時刻
   * @returns フォームテンプレート
   */
  createFormTemplate(date: string, time: string): FormTemplate;
  
  /**
   * コマンド実行フォームテンプレートを生成する
   * @returns フォームテンプレート
   */
  createCommandFormTemplate(): FormTemplate;
  
  /**
   * メッセージテンプレートを生成する
   * @param message メッセージテキスト
   * @returns メッセージテンプレート
   */
  createMessageTemplate(message: string): MessageTemplate;
  
  /**
   * エラーメッセージテンプレートを生成する
   * @returns エラーメッセージテンプレート
   */
  createErrorMessageTemplate(): MessageTemplate;
  
  /**
   * 検索結果メッセージテンプレートを生成する
   * @param retrieveResults 検索結果アイテムの配列
   * @returns 検索結果メッセージテンプレート
   */
  createRetrieveResultTemplate(retrieveResults: RetrieveResultItem[]): MessageTemplate;
}
