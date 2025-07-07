import { AWSServiceFactory } from "../../lib/aws/index.js";
import { logger } from "../logger.js";
import { I18nProvider } from "../messaging/providers/i18n-provider.js";
import { getI18nProvider } from "../messaging/providers/i18n-factory.js";

export class AuditLogTool {
  private i18n: I18nProvider;
  
  constructor(i18n?: I18nProvider) {
    // Use provided i18n instance or get from factory
    this.i18n = i18n || getI18nProvider();
  }
  
  async execute(params: {
    startDate: string;
    endDate: string;
    services?: string[];
    users?: string[];
    eventNames?: string[];
    region?: string;
    i18n?: I18nProvider;
  }): Promise<string> {
    // Update i18n if provided in params
    if (params.i18n) {
      this.i18n = params.i18n;
    }
    logger.info("Executing audit log tool", { params });
    
    try {
      // Get environment variables
      const databaseName = process.env.ATHENA_DATABASE_NAME;
      const cloudTrailLogTableName = process.env.CLOUD_TRAIL_LOG_TABLE_NAME;
      const athenaQueryOutputLocation = `s3://${process.env.ATHENA_QUERY_BUCKET}/`;
      const region = process.env.AWS_REGION; // Region is fixed
      
      if (!databaseName || !cloudTrailLogTableName) {
        return this.i18n.translate("auditLogTableNotConfigured");
      }
      
      // Build the query
      let query = `SELECT eventtime, eventsource, eventname, awsregion, sourceipaddress, errorcode, errormessage 
                  FROM ${cloudTrailLogTableName} 
                  WHERE eventtime BETWEEN ? AND ?`;
      
      const queryParams = [params.startDate, params.endDate];
      
      // Add filters
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
      
      // Execute query to Athena
      const athenaService = AWSServiceFactory.getAthenaService();
      const res = await athenaService.queryToAthena(
        query,
        { Database: databaseName },
        queryParams,
        athenaQueryOutputLocation,
      );
      
      // Format results in a readable format
      return this.formatAuditLogHistoryResults(res.result);
    } catch (error) {
      logger.error("Error in change history tool", { error });
      return this.i18n.formatTranslation("auditLogQueryError", error instanceof Error ? error.message : String(error));
    }
  }
  
  private formatAuditLogHistoryResults(csvResults: string): string {
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

// Create tool executor instance
const auditLogTool = new AuditLogTool();

// Function that can be called externally
export const auditLogToolExecutor = async (params: {
  startDate: string;
  endDate: string;
  services?: string[];
  users?: string[];
  eventNames?: string[];
  region?: string;
  i18n?: I18nProvider;
}): Promise<string> => {
  return await auditLogTool.execute(params);
};
