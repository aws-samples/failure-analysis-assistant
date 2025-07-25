import { AWSServiceFactory } from "../../lib/aws/index.js";
import { MetricDataResult } from "@aws-sdk/client-cloudwatch";
import { logger } from "../logger.js";
import { I18nProvider } from "../messaging/providers/i18n-provider.js";
import { getI18nProvider } from "../messaging/providers/i18n-factory.js";

export class MetricsTool {
  private i18n: I18nProvider;
  
  constructor(i18n?: I18nProvider) {
    // Use provided i18n instance or get from factory
    this.i18n = i18n || getI18nProvider();
  }
  
  async execute(params: {
    metricNames?: string[];
    dimensions?: Record<string, string>[];
    namespaces?: string[];
    startDate: string;
    endDate: string;
    period?: number;
    stat?: string;
    i18n?: I18nProvider;
  }): Promise<string> {
    // Update i18n if provided in params
    if (params.i18n) {
      this.i18n = params.i18n;
    }
    logger.info("Executing metrics tool", { params });
    
    try {
      const cloudWatchService = AWSServiceFactory.getCloudWatchService();
      
      // Get the list of namespaces (use default values if not specified in parameters)
      const namespaces = params.namespaces || [
        "ApplicationSignals",
        "ApplicationELB",
        "EC2",
        "RDS"
      ];
      
      logger.info("Using namespaces", { namespaces });
      
      // Get metrics from multiple namespaces
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
      
      // Further filter by metric names
      if (params.metricNames && params.metricNames.length > 0) {
        metrics = metrics.filter(metric => 
          params.metricNames!.includes(metric.MetricName!)
        );
      }
      
      // If no metrics are found
      if (metrics.length === 0) {
        return this.formatMetricsResults([]);
      }
      
      // Create MetricDataQuery
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
      
      // Get metric data
      const result = await cloudWatchService.queryMetrics(
        params.startDate,
        params.endDate,
        metricDataQuery,
        "MetricsToolResult"
      );
      
      // Format results in a readable format
      return this.formatMetricsResults(result);
    } catch (error) {
      logger.error("Error in metrics tool", { error });
      return this.formatMetricsResults([]);
    }
  }
  
  private formatMetricsResults(results: MetricDataResult[]): string {
    if (!results || results.length === 0) {
      return this.i18n.translate("metricsNoResults");
    }
    
    let output = this.i18n.translate("metricsResultsTitle");
    
    results.forEach((metric, index) => {
      output += `### ${metric.Label || this.i18n.formatTranslation("metricsGenericLabel", index + 1)}\n\n`;
      
      if (!metric.Timestamps || metric.Timestamps.length === 0) {
        output += this.i18n.translate("metricsNoDataPoints");
        return;
      }
      
      // Calculate basic statistics
      const values: number[] = metric.Values || [];
      const min = values.length > 0 ? Math.min(...values) : 0;
      const max = values.length > 0 ? Math.max(...values) : 0;
      const avg = values.length > 0 ? values.reduce((sum: number, val: number) => sum + val, 0) / values.length : 0;
      
      output += this.i18n.formatTranslation("metricsDataPointCount", values.length);
      output += this.i18n.formatTranslation("metricsMinValue", min.toFixed(4));
      output += this.i18n.formatTranslation("metricsMaxValue", max.toFixed(4));
      output += this.i18n.formatTranslation("metricsAvgValue", avg.toFixed(4));
      
      // Detect anomalies (values that deviate significantly from the average)
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
        output += this.i18n.translate("metricsAnomalyDetection");
        anomalies.forEach((anomaly: { value: number, timestamp: Date }) => {
          output += `- ${anomaly.timestamp.toISOString()}: ${anomaly.value.toFixed(4)}\n`;
        });
      }
      
      output += "\n";
    });
    
    return output;
  }
}

// Create tool executor instance
const metricsTool = new MetricsTool();

// Function that can be called externally
export const metricsToolExecutor = async (params: {
  metricNames?: string[];
  dimensions?: Record<string, string>[];
  namespaces?: string[];
  startDate: string;
  endDate: string;
  period?: number;
  stat?: string;
  i18n?: I18nProvider;
}): Promise<string> => {
  return await metricsTool.execute(params);
};
