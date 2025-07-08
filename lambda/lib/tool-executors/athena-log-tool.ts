import { AWSServiceFactory } from "../../lib/aws/index.js";
import { logger } from "../logger.js";
import { I18nProvider } from "../messaging/providers/i18n-provider.js";
import { getI18nProvider } from "../messaging/providers/i18n-factory.js";

// Log type enumeration
export enum LogType {
  CLOUDTRAIL = 'cloudtrail',
  ALB = 'alb'
}

// Base parameters interface
export interface BaseLogQueryParams {
  startDate: string;
  endDate: string;
  region?: string;
  i18n?: I18nProvider;
  logType: LogType;
}

// CloudTrail log specific parameters
export interface CloudTrailLogQueryParams extends BaseLogQueryParams {
  logType: LogType.CLOUDTRAIL;
  services?: string[];
  users?: string[];
  eventNames?: string[];
}

// ALB access log specific parameters
export interface AlbLogQueryParams extends BaseLogQueryParams {
  logType: LogType.ALB;
  targetGroups?: string[];
  statusCodes?: string[];
  clientIps?: string[];
  paths?: string[];
  userAgents?: string[];
}

// Union type for all log query parameters
export type LogQueryParams = CloudTrailLogQueryParams | AlbLogQueryParams;

// Base abstract class for Athena log tools
export abstract class BaseAthenaLogTool {
  protected i18n: I18nProvider;
  
  constructor(i18n?: I18nProvider) {
    // Use provided i18n instance or get from factory
    this.i18n = i18n || getI18nProvider();
  }
  
