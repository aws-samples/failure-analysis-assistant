import { AWSServiceFactory } from "../../lib/aws/index.js";
import { LogField, LogResults } from "../../lib/aws/services/cloudwatch-logs-service.js";
import { logger } from "../logger.js";
import { I18nProvider } from "../messaging/providers/i18n-provider.js";
import { getI18nProvider } from "../messaging/providers/i18n-factory.js";
import { ConfigurationService } from "../configuration-service.js";

export class LogsTool {
  private i18n: I18nProvider;
  private configService: ConfigurationService;
  
  constructor(i18n?: I18nProvider, configService?: ConfigurationService) {
    // Use provided i18n instance or get from factory
    this.i18n = i18n || getI18nProvider();
    // Use provided configuration service or get from singleton
    this.configService = configService || ConfigurationService.getInstance();
  }
  
  async execute(params: {
    filterPattern?: string;
    startDate: string;
    endDate: string;
    limit?: number;
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
    
    logger.info("Executing logs tool", { params });
    
    try {
      // Use log groups from configuration service
      const configuredLogGroups = this.configService.getCwLogsLogGroups();
      
      if (configuredLogGroups.length === 0) {
        return this.i18n.translate("logsGroupsNotConfigured");
      }
      
      logger.info("Using configured log groups", { configuredLogGroups });
      
      // Build query string
      const filterPattern = params.filterPattern || "";
      const limit = params.limit || 100;
      
      // Use default query from configuration service
      const defaultQuery = this.configService.getCwLogsInsightQuery() || "fields @timestamp, @message";
      
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
        return this.formatLogsResults(results);
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
          const fixedFilterPattern = await this.fixFilterPatternWithBedrock(filterPattern, error.message);
          
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
              
              return this.formatLogsResults(results) + 
                this.i18n.formatTranslation("logsFixedFilterNote", fixedFilterPattern);
            } catch (retryError) {
              // If retry also fails
              logger.error("Retry also failed", { retryError });
              return this.i18n.formatTranslation("logsInvalidFilterPattern", params.filterPattern || "");
            }
          } else {
            // If it couldn't be fixed
            return this.i18n.formatTranslation("logsInvalidFilterPattern", params.filterPattern || "");
          }
        }
        
