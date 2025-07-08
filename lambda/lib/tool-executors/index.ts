import { ToolRegistry } from "../tools-registry.js";
import { metricsToolExecutor } from "./metrics-tool.js";
import { logsToolExecutor } from "./logs-tool.js";
import { athenaLogToolExecutor, LogType } from "./athena-log-tool.js";
import { xrayToolExecutor } from "./xray-tool.js";
import { kbToolExecutor } from "./kb-tool.js";
import { I18nProvider } from "../messaging/providers/i18n-provider.js";
import { getI18nProvider } from "../messaging/providers/i18n-factory.js";

export function registerAllTools(
  toolRegistry: ToolRegistry, 
  globalParams: {
    startDate: string;
    endDate: string;
  },
  i18n?: I18nProvider // Add optional i18n parameter
): void {
  // Use provided i18n instance or get from factory
  const i18nInstance = i18n || getI18nProvider();
  
  // Metrics tool
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
        endDate: globalParams.endDate,
        i18n: i18nInstance // Pass i18n instance
      });
    }
  });
  
  // Logs tool
  toolRegistry.registerTool({
    name: "logs_tool",
    description: `設定されたCloudWatch Logsからログを取得して分析します。フィルターパターンを指定できます。

# CloudWatch Logs Insightsフィルター構文ガイド

## 基本的なフィルター構文
- @message like 'error' - エラーを含むメッセージ
- @message like /Exception/ - 正規表現でExceptionを含むメッセージ
- level = 'ERROR' - 特定のフィールドの値でフィルタリング
- @timestamp > '2023-01-01' - 日付でフィルタリング

## 演算子
- like/not like - 部分一致（大文字小文字を区別しない）
- =, !=, <, >, <=, >= - 比較演算子
- and, or, not - 論理演算子

## 構文ルール
- 文字列は '単一引用符' または "二重引用符" で囲む（一貫して使用）
- 正規表現は /スラッシュ/ で囲む
- 複雑な条件は (括弧) でグループ化
- 特殊文字は \\ でエスケープ

## 例
- @message like 'error' and status >= 500
- (@message like 'timeout' or @message like 'connection refused')
- @message like /ERROR.*timeout/

詳細: https://docs.aws.amazon.com/ja_jp/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html`,
    parameters: [
      {
        name: "filterPattern",
        type: "string",
        description: "CloudWatch Logs Insightsのフィルターパターン（例: '@message like \"error\"'）",
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
      // Type assertion
      const typedParams = params as {
        filterPattern?: string;
        limit?: number;
      };
      return await logsToolExecutor({
        ...typedParams,
        startDate: globalParams.startDate,
        endDate: globalParams.endDate,
        i18n: i18nInstance // Pass i18n instance
      });
    }
  });
  
  // Audit log tool
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
      return await athenaLogToolExecutor({
        ...params,
        startDate: globalParams.startDate,
        endDate: globalParams.endDate,
        logType: LogType.CLOUDTRAIL,
        i18n: i18nInstance // Pass i18n instance
      });
    }
  });
  
  // ALB log tool
  toolRegistry.registerTool({
    name: "alb_log_tool",
    description: "ALBアクセスログを取得して分析します。ステータスコード、クライアントIP、パスなどでフィルタリングできます。",
    parameters: [
      {
        name: "targetGroups",
        type: "string[]",
        description: "フィルタリングするターゲットグループARNの配列",
        required: false
      },
      {
        name: "statusCodes",
        type: "string[]",
        description: "フィルタリングするステータスコードの配列（例: ['200', '404', '500']）",
        required: false
      },
      {
        name: "clientIps",
        type: "string[]",
        description: "フィルタリングするクライアントIPの配列",
        required: false
      },
      {
        name: "paths",
        type: "string[]",
        description: "フィルタリングするリクエストパスの配列（例: ['/api', '/login']）",
        required: false
      },
      {
        name: "userAgents",
        type: "string[]",
        description: "フィルタリングするユーザーエージェントの配列",
        required: false
      },
    ],
    execute: async (params: {
      targetGroups?: string[];
      statusCodes?: string[];
      clientIps?: string[];
      paths?: string[];
      userAgents?: string[];
      region?: string;
    }) => {
      return await athenaLogToolExecutor({
        ...params,
        startDate: globalParams.startDate,
        endDate: globalParams.endDate,
        logType: LogType.ALB,
        i18n: i18nInstance // Pass i18n instance
      });
    }
  });
  
  // X-Ray tool
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
        endDate: globalParams.endDate,
        i18n: i18nInstance // Pass i18n instance
      });
    }
  });
  
  // Knowledge Base tool
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
      // Type assertion
      const typedParams = params as {
        query: string;
        maxResults?: number;
      };
      return await kbToolExecutor({
        ...typedParams,
        i18n: i18nInstance // Pass i18n instance
      });
    }
  });
  
  // Final answer tool
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
      // This tool doesn't actually execute anything, it's specially handled by AgentEngine
      const typedParams = params as {
        content: string;
      };
      return `最終回答を生成します: ${typedParams.content.substring(0, 50)}...`;
    }
  });
}