  // Common execution method
  async execute(params: BaseLogQueryParams): Promise<string> {
    // Update i18n if provided in params
    if (params.i18n) {
      this.i18n = params.i18n;
    }
    
    logger.info(`Executing ${this.getLogTypeName()} log tool`, { params });
    
    try {
      // Get common environment variables
      const databaseName = process.env.ATHENA_DATABASE_NAME;
      const athenaQueryOutputLocation = `s3://${process.env.ATHENA_QUERY_BUCKET}/`;
      const logTableName = this.getLogTableName();
      
      if (!databaseName || !logTableName) {
        // Use specific translation key based on log type
        const configErrorKey = this.getLogTypeName() === 'CloudTrail' 
          ? "auditLogTableNotConfigured" 
          : "albLogTableNotConfigured";
        return this.i18n.translate(configErrorKey);
      }
      
      // Build query using log type specific implementation
      const { query, queryParams } = this.buildQuery(params);
      
      // Execute query to Athena (common logic)
      const athenaService = AWSServiceFactory.getAthenaService();
      // Cast queryParams to string[] as Athena service expects string parameters
      const res = await athenaService.queryToAthena(
        query,
        { Database: databaseName },
        queryParams as string[],
        athenaQueryOutputLocation,
      );
      
      // Format results using log type specific implementation
      return this.formatResults(res.result);
    } catch (error) {
      logger.error(`Error in ${this.getLogTypeName()} log tool`, { error });
      // Use specific translation key based on log type
      const errorKey = this.getLogTypeName() === 'CloudTrail' 
        ? "auditLogQueryError" 
        : "albLogQueryError";
      return this.i18n.formatTranslation(
        errorKey, 
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  
  // Abstract methods to be implemented by subclasses
  protected abstract getLogTypeName(): string;
  protected abstract getLogTableName(): string | undefined;
  protected abstract getI18nPrefix(): string;
  protected abstract buildQuery(params: BaseLogQueryParams): { query: string; queryParams: unknown[] };
  protected abstract formatResults(csvResults: string): string;
}

// CloudTrail log implementation
export class CloudTrailLogTool extends BaseAthenaLogTool {
  protected getLogTypeName(): string {
    return 'CloudTrail';
  }
  
  protected getLogTableName(): string | undefined {
    return process.env.CLOUD_TRAIL_LOG_TABLE_NAME;
  }
  
  protected getI18nPrefix(): string {
    return 'auditLog'; // Maintain existing translation keys
  }
  
  protected buildQuery(params: BaseLogQueryParams): { query: string; queryParams: unknown[] } {
    const cloudTrailParams = params as CloudTrailLogQueryParams;
    
    // Build CloudTrail specific query
    let query = `SELECT eventtime, eventsource, eventname, awsregion, sourceipaddress, errorcode, errormessage 
                FROM ${this.getLogTableName()} 
                WHERE eventtime BETWEEN ? AND ?`;
    
    const queryParams: unknown[] = [params.startDate, params.endDate];
    
    // Add filters
    if (params.region) {
      query += " AND awsregion = ?";
      queryParams.push(params.region);
    }
    
    if (cloudTrailParams.services && cloudTrailParams.services.length > 0) {
      const serviceConditions = cloudTrailParams.services.map(() => "eventsource LIKE ?").join(" OR ");
      query += ` AND (${serviceConditions})`;
      cloudTrailParams.services.forEach(service => queryParams.push(`%${service}%`));
    }
    
    if (cloudTrailParams.eventNames && cloudTrailParams.eventNames.length > 0) {
      const eventConditions = cloudTrailParams.eventNames.map(() => "eventname = ?").join(" OR ");
      query += ` AND (${eventConditions})`;
      cloudTrailParams.eventNames.forEach(event => queryParams.push(event));
    }
    
    if (cloudTrailParams.users && cloudTrailParams.users.length > 0) {
      const userConditions = cloudTrailParams.users.map(() => "useridentity.username = ?").join(" OR ");
      query += ` AND (${userConditions})`;
      cloudTrailParams.users.forEach(user => queryParams.push(user));
    }
    
    query += " ORDER BY eventtime DESC LIMIT 100";
    
    return { query, queryParams };
  }
  
  protected formatResults(csvResults: string): string {
    if (!csvResults || csvResults.trim() === "") {
      return this.i18n.translate("auditLogNoResults");
    }
    
    let output = this.i18n.translate("auditLogAnalysisTitle");
    
    // Parse CSV
    const lines = csvResults.trim().split("\n");
    if (lines.length <= 1) {
      return output + this.i18n.translate("auditLogNoLogsFound");
    }
    
    const headers = lines[0].split(",");
    const rows = lines.slice(1).map(line => {
      const values = line.split(",");
      return headers.reduce((obj: Record<string, string>, header, index) => {
        obj[header] = values[index] || "";
        return obj;
      }, {});
    });
    
    output += this.i18n.formatTranslation("auditLogTotalFound", rows.length);
    
    // Audit log count by service
    const serviceAuditLogs: Record<string, number> = {};
    rows.forEach(row => {
      const service = row.eventsource || "unknown";
      serviceAuditLogs[service] = (serviceAuditLogs[service] || 0) + 1;
    });
    
    output += this.i18n.translate("auditLogServiceCountTitle");
    Object.entries(serviceAuditLogs)
      .sort((a, b) => b[1] - a[1])
      .forEach(([service, count]) => {
        output += this.i18n.formatTranslation("auditLogServiceCount", service, count);
      });
    
    output += "\n";
    
    // Audit logs with errors
    const errorAuditLogs = rows.filter(row => row.errorcode && row.errorcode !== "null" && row.errorcode !== "");
    
    if (errorAuditLogs.length > 0) {
      output += this.i18n.formatTranslation("auditLogErrorsTitle", errorAuditLogs.length);
      errorAuditLogs.forEach(auditlog => {
        output += this.i18n.formatTranslation(
          "auditLogErrorDetail",
          auditlog.eventtime,
          auditlog.eventsource,
          auditlog.eventname,
          auditlog.errorcode,
          auditlog.errormessage
        );
      });
    }
    
    // Important audit logs
    // TODO: Parameterize important audit logs and move them outside
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
      output += this.i18n.translate("auditLogImportantTitle");
      importantAuditLogs.forEach(auditlog => {
        output += this.i18n.formatTranslation(
          "auditLogImportantDetail",
          auditlog.eventtime,
          auditlog.eventsource,
          auditlog.eventname,
          auditlog.awsregion,
          auditlog.sourceipaddress
        );
      });
    }
    
    // Timeline analysis
    output += this.i18n.translate("auditLogTimelineTitle");
    
    if (rows.length > 0) {
      const firstAuditLog = rows[rows.length - 1]; // Oldest audit log (because they are sorted in reverse order)
      const lastAuditLog = rows[0]; // Newest audit log
      
      output += this.i18n.formatTranslation(
        "auditLogFirstLog",
        firstAuditLog.eventtime,
        firstAuditLog.eventsource,
        firstAuditLog.eventname
      );
      output += this.i18n.formatTranslation(
        "auditLogLastLog",
        lastAuditLog.eventtime,
        lastAuditLog.eventsource,
        lastAuditLog.eventname
      );
    }
    
    return output;
  }
}

// ALB access log implementation
export class AlbLogTool extends BaseAthenaLogTool {
  protected getLogTypeName(): string {
    return 'ALB';
  }
  
  protected getLogTableName(): string | undefined {
    return process.env.ALB_ACCESS_LOG_TABLE_NAME;
  }
  
  protected getI18nPrefix(): string {
    return 'albLog';
  }
  
  protected buildQuery(params: BaseLogQueryParams): { query: string; queryParams: unknown[] } {
    const albParams = params as AlbLogQueryParams;
    
    // Build ALB specific query
    let query = `SELECT 
                  time,
                  client_ip,
                  request_method,
                  request_uri,
                  status,
                  target_status_code,
                  target_group_arn,
                  response_processing_time,
                  user_agent
                FROM ${this.getLogTableName()} 
                WHERE time BETWEEN ? AND ?`;
    
    const queryParams: unknown[] = [params.startDate, params.endDate];
    
    // Add ALB specific filters
    if (params.region) {
      query += " AND region = ?";
      queryParams.push(params.region);
    }
    
    if (albParams.targetGroups && albParams.targetGroups.length > 0) {
      const targetGroupConditions = albParams.targetGroups.map(() => "target_group_arn LIKE ?").join(" OR ");
      query += ` AND (${targetGroupConditions})`;
      albParams.targetGroups.forEach(tg => queryParams.push(`%${tg}%`));
    }
    
    if (albParams.statusCodes && albParams.statusCodes.length > 0) {
      const statusConditions = albParams.statusCodes.map(() => "status = ?").join(" OR ");
      query += ` AND (${statusConditions})`;
      albParams.statusCodes.forEach(status => queryParams.push(status));
    }
    
    if (albParams.clientIps && albParams.clientIps.length > 0) {
      const ipConditions = albParams.clientIps.map(() => "client_ip = ?").join(" OR ");
      query += ` AND (${ipConditions})`;
      albParams.clientIps.forEach(ip => queryParams.push(ip));
    }
    
    if (albParams.paths && albParams.paths.length > 0) {
      const pathConditions = albParams.paths.map(() => "request_uri LIKE ?").join(" OR ");
      query += ` AND (${pathConditions})`;
      albParams.paths.forEach(path => queryParams.push(`%${path}%`));
    }
    
    if (albParams.userAgents && albParams.userAgents.length > 0) {
      const uaConditions = albParams.userAgents.map(() => "user_agent LIKE ?").join(" OR ");
      query += ` AND (${uaConditions})`;
      albParams.userAgents.forEach(ua => queryParams.push(`%${ua}%`));
    }
    
    query += " ORDER BY time DESC LIMIT 100";
    
    return { query, queryParams };
  }
  
  protected formatResults(csvResults: string): string {
    if (!csvResults || csvResults.trim() === "") {
      return this.i18n.translate("albLogNoResults");
    }
    
    let output = this.i18n.translate("albLogAnalysisTitle");
    
    // Parse CSV
    const lines = csvResults.trim().split("\n");
    if (lines.length <= 1) {
      return output + this.i18n.translate("albLogNoLogsFound");
    }
    
    const headers = lines[0].split(",");
    const rows = lines.slice(1).map(line => {
      const values = line.split(",");
      return headers.reduce((obj: Record<string, string>, header, index) => {
        obj[header] = values[index] || "";
        return obj;
      }, {});
    });
    
    output += this.i18n.formatTranslation("albLogTotalFound", rows.length);
    
    // Status code analysis
    const statusCounts: Record<string, number> = {};
    rows.forEach(row => {
      const status = row.status || "unknown";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    output += this.i18n.translate("albLogStatusCodeTitle");
    Object.entries(statusCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([status, count]) => {
        output += this.i18n.formatTranslation("albLogStatusCodeCount", status, count);
      });
    
    output += "\n";
    
    // Error logs (4xx, 5xx)
    const errorLogs = rows.filter(row => {
      const status = parseInt(row.status);
      return status >= 400;
    });
    
    if (errorLogs.length > 0) {
      output += this.i18n.formatTranslation("albLogErrorsTitle", errorLogs.length);
      errorLogs.forEach(log => {
        output += this.i18n.formatTranslation(
          "albLogErrorDetail",
          log.time,
          log.client_ip,
          log.request_method,
          log.request_uri,
          log.status,
          log.target_status_code
        );
      });
    }
    
    // Popular paths analysis
    const pathCounts: Record<string, number> = {};
    rows.forEach(row => {
      const path = row.request_uri || "unknown";
      pathCounts[path] = (pathCounts[path] || 0) + 1;
    });
    
    output += this.i18n.translate("albLogPopularPathsTitle");
    Object.entries(pathCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10) // Top 10 only
      .forEach(([path, count]) => {
        output += this.i18n.formatTranslation("albLogPathCount", path, count);
      });
    
    output += "\n";
    
    // Response time analysis
    const responseTimes = rows.map(row => parseFloat(row.response_processing_time)).filter(time => !isNaN(time));
    if (responseTimes.length > 0) {
      const avgTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const maxTime = Math.max(...responseTimes);
      const minTime = Math.min(...responseTimes);
      
      output += this.i18n.translate("albLogResponseTimeTitle");
      output += this.i18n.formatTranslation("albLogAvgResponseTime", avgTime.toFixed(3));
      output += this.i18n.formatTranslation("albLogMaxResponseTime", maxTime.toFixed(3));
      output += this.i18n.formatTranslation("albLogMinResponseTime", minTime.toFixed(3));
    }
    
    // Timeline analysis
    output += this.i18n.translate("albLogTimelineTitle");
    
    if (rows.length > 0) {
      const firstLog = rows[rows.length - 1]; // Oldest log
      const lastLog = rows[0]; // Newest log
      
      output += this.i18n.formatTranslation(
        "albLogFirstRequest",
        firstLog.time,
        firstLog.request_method,
        firstLog.request_uri
      );
      output += this.i18n.formatTranslation(
        "albLogLastRequest",
        lastLog.time,
        lastLog.request_method,
        lastLog.request_uri
      );
    }
    
    return output;
  }
}

// Factory class to create appropriate log tool instance
export class AthenaLogToolFactory {
  static createLogTool(logType: LogType, i18n?: I18nProvider): BaseAthenaLogTool {
    switch (logType) {
      case LogType.CLOUDTRAIL:
        return new CloudTrailLogTool(i18n);
      case LogType.ALB:
        return new AlbLogTool(i18n);
      default:
        throw new Error(`Unsupported log type: ${logType}`);
    }
  }
}

// Function that can be called externally
export const athenaLogToolExecutor = async (params: LogQueryParams): Promise<string> => {
  const logTool = AthenaLogToolFactory.createLogTool(params.logType, params.i18n);
  return await logTool.execute(params);
};
