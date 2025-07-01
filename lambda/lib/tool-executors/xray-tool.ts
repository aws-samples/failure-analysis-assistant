import { AWSServiceFactory } from "../../lib/aws/index.js";
import { TraceSummary } from "@aws-sdk/client-xray";
import { logger } from "../logger.js";

export const xrayToolExecutor = async (params: {
  startDate: string;
  endDate: string;
  filterExpression?: string;
}): Promise<string> => {
  logger.info("Executing X-Ray tool", { params });
  
  // Check if X-Ray trace is enabled
  const xrayTraceEnabled = process.env.XRAY_TRACE === "true";
  
  if (!xrayTraceEnabled) {
    return "X-Rayトレースは現在無効になっています。parameter.tsのxrayTraceをtrueに設定してください。";
  }
  
  try {
    // Get X-Ray traces
    const xrayService = AWSServiceFactory.getXRayService();
    const traces = await xrayService.queryToXray(
      params.startDate,
      params.endDate
    );
    
    // If no traces exist
    if (!traces || traces.length === 0) {
      return "指定された期間にX-Rayトレースが見つかりませんでした。";
    }
    
    // Format results in a readable format
    return formatXrayResults(traces);
  } catch (error) {
    logger.error("Error in X-Ray tool", { error });
    return `X-Rayトレースの取得中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`;
  }
};

// Define custom XrayTrace type
interface XrayTrace {
  Id?: string;
  Duration?: number;
  ResponseTime?: number;
  StartTime?: Date;
  Http?: {
    HttpURL?: string;
    HttpMethod?: string;
    Response?: {
      Status?: number;
    };
  };
  ErrorRootCauses?: Array<{
    Services?: Array<{
      Name?: string;
      Exceptions?: Array<{
        Message?: string;
      }>;
    }>;
  }>;
  Annotations?: {
    Service?: string[];
  };
}

function formatXrayResults(traces: TraceSummary[]): string {
  if (!traces || traces.length === 0) {
    return "条件に一致するX-Rayトレースが見つかりませんでした。";
  }
  
  // Treat TraceSummary as XrayTrace
  const xrayTraces = traces as unknown as XrayTrace[];
  
  let output = "## X-Ray分析結果\n\n";
  output += `合計 ${xrayTraces.length} 件のトレースが見つかりました。\n\n`;
  
  // Traces with errors
  const errorTraces = xrayTraces.filter(trace => trace.ErrorRootCauses && trace.ErrorRootCauses.length > 0);
  
  if (errorTraces.length > 0) {
    output += `### エラーのあるトレース (${errorTraces.length}件)\n\n`;
    
    errorTraces.forEach((trace, index) => {
      if (index < 10) { // Show details for only the first 10 items
        output += `#### トレースID: ${trace.Id || "不明"}\n`;
        output += `- 開始時刻: ${trace.StartTime ? new Date(trace.StartTime).toISOString() : "不明"}\n`;
        output += `- 応答時間: ${trace.ResponseTime || "不明"}ms\n`;
        output += `- ステータス: ${trace.Http?.Response?.Status || "不明"}\n`;
        
        if (trace.ErrorRootCauses && trace.ErrorRootCauses.length > 0) {
          output += "- エラー原因:\n";
          trace.ErrorRootCauses.forEach((cause) => {
            if (cause.Services && cause.Services.length > 0) {
              cause.Services.forEach((service) => {
                const serviceName = service.Name || "不明";
                const exceptions = service.Exceptions || [];
                const messages = exceptions.map((e: { Message?: string }) => e.Message || "不明なエラー").join(", ");
                output += `  - ${serviceName}: ${messages}\n`;
              });
            }
          });
        }
        
        output += "\n";
      }
    });
    
    if (errorTraces.length > 10) {
      output += `_他 ${errorTraces.length - 10} 件のエラートレースがあります。_\n\n`;
    }
  }
  
  // Slow traces
  const slowTraces = [...xrayTraces]
    .filter(trace => trace.ResponseTime !== undefined)
    .sort((a, b) => (b.ResponseTime || 0) - (a.ResponseTime || 0))
    .slice(0, 5);
  
  if (slowTraces.length > 0) {
    output += "### 最も遅いトレース\n\n";
    
    slowTraces.forEach(trace => {
      output += `- トレースID: ${trace.Id || "不明"}\n`;
      output += `  - 応答時間: ${trace.ResponseTime || "不明"}ms\n`;
      output += `  - 開始時刻: ${trace.StartTime ? new Date(trace.StartTime).toISOString() : "不明"}\n`;
      output += `  - URL: ${trace.Http?.HttpURL || "不明"}\n`;
      output += `  - メソッド: ${trace.Http?.HttpMethod || "不明"}\n\n`;
    });
  }
  
  // Statistics by service
  const serviceStats: Record<string, { count: number, errors: number, totalTime: number }> = {};
  
  xrayTraces.forEach(trace => {
    if (trace.Annotations?.Service && trace.Annotations.Service.length > 0) {
      const service = trace.Annotations.Service[0];
      
      if (!serviceStats[service]) {
        serviceStats[service] = { count: 0, errors: 0, totalTime: 0 };
      }
      
      serviceStats[service].count++;
      serviceStats[service].totalTime += trace.ResponseTime || 0;
      
      if (trace.ErrorRootCauses && trace.ErrorRootCauses.length > 0) {
        serviceStats[service].errors++;
      }
    }
  });
  
  if (Object.keys(serviceStats).length > 0) {
    output += "### サービス別統計\n\n";
    
    Object.entries(serviceStats).forEach(([service, stats]) => {
      output += `#### ${service}\n`;
      output += `- リクエスト数: ${stats.count}\n`;
      output += `- エラー数: ${stats.errors} (${(stats.errors / stats.count * 100).toFixed(2)}%)\n`;
      output += `- 平均応答時間: ${(stats.totalTime / stats.count).toFixed(2)}ms\n\n`;
    });
  }
  
  return output;
}
