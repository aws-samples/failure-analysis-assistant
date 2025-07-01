import { AWSServiceFactory } from "../../lib/aws/index.js";
import { LogField, LogResults } from "../../lib/aws/services/cloudwatch-logs-service.js";
import { logger } from "../logger.js";

export const logsToolExecutor = async (params: {
  filterPattern?: string;
  startDate: string;
  endDate: string;
  limit?: number;
}): Promise<string> => {
  logger.info("Executing logs tool", { params });
  
  try {
    // Use log groups specified in parameter.ts
    const configuredLogGroups = process.env.CW_LOGS_LOGGROUPS ? 
      JSON.parse(process.env.CW_LOGS_LOGGROUPS).loggroups || [] : 
      [];
    
    if (configuredLogGroups.length === 0) {
      return "ロググループが設定されていません。parameter.tsのcwLogsLogGroupsを確認してください。";
    }
    
    logger.info("Using configured log groups", { configuredLogGroups });
    
    // Build query string
    const filterPattern = params.filterPattern || "";
    const limit = params.limit || 100;
    
    // Use default query from environment variables if available
    const defaultQuery = process.env.CW_LOGS_INSIGHT_QUERY || "fields @timestamp, @message";
    
    // Add filter and limit to the default query
    const queryString = `${defaultQuery}
      ${filterPattern ? `| filter ${filterPattern}` : ""}
      | sort @timestamp desc
      | limit ${limit}`;
    
    // Execute query to CloudWatch Logs
    const cloudWatchLogsService = AWSServiceFactory.getCloudWatchLogsService();
    
    try {
      // First attempt
      const results = await cloudWatchLogsService.queryLogs(
        params.startDate,
        params.endDate,
        configuredLogGroups,
        queryString
      );
      
      // Format results in a readable format
      return formatLogsResults(results);
    } catch (error) {
      // In case of MalformedQueryException, use Bedrock to fix the query
      if (error instanceof Error && 
          (error.name === "MalformedQueryException" || 
           error.message.includes("MalformedQuery"))) {
        
        logger.warn("MalformedQueryException detected, attempting to fix query using Bedrock", { 
          originalQuery: queryString,
          error: error.message
        });
        
        // Use Bedrock to fix the filter pattern
        const fixedFilterPattern = await fixFilterPatternWithBedrock(filterPattern, error.message);
        
        if (fixedFilterPattern !== filterPattern) {
          // Retry with the fixed filter pattern
          const fixedQueryString = `${defaultQuery}
            ${fixedFilterPattern ? `| filter ${fixedFilterPattern}` : ""}
            | sort @timestamp desc
            | limit ${limit}`;
          
          logger.info("Retrying with fixed query", { fixedQueryString });
          
          try {
            const results = await cloudWatchLogsService.queryLogs(
              params.startDate,
              params.endDate,
              configuredLogGroups,
              fixedQueryString
            );
            
            return formatLogsResults(results) + 
              "\n\n**注: 元のフィルターパターンに問題があったため、修正して実行しました。修正後のパターン: `" + fixedFilterPattern + "`**";
          } catch (retryError) {
            // If retry also fails
            logger.error("Retry also failed", { retryError });
            return `フィルターパターンの構文が無効です: ${params.filterPattern}\n\n` +
                   "有効なフィルターパターン構文の例:\n" +
                   "- `@message like 'error'`\n" +
                   "- `@message like /Exception/`\n" +
                   "- `@message like 'error' and @timestamp > '2023-01-01'`\n\n" +
                   "詳細はCloudWatch Logs Insightsクエリ構文のドキュメントを参照してください: " +
                   "https://docs.aws.amazon.com/ja_jp/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html";
          }
        } else {
          // If it couldn't be fixed
          return `フィルターパターンの構文が無効です: ${params.filterPattern}\n\n` +
                 "有効なフィルターパターン構文の例:\n" +
                 "- `@message like 'error'`\n" +
                 "- `@message like /Exception/`\n" +
                 "- `@message like 'error' and @timestamp > '2023-01-01'`\n\n" +
                 "詳細はCloudWatch Logs Insightsクエリ構文のドキュメントを参照してください: " +
                 "https://docs.aws.amazon.com/ja_jp/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html";
        }
      }
      
      // Rethrow other errors
      throw error;
    }
  } catch (error) {
    logger.error("Error in logs tool", { error });
    return `ログの取得中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`;
  }
};

