/**
 * AWS SDKのページネーション処理を抽象化するユーティリティ関数
 * @param initialCommand 初期コマンド
 * @param client AWSクライアント
 * @param getItems レスポンスからアイテムを取得する関数
 * @param getNextToken レスポンスからNextTokenを取得する関数
 * @param setNextToken コマンドにNextTokenを設定する関数
 * @returns 全ページのアイテムを結合した配列
 */
export async function paginateResults<T, R>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialCommand: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  getItems: (response: R) => T[],
  getNextToken: (response: R) => string | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setNextToken: (command: any, token: string) => any
): Promise<T[]> {
  const results: T[] = [];
  let nextToken: string | undefined;
  let command = initialCommand;
  
  do {
    const response = await client.send(command);
    const items = getItems(response);
    if (items) results.push(...items);
    nextToken = getNextToken(response);
    if (nextToken) command = setNextToken(command, nextToken);
  } while (nextToken);
  
  return results;
}

/**
 * ISO8601形式の日付文字列をミリ秒に変換する
 * @param isoDate ISO8601形式の日付文字列
 * @returns ミリ秒
 */
export function iso8601ToMilliseconds(isoDate: string): number {
  const date = new Date(isoDate);
  return date.getTime();
}
