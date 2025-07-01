import { AWSServiceFactory } from "../../lib/aws/index.js";
import { MetricDataResult } from "@aws-sdk/client-cloudwatch";
import { logger } from "../logger.js";

export class MetricsTool {
  async execute(params: {
    metricNames?: string[];
    dimensions?: Record<string, string>[];
    namespaces?: string[];
    startDate: string;
    endDate: string;
    period?: number;
    stat?: string;
  }): Promise<string> {
    logger.info("Executing metrics tool", { params });
    
    try {
      const cloudWatchService = AWSServiceFactory.getCloudWatchService();
      
      // 名前空間のリストを取得（パラメータで指定されていない場合はデフォルト値を使用）
      const namespaces = params.namespaces || [
        "ApplicationSignals",
        "ApplicationELB",
        "EC2",
        "RDS"
      ];
      
      logger.info("Using namespaces", { namespaces });
      
      // 複数のネームスペースからメトリクスを取得
      let metrics = [];
      for (const namespace of namespaces) {
        try {
          const nsMetrics = await cloudWatchService.listMetrics(namespace);
          metrics.push(...nsMetrics);
          logger.info(`Retrieved ${nsMetrics.length} metrics from namespace ${namespace}`);
        } catch (error) {
          logger.warn(`Failed to retrieve metrics from namespace ${namespace}`, { error });
        }
      }
      
      // さらにメトリクス名でフィルタリング
      if (params.metricNames && params.metricNames.length > 0) {
        metrics = metrics.filter(metric => 
          params.metricNames!.includes(metric.MetricName!)
        );
      }
      
      // メトリクスが見つからない場合
      if (metrics.length === 0) {
        return this.formatMetricsResults([]);
      }
      
      // MetricDataQueryの作成
      const metricDataQuery = metrics.map((metric, index) => ({
        Id: `m${index}`,
        Label: `${metric.Namespace}:${metric.MetricName}${metric.Dimensions?.map(d => `${d.Name}=${d.Value}`).join(",")}`,
        MetricStat: {
          Metric: {
            Namespace: metric.Namespace,
            MetricName: metric.MetricName,
            Dimensions: metric.Dimensions
          },
          Period: params.period || 60,
          Stat: params.stat || "Average"
        }
      }));
      
      // メトリクスデータの取得
      const result = await cloudWatchService.queryMetrics(
        params.startDate,
        params.endDate,
        metricDataQuery,
        "MetricsToolResult"
      );
      
      // 結果を読みやすい形式に整形
      return this.formatMetricsResults(result);
    } catch (error) {
      logger.error("Error in metrics tool", { error });
      return this.formatMetricsResults([]);
    }
  }
  
  private formatMetricsResults(results: MetricDataResult[]): string {
    if (!results || results.length === 0) {
      return "メトリクスデータが見つかりませんでした。";
    }
    
    let output = "## メトリクス分析結果\n\n";
    
    results.forEach((metric, index) => {
      output += `### ${metric.Label || `メトリクス ${index + 1}`}\n\n`;
      
      if (!metric.Timestamps || metric.Timestamps.length === 0) {
        output += "データポイントがありません。\n\n";
        return;
      }
      
      // 基本統計情報の計算
      const values: number[] = metric.Values || [];
      const min = values.length > 0 ? Math.min(...values) : 0;
      const max = values.length > 0 ? Math.max(...values) : 0;
      const avg = values.length > 0 ? values.reduce((sum: number, val: number) => sum + val, 0) / values.length : 0;
      
      output += `- データポイント数: ${values.length}\n`;
      output += `- 最小値: ${min.toFixed(4)}\n`;
      output += `- 最大値: ${max.toFixed(4)}\n`;
      output += `- 平均値: ${avg.toFixed(4)}\n`;
      
      // 異常値の検出（平均から大きく外れた値）
      const stdDev = Math.sqrt(
        values.reduce((sum: number, val: number) => sum + Math.pow(val - avg, 2), 0) / values.length
      );
      
      const anomalies = values.length > 0 ? values
        .map((val: number, i: number) => ({ 
          value: val, 
          timestamp: metric.Timestamps && i < metric.Timestamps.length ? new Date(metric.Timestamps[i]) : new Date() 
        }))
        .filter((point: { value: number }) => Math.abs(point.value - avg) > 2 * stdDev) : [];
      
      if (anomalies.length > 0) {
        output += `\n**異常値検出** (標準偏差の2倍以上外れた値):\n`;
        anomalies.forEach((anomaly: { value: number, timestamp: Date }) => {
          output += `- ${anomaly.timestamp.toISOString()}: ${anomaly.value.toFixed(4)}\n`;
        });
      }
      
      output += "\n";
    });
    
    return output;
  }
}

// ツールエグゼキューターのインスタンスを作成
const metricsTool = new MetricsTool();

// 外部から呼び出し可能な関数
export const metricsToolExecutor = async (params: {
  metricNames?: string[];
  dimensions?: Record<string, string>[];
  namespaces?: string[];
  startDate: string;
  endDate: string;
  period?: number;
  stat?: string;
}): Promise<string> => {
  return await metricsTool.execute(params);
};
