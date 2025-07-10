import { AWSServiceFactory } from "../../lib/aws/index.js";
import { TraceSummary } from "@aws-sdk/client-xray";
import { logger } from "../logger.js";
import { I18nProvider } from "../messaging/providers/i18n-provider.js";
import { getI18nProvider } from "../messaging/providers/i18n-factory.js";
import { ConfigurationService } from "../configuration-service.js";

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

export class XrayTool {
  private i18n: I18nProvider;
  private configService: ConfigurationService;
  
  constructor(i18n?: I18nProvider, configService?: ConfigurationService) {
    // Use provided i18n instance or get from factory
    this.i18n = i18n || getI18nProvider();
    // Use provided configuration service or get from singleton
    this.configService = configService || ConfigurationService.getInstance();
  }
  
  async execute(params: {
    startDate: string;
    endDate: string;
    filterExpression?: string;
    i18n?: I18nProvider;
    configService?: ConfigurationService;
  }): Promise<string> {
    // Update i18n if provided in params
    if (params.i18n) {
      this.i18n = params.i18n;
    }
    
    // Update configuration service if provided in params
    if (params.configService) {
      this.configService = params.configService;
    }
    
    logger.info("Executing X-Ray tool", { params });
    
    // Check if X-Ray trace is enabled using configuration service
    const xrayTraceEnabled = this.configService.isXrayTraceEnabled();
    
    if (!xrayTraceEnabled) {
      return this.i18n.translate("xrayDisabled");
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
        return this.i18n.translate("xrayNoTraces");
      }
      
      // Format results in a readable format
      return this.formatXrayResults(traces);
    } catch (error) {
      logger.error("Error in X-Ray tool", { error });
      return this.i18n.formatTranslation("xrayQueryError", error instanceof Error ? error.message : String(error));
    }
  }
  
  private formatXrayResults(traces: TraceSummary[]): string {
    if (!traces || traces.length === 0) {
      return this.i18n.translate("xrayNoResults");
    }
    
    // Treat TraceSummary as XrayTrace
    const xrayTraces = traces as unknown as XrayTrace[];
    
    let output = this.i18n.translate("xrayResultsTitle");
    output += this.i18n.formatTranslation("xrayTotalFound", xrayTraces.length);
    
    // Traces with errors
    const errorTraces = xrayTraces.filter(trace => trace.ErrorRootCauses && trace.ErrorRootCauses.length > 0);
    
    if (errorTraces.length > 0) {
      output += this.i18n.formatTranslation("xrayErrorTracesTitle", errorTraces.length);
      
      errorTraces.forEach((trace, index) => {
        if (index < 10) { // Show details for only the first 10 items
          output += this.i18n.formatTranslation("xrayTraceId", trace.Id || this.i18n.translate("xrayUnknown"));
          output += this.i18n.formatTranslation("xrayStartTime", trace.StartTime ? new Date(trace.StartTime).toISOString() : this.i18n.translate("xrayUnknown"));
          output += this.i18n.formatTranslation("xrayResponseTime", trace.ResponseTime || this.i18n.translate("xrayUnknown"));
          output += this.i18n.formatTranslation("xrayStatus", trace.Http?.Response?.Status || this.i18n.translate("xrayUnknown"));
          
          if (trace.ErrorRootCauses && trace.ErrorRootCauses.length > 0) {
            output += this.i18n.translate("xrayErrorCauses");
            trace.ErrorRootCauses.forEach((cause) => {
              if (cause.Services && cause.Services.length > 0) {
                cause.Services.forEach((service) => {
                  const serviceName = service.Name || this.i18n.translate("xrayUnknown");
                  const exceptions = service.Exceptions || [];
                  const messages = exceptions.map((e: { Message?: string }) => e.Message || this.i18n.translate("xrayUnknownError")).join(", ");
                  output += `  - ${serviceName}: ${messages}\n`;
                });
              }
            });
          }
          
          output += "\n";
        }
      });
      
      if (errorTraces.length > 10) {
        output += this.i18n.formatTranslation("xrayMoreErrorTraces", errorTraces.length - 10);
      }
    }
    
    // Slow traces
    const slowTraces = [...xrayTraces]
      .filter(trace => trace.ResponseTime !== undefined)
      .sort((a, b) => (b.ResponseTime || 0) - (a.ResponseTime || 0))
      .slice(0, 5);
    
    if (slowTraces.length > 0) {
      output += this.i18n.translate("xraySlowestTracesTitle");
      
      slowTraces.forEach(trace => {
        output += this.i18n.formatTranslation("xrayTraceIdLine", trace.Id || this.i18n.translate("xrayUnknown"));
        output += this.i18n.formatTranslation("xrayResponseTimeLine", trace.ResponseTime || this.i18n.translate("xrayUnknown"));
        output += this.i18n.formatTranslation("xrayStartTimeLine", trace.StartTime ? new Date(trace.StartTime).toISOString() : this.i18n.translate("xrayUnknown"));
        output += this.i18n.formatTranslation("xrayUrlLine", trace.Http?.HttpURL || this.i18n.translate("xrayUnknown"));
        output += this.i18n.formatTranslation("xrayMethodLine", trace.Http?.HttpMethod || this.i18n.translate("xrayUnknown"));
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
      output += this.i18n.translate("xrayServiceStatsTitle");
      
      Object.entries(serviceStats).forEach(([service, stats]) => {
        output += `#### ${service}\n`;
        output += this.i18n.formatTranslation("xrayRequestCount", stats.count);
        output += this.i18n.formatTranslation("xrayErrorCount", stats.errors, (stats.errors / stats.count * 100).toFixed(2));
        output += this.i18n.formatTranslation("xrayAvgResponseTime", (stats.totalTime / stats.count).toFixed(2));
      });
    }
    
    return output;
  }
}

// Function that can be called externally
export const xrayToolExecutor = async (params: {
  startDate: string;
  endDate: string;
  filterExpression?: string;
  i18n?: I18nProvider;
  configService?: ConfigurationService;
}): Promise<string> => {
  const xrayTool = new XrayTool(params.i18n, params.configService);
  return await xrayTool.execute(params);
};