/**
 * Use Bedrock to fix the filter pattern
 * @param filterPattern Original filter pattern
 * @param errorMessage Error message
 * @returns Fixed filter pattern
 */
async function fixFilterPatternWithBedrock(filterPattern: string, errorMessage: string): Promise<string> {
  if (!filterPattern) return "";
  
  try {
    const bedrockService = AWSServiceFactory.getBedrockService();
    
    // CloudWatch Logs Insightsのクエリ構文に関するコンテキスト情報
    const contextInfo = `
# CloudWatch Logs Insightsフィルター構文ガイド

## 基本的なフィルター構文
- @message like 'error' - エラーを含むメッセージ
- @message like /Exception/ - 正規表現でExceptionを含むメッセージ
- level = 'ERROR' - 特定のフィールドの値でフィルタリング
- @timestamp > '2023-01-01' - 日付でフィルタリング

## 演算子
- like/not like - 部分一致（大文字小文字を区別しない）
- =, !=, <, >, <=, >= - 比較演算子
- and, or, not - 論理演算子

## 構文ルール
- 文字列は '単一引用符' または "二重引用符" で囲む（一貫して使用）
- 正規表現は /スラッシュ/ で囲む
- 複雑な条件は (括弧) でグループ化
- 特殊文字は \\ でエスケープ

## 一般的なエラー
- 文字列が引用符で囲まれていない
- 引用符の不一致（開始と終了の引用符が異なる）
- 括弧の不均衡
- 正規表現のスラッシュの不均衡
- 特殊文字のエスケープ漏れ
`;

    // プロンプトの作成
    const prompt = `
あなたはCloudWatch Logs Insightsのクエリ構文の専門家です。
以下のフィルターパターンがMalformedQueryExceptionを発生させています。
このフィルターパターンを修正して、有効なCloudWatch Logs Insightsのフィルター構文に変換してください。

## 元のフィルターパターン
\`${filterPattern}\`

## 発生したエラー
\`${errorMessage}\`

## コンテキスト情報
${contextInfo}

## 指示
1. 元のフィルターパターンの意図を理解してください
2. CloudWatch Logs Insightsの構文ルールに従って修正してください
3. 特に文字列が引用符で囲まれているか、正規表現が適切に/スラッシュ/で囲まれているかを確認してください
4. 修正したフィルターパターンのみを返してください。説明は不要です。

修正したフィルターパターン:
`;

    // Bedrockモデルを呼び出して修正
    const response = await bedrockService.converse(prompt);
    
    // 応答から修正されたフィルターパターンを抽出
    // 余分な説明やマークダウン記号を取り除く
    let fixedPattern = response.trim();
    
    // バッククォート、コードブロック記号などを削除
    fixedPattern = fixedPattern.replace(/```[a-z]*\n?|\n?```|`/g, '');
    
    // 先頭と末尾の空白を削除
    fixedPattern = fixedPattern.trim();
    
    logger.info("Bedrock fixed filter pattern", { 
      originalPattern: filterPattern, 
      fixedPattern: fixedPattern 
    });
    
    return fixedPattern;
  } catch (error) {
    // Bedrockの呼び出しに失敗した場合は元のパターンを返す
    logger.error("Error fixing filter pattern with Bedrock", { error });
    return filterPattern;
  }
}

function formatLogsResults(results: LogResults): string {
  if (!results || results.length === 0) {
    return "条件に一致するログが見つかりませんでした。";
  }
  
  let output = "## ログ分析結果\n\n";
  output += `合計 ${results.length} 件のログが見つかりました。\n\n`;
  
  // エラーパターンの検出
  const errorLogs = results.filter(log => {
    const messageField = log.find((field: LogField) => field.field === "@message");
    const message = messageField?.value || "";
    return message.toLowerCase().includes("error") || 
           message.toLowerCase().includes("exception") || 
           message.toLowerCase().includes("fail") ||
           message.toLowerCase().includes("エラー") ||
           message.toLowerCase().includes("失敗");
  });
  
  if (errorLogs.length > 0) {
    output += `### エラーログ (${errorLogs.length} 件)\n\n`;
    errorLogs.forEach((log, index) => {
      if (index < 10) { // 最初の10件のみ詳細表示
        const timestampField = log.find((field: LogField) => field.field === "@timestamp");
        const messageField = log.find((field: LogField) => field.field === "@message");
        
        const timestamp = timestampField ? timestampField.value : "";
        const message = messageField ? messageField.value : "";
        
        output += `**${timestamp}**\n\`\`\`\n${message}\n\`\`\`\n\n`;
      }
    });
    
    if (errorLogs.length > 10) {
      output += `_他 ${errorLogs.length - 10} 件のエラーログがあります。_\n\n`;
    }
  }
  
  // 時系列分析
  output += "### 時系列分布\n\n";
  
  // タイムスタンプでソート
  const sortedLogs = [...results].sort((a, b) => {
    const aTimeField = a.find((field: LogField) => field.field === "@timestamp");
    const bTimeField = b.find((field: LogField) => field.field === "@timestamp");
    
    const aTime = aTimeField?.value || "";
    const bTime = bTimeField?.value || "";
    
    const aDate = aTime ? new Date(aTime) : new Date(0);
    const bDate = bTime ? new Date(bTime) : new Date(0);
    
    return aDate.getTime() - bDate.getTime();
  });
  
  // 最初と最後のログを表示
  if (sortedLogs.length > 0) {
    const firstLog = sortedLogs[0];
    const lastLog = sortedLogs[sortedLogs.length - 1];
    
    const firstTimeField = firstLog.find((field: LogField) => field.field === "@timestamp");
    const lastTimeField = lastLog.find((field: LogField) => field.field === "@timestamp");
    
    const firstTimestamp = firstTimeField ? firstTimeField.value : "";
    const lastTimestamp = lastTimeField ? lastTimeField.value : "";
    
    if (firstTimestamp && lastTimestamp) {
      output += `- 最初のログ: ${firstTimestamp}\n`;
      output += `- 最後のログ: ${lastTimestamp}\n`;
      
      const firstDate = new Date(firstTimestamp);
      const lastDate = new Date(lastTimestamp);
      
      if (!isNaN(firstDate.getTime()) && !isNaN(lastDate.getTime())) {
        output += `- 期間: ${lastDate.getTime() - firstDate.getTime()}ミリ秒\n\n`;
      } else {
        output += `- 期間: 計算できません\n\n`;
      }
    }
  }
  
  // 代表的なログパターンの抽出（簡易版）
  output += "### 代表的なログサンプル\n\n";
  
  // 最大5件のサンプルを表示
  const sampleSize = Math.min(5, results.length);
  const step = Math.max(1, Math.floor(results.length / sampleSize));
  
  for (let i = 0; i < results.length; i += step) {
    if (i / step >= sampleSize) break;
    
    const log = results[i];
    const timestampField = log.find((field: LogField) => field.field === "@timestamp");
    const messageField = log.find((field: LogField) => field.field === "@message");
    
    const timestamp = timestampField ? timestampField.value : "";
    const message = messageField ? messageField.value : "";
    
    output += `**${timestamp}**\n\`\`\`\n${message}\n\`\`\`\n\n`;
  }
  
  return output;
}
