/**
 * メッセージの宛先を表す抽象インターフェース
 * 各メッセージングプラットフォーム固有の宛先情報を抽象化する
 */
export interface MessageDestination {
  /**
   * 宛先の一意の識別子を取得
   * @returns 宛先を識別する文字列
   */
  getIdentifier(): string;
}