        // Rethrow other errors
        throw error;
      }
    } catch (error) {
      logger.error("Error in logs tool", { error });
      return this.i18n.formatTranslation("logsQueryError", error instanceof Error ? error.message : String(error));
    }
  }
  
  /**
   * Use Bedrock to fix the filter pattern
   * @param filterPattern Original filter pattern
   * @param errorMessage Error message
   * @returns Fixed filter pattern
   */
  private async fixFilterPatternWithBedrock(filterPattern: string, errorMessage: string): Promise<string> {
    if (!filterPattern) return "";
    
    try {
      const bedrockService = AWSServiceFactory.getBedrockService();
      
      // Context information about CloudWatch Logs Insights query syntax
      const contextInfo = `
# CloudWatch Logs Insights Filter Syntax Guide

## Basic Filter Syntax
- @message like 'error' - Messages containing error
- @message like /Exception/ - Messages containing Exception using regex
- level = 'ERROR' - Filter by specific field value
- @timestamp > '2023-01-01' - Filter by date

## Operators
- like/not like - Partial match (case insensitive)
- =, !=, <, >, <=, >= - Comparison operators
- and, or, not - Logical operators

## Syntax Rules
- Strings must be enclosed in 'single quotes' or "double quotes" (use consistently)
- Regular expressions must be enclosed in /slashes/
- Complex conditions should be grouped with (parentheses)
- Special characters must be escaped with \\

## Common Errors
- Strings not enclosed in quotes
- Mismatched quotes (opening and closing quotes are different)
- Unbalanced parentheses
- Unbalanced slashes in regular expressions
- Unescaped special characters
`;

      // Create prompt
      const prompt = `
You are an expert in CloudWatch Logs Insights query syntax.
The following filter pattern is causing a MalformedQueryException.
Please fix this filter pattern to make it a valid CloudWatch Logs Insights filter syntax.

## Original Filter Pattern
\`${filterPattern}\`

## Error Message
\`${errorMessage}\`

## Context Information
${contextInfo}

## Instructions
1. Understand the intent of the original filter pattern
2. Fix it according to CloudWatch Logs Insights syntax rules
3. Especially check if strings are enclosed in quotes and regular expressions are properly enclosed in /slashes/
4. Return only the fixed filter pattern. No explanation needed.

Fixed filter pattern:
`;

      // Call Bedrock model to fix the pattern
      const response = await bedrockService.converse(prompt);
      
      // Extract the fixed filter pattern from the response
      // Remove any extra explanations or markdown symbols
      let fixedPattern = response.trim();
      
      // Remove backticks, code block symbols, etc.
      fixedPattern = fixedPattern.replace(/```[a-z]*\n?|\n?```|`/g, '');
      
      // Remove leading and trailing whitespace
      fixedPattern = fixedPattern.trim();
      
      logger.info("Bedrock fixed filter pattern", { 
        originalPattern: filterPattern, 
        fixedPattern: fixedPattern 
      });
      
      return fixedPattern;
    } catch (error) {
      // If Bedrock call fails, return the original pattern
      logger.error("Error fixing filter pattern with Bedrock", { error });
      return filterPattern;
    }
  }
  
  private formatLogsResults(results: LogResults): string {
    if (!results || results.length === 0) {
      return this.i18n.translate("logsNoResults");
    }
    
    let output = this.i18n.translate("logsResultsTitle");
    output += this.i18n.formatTranslation("logsTotalFound", results.length);
    
    // Detect error patterns
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
      output += this.i18n.formatTranslation("logsErrorLogsTitle", errorLogs.length);
      errorLogs.forEach((log, index) => {
        if (index < 10) { // Show details for only the first 10 items
          const timestampField = log.find((field: LogField) => field.field === "@timestamp");
          const messageField = log.find((field: LogField) => field.field === "@message");
          
          const timestamp = timestampField ? timestampField.value : "";
          const message = messageField ? messageField.value : "";
          
          output += `**${timestamp}**\n\`\`\`\n${message}\n\`\`\`\n\n`;
        }
      });
      
      if (errorLogs.length > 10) {
        output += this.i18n.formatTranslation("logsMoreErrorLogs", errorLogs.length - 10);
      }
    }
    
    // Timeline analysis
    output += this.i18n.translate("logsTimelineTitle");
    
    // Sort by timestamp
    const sortedLogs = [...results].sort((a, b) => {
      const aTimeField = a.find((field: LogField) => field.field === "@timestamp");
      const bTimeField = b.find((field: LogField) => field.field === "@timestamp");
      
      const aTime = aTimeField?.value || "";
      const bTime = bTimeField?.value || "";
      
      const aDate = aTime ? new Date(aTime) : new Date(0);
      const bDate = bTime ? new Date(bTime) : new Date(0);
      
      return aDate.getTime() - bDate.getTime();
    });
    
    // Show first and last logs
    if (sortedLogs.length > 0) {
      const firstLog = sortedLogs[0];
      const lastLog = sortedLogs[sortedLogs.length - 1];
      
      const firstTimeField = firstLog.find((field: LogField) => field.field === "@timestamp");
      const lastTimeField = lastLog.find((field: LogField) => field.field === "@timestamp");
      
      const firstTimestamp = firstTimeField ? firstTimeField.value : "";
      const lastTimestamp = lastTimeField ? lastTimeField.value : "";
      
      if (firstTimestamp && lastTimestamp) {
        output += this.i18n.formatTranslation("logsFirstLog", firstTimestamp);
        output += this.i18n.formatTranslation("logsLastLog", lastTimestamp);
        
        const firstDate = new Date(firstTimestamp);
        const lastDate = new Date(lastTimestamp);
        
        if (!isNaN(firstDate.getTime()) && !isNaN(lastDate.getTime())) {
          output += this.i18n.formatTranslation("logsDuration", lastDate.getTime() - firstDate.getTime());
        } else {
          output += this.i18n.translate("logsDurationNotCalculable");
        }
      }
    }
    
    // Extract representative log patterns (simplified version)
    output += this.i18n.translate("logsSamplesTitle");
    
    // Show up to 5 samples
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
}

// Function that can be called externally
export const logsToolExecutor = async (params: {
  filterPattern?: string;
  startDate: string;
  endDate: string;
  limit?: number;
  i18n?: I18nProvider;
  configService?: ConfigurationService;
}): Promise<string> => {
  const logsTool = new LogsTool(params.i18n, params.configService);
  return await logsTool.execute(params);
};
