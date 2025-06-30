// ESMでは拡張子が必要
import { ToolRegistry } from "../../lib/tools-registry";
import { metricsToolExecutor } from "./metrics-tool";
import { logsToolExecutor } from "./logs-tool";
import { auditLogToolExecutor } from "./audit-log-tool";
import { xrayToolExecutor } from "./xray-tool";
import { kbToolExecutor } from "./kb-tool";

export function registerAllTools(toolRegistry: ToolRegistry, globalParams: {
  startDate: string;
  endDate: string;
}): void {
  // メトリクスツール
  toolRegistry.registerTool({
    name: "metrics_tool",
    description: "CloudWatchメトリクスを取得して分析します。特定のメトリクス名や名前空間でフィルタリングできます。名前空間を指定しない場合は、一般的なAWSサービスの名前空間から自動的に取得します。",
    parameters: [
      {
        name: "metricNames",
        type: "string[]",
        description: "取得するメトリクス名の配列（例: ['Latency', 'ErrorRate']）",
        required: false
      },
      {
        name: "namespaces",
        type: "string[]",
        description: "取得するメトリクスの名前空間の配列（例: ['AWS/EC2', 'AWS/Lambda']）。指定しない場合は一般的なAWSサービスの名前空間を使用。",
        required: false
      },
      {
        name: "period",
        type: "number",
        description: "メトリクスの期間（秒）。デフォルトは60秒。",
        required: false
      },
      {
        name: "stat",
        type: "string",
        description: "集計方法（Average, Sum, Minimum, Maximum, SampleCount）。デフォルトはAverage。",
        required: false
      }
    ],
    execute: async (params: {
      metricNames?: string[];
      namespaces?: string[];
      period?: number;
      stat?: string;
    }) => {
      return await metricsToolExecutor({
        ...params,
        startDate: globalParams.startDate,
        endDate: globalParams.endDate
      });
    }
  });
  
  // ログツール
  toolRegistry.registerTool({
    name: "logs_tool",
    description: "設定されたCloudWatch Logsからログを取得して分析します。フィルターパターンを指定できます。",
    parameters: [
      {
        name: "filterPattern",
        type: "string",
        description: "CloudWatch Logs Insightsのフィルターパターン（例: 'error'）",
        required: false
      },
      {
        name: "limit",
        type: "number",
        description: "取得するログの最大数。デフォルトは100。",
        required: false
      }
    ],
    execute: async (params: Record<string, unknown>) => {
      // 型アサーション
      const typedParams = params as {
        filterPattern?: string;
        limit?: number;
      };
      return await logsToolExecutor({
        ...typedParams,
        startDate: globalParams.startDate,
        endDate: globalParams.endDate
      });
    }
  });
  
  // 監査ログツール
  toolRegistry.registerTool({
    name: "audit_log_tool",
    description: "CloudTrailログからAuditログを取得して分析します。特定のサービスやイベント名でフィルタリングできます。",
    parameters: [
      {
        name: "services",
        type: "string[]",
        description: "フィルタリングするサービス名の配列（例: ['ec2', 'lambda']）",
        required: false
      },
      {
        name: "eventNames",
        type: "string[]",
        description: "フィルタリングするイベント名の配列（例: ['CreateFunction', 'RunInstances']）",
        required: false
      },
      {
        name: "users",
        type: "string[]",
        description: "フィルタリングするユーザー名の配列",
        required: false
      },
    ],
    execute: async (params: {
      services?: string[];
      eventNames?: string[];
      users?: string[];
      region?: string;
    }) => {
      return await auditLogToolExecutor({
        ...params,
        startDate: globalParams.startDate,
        endDate: globalParams.endDate
      });
    }
  });
  
  // X-Rayツール
  toolRegistry.registerTool({
    name: "xray_tool",
    description: "X-Rayからトレース情報を取得して分析します。エラーのあるトレースや遅いトレースを特定します。X-Rayトレースが有効な場合のみ使用できます。",
    parameters: [
      {
        name: "filterExpression",
        type: "string",
        description: "X-Rayのフィルター式",
        required: false
      }
    ],
    execute: async (params: {
      filterExpression?: string;
    }) => {
      return await xrayToolExecutor({
        ...params,
        startDate: globalParams.startDate,
        endDate: globalParams.endDate
      });
    }
  });
  
  // Knowledge Baseツール
  toolRegistry.registerTool({
    name: "kb_tool",
    description: "Knowledge Baseからドキュメントを検索します。障害対応のナレッジや過去の事例を参照できます。Knowledge Baseが有効な場合のみ使用できます。",
    parameters: [
      {
        name: "query",
        type: "string",
        description: "検索クエリ",
        required: true
      },
      {
        name: "maxResults",
        type: "number",
        description: "取得する結果の最大数。デフォルトは3。",
        required: false
      }
    ],
    execute: async (params: Record<string, unknown>) => {
      // 型アサーション
      const typedParams = params as {
        query: string;
        maxResults?: number;
      };
      return await kbToolExecutor(typedParams);
    }
  });
  
  // 最終回答ツール
  toolRegistry.registerTool({
    name: "final_answer",
    description: "障害分析の最終回答を生成します。十分な情報が集まり、根本原因と解決策が特定できた場合のみ使用してください。",
    parameters: [
      {
        name: "content",
        type: "string",
        description: "最終回答の内容",
        required: true
      }
    ],
    execute: async (params: Record<string, unknown>) => {
      // このツールは実際には何も実行せず、AgentEngineによって特別に処理される
      const typedParams = params as {
        content: string;
      };
      return `最終回答を生成します: ${typedParams.content.substring(0, 50)}...`;
    }
  });
}
