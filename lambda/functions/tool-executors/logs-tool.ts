import { AWSServiceFactory } from "../../lib/aws/index.js";
import { LogField, LogResults } from "../../lib/aws/services/cloudwatch-logs-service.js";
import { logger } from "../../lib/logger";

export const logsToolExecutor = async (params: {
  filterPattern?: string;
  startDate: string;
  endDate: string;
  limit?: number;
}): Promise<string> => {
  logger.info("Executing logs tool", { params });
  
  try {
    // parameter.tsで指定されたロググループを使用
    const configuredLogGroups = process.env.CW_LOGS_LOGGROUPS ? 
      JSON.parse(process.env.CW_LOGS_LOGGROUPS).loggroups || [] : 
      [];
    
    if (configuredLogGroups.length === 0) {
      return "ロググループが設定されていません。parameter.tsのcwLogsLogGroupsを確認してください。";
    }
    
    logger.info("Using configured log groups", { configuredLogGroups });
    
    // クエリ文字列の構築
    const filterPattern = params.filterPattern || "";
    const limit = params.limit || 100;
    
    // 環境変数から取得したデフォルトクエリがあれば使用
    const defaultQuery = process.env.CW_LOGS_INSIGHT_QUERY || "fields @timestamp, @message";
    
    // デフォルトクエリをベースに、フィルターとリミットを追加
    const queryString = `${defaultQuery}
      ${filterPattern ? `| filter ${filterPattern}` : ""}
      | sort @timestamp desc
      | limit ${limit}`;
    
    // CloudWatch Logsへのクエリ実行
    const cloudWatchLogsService = AWSServiceFactory.getCloudWatchLogsService();
    const results = await cloudWatchLogsService.queryLogs(
      params.startDate,
      params.endDate,
      configuredLogGroups,
      queryString
    );
    
    // 結果を読みやすい形式に整形
    return formatLogsResults(results);
  } catch (error) {
    logger.error("Error in logs tool", { error });
    return `ログの取得中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`;
  }
};

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
