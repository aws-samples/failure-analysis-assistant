import { AWSServiceFactory } from "../../lib/aws/index.js";
import { logger } from "../../lib/logger";

export const auditLogToolExecutor = async (params: {
  startDate: string;
  endDate: string;
  services?: string[];
  users?: string[];
  eventNames?: string[];
  region?: string;
}): Promise<string> => {
  logger.info("Executing audit log tool", { params });
  
  try {
    // 環境変数の取得
    const databaseName = process.env.ATHENA_DATABASE_NAME;
    const cloudTrailLogTableName = process.env.CLOUD_TRAIL_LOG_TABLE_NAME;
    const athenaQueryOutputLocation = `s3://${process.env.ATHENA_QUERY_BUCKET}/`;
    const region = process.env.AWS_REGION; // ひとまずリージョンは固定
    
    if (!databaseName || !cloudTrailLogTableName) {
      return "CloudTrailログテーブルが設定されていません。parameter.tsのcloudTrailLogTableNameを確認してください。";
    }
    
    // クエリの構築
    let query = `SELECT eventtime, eventsource, eventname, awsregion, sourceipaddress, errorcode, errormessage 
                FROM ${cloudTrailLogTableName} 
                WHERE eventtime BETWEEN ? AND ?`;
    
    const queryParams = [params.startDate, params.endDate];
    
    // フィルタの追加
    if (region) {
      query += " AND awsregion = ?";
      queryParams.push(region);
    }
    
    if (params.services && params.services.length > 0) {
      const serviceConditions = params.services.map(() => "eventsource LIKE ?").join(" OR ");
      query += ` AND (${serviceConditions})`;
      params.services.forEach(service => queryParams.push(`%${service}%`));
    }
    
    if (params.eventNames && params.eventNames.length > 0) {
      const eventConditions = params.eventNames.map(() => "eventname = ?").join(" OR ");
      query += ` AND (${eventConditions})`;
      params.eventNames.forEach(event => queryParams.push(event));
    }
    
    if (params.users && params.users.length > 0) {
      const userConditions = params.users.map(() => "useridentity.username = ?").join(" OR ");
      query += ` AND (${userConditions})`;
      params.users.forEach(user => queryParams.push(user));
    }
    
    query += " ORDER BY eventtime DESC LIMIT 100";
    
    // Athenaへのクエリ実行
    const athenaService = AWSServiceFactory.getAthenaService();
    const res = await athenaService.queryToAthena(
      query,
      { Database: databaseName },
      queryParams,
      athenaQueryOutputLocation,
    );
    
    // 結果を読みやすい形式に整形
    return formatAuditLogHistoryResults(res.result);
  } catch (error) {
    logger.error("Error in change history tool", { error });
    return `変更履歴の取得中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`;
  }
};

function formatAuditLogHistoryResults(csvResults: string): string {
  if (!csvResults || csvResults.trim() === "") {
    return "条件に一致する監査ログが見つかりませんでした。";
  }
  
  let output = "## 監査ログ分析結果\n\n";
  
  // CSVをパース
  const lines = csvResults.trim().split("\n");
  if (lines.length <= 1) {
    return output + "監査ログが見つかりませんでした。";
  }
  
  const headers = lines[0].split(",");
  const rows = lines.slice(1).map(line => {
    const values = line.split(",");
    return headers.reduce((obj: Record<string, string>, header, index) => {
      obj[header] = values[index] || "";
      return obj;
    }, {});
  });
  
  output += `合計 ${rows.length} 件の監査ログが見つかりました。\n\n`;
  
  // サービス別の監査ログ数
  const serviceAuditLogs: Record<string, number> = {};
  rows.forEach(row => {
    const service = row.eventsource || "unknown";
    serviceAuditLogs[service] = (serviceAuditLogs[service] || 0) + 1;
  });
  
  output += "### サービス別監査ログ数\n\n";
  Object.entries(serviceAuditLogs)
    .sort((a, b) => b[1] - a[1])
    .forEach(([service, count]) => {
      output += `- ${service}: ${count}件\n`;
    });
  
  output += "\n";
  
  // エラーのあった監査ログ
  const errorAuditLogs = rows.filter(row => row.errorcode && row.errorcode !== "null" && row.errorcode !== "");
  
  if (errorAuditLogs.length > 0) {
    output += `### エラーのあった監査ログ (${errorAuditLogs.length}件)\n\n`;
    errorAuditLogs.forEach(auditlog => {
      output += `- **${auditlog.eventtime}**: ${auditlog.eventsource} - ${auditlog.eventname}\n`;
      output += `  エラー: ${auditlog.errorcode} - ${auditlog.errormessage}\n\n`;
    });
  }
  
  // 重要な監査ログ
  // TODO: 重要な監査ログをパラメータ化して外に出す
  const importantEvents = [
    "RunInstances", "TerminateInstances",
    "CreateCluster", "DeleteCluster", "ModifyCluster",
    "CreateLoadBalancer", "DeleteLoadBalancer",
    "CreatePolicy", "DeletePolicy", "AttachRolePolicy", "DetachRolePolicy"
  ];
  
  const importantAuditLogs = rows.filter(row => 
    importantEvents.some(event => row.eventname && row.eventname.includes(event))
  );
  
  if (importantAuditLogs.length > 0) {
    output += "### 重要な監査ログ\n\n";
    importantAuditLogs.forEach(auditlog => {
      output += `- **${auditlog.eventtime}**: ${auditlog.eventsource} - ${auditlog.eventname}\n`;
      output += `  リージョン: ${auditlog.awsregion}, ソースIP: ${auditlog.sourceipaddress}\n\n`;
    });
  }
  
  // 時系列分析
  output += "### 時系列分布\n\n";
  
  if (rows.length > 0) {
    const firstAuditLog = rows[rows.length - 1]; // 最も古い監査ログ（逆順でソートされているため）
    const lastAuditLog = rows[0]; // 最も新しい監査ログ
    
    output += `- 最初の監査ログ: ${firstAuditLog.eventtime} (${firstAuditLog.eventsource} - ${firstAuditLog.eventname})\n`;
    output += `- 最後の監査ログ: ${lastAuditLog.eventtime} (${lastAuditLog.eventsource} - ${lastAuditLog.eventname})\n`;
  }
  
  return output;
}
