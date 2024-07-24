import { Environment } from "aws-cdk-lib";

export type Language = "ja" | "en";

export interface AppParameter {
  env?: Environment;
  language: Language;
  envName: string;
  modelId: string;
  cwLogsLogGroups: string[];
  cwLogsInsightQuery: string;
  databaseName?: string;
  albAccessLogTableName?: string;
  cloudTrailLogTableName?: string;
  xrayTrace: boolean;
  topicArn?: string; // SNS Topic Arn that is connected to AWS Chatbot
}

// Parameters for Dev Account
export const devParameter: AppParameter = {
  env: {
    account: "123456789012",
    region: "us-east-1",
  },
  language: "ja",
  envName: "Development",
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  cwLogsLogGroups: [
    "EcsAppApiLogGroupXXXXXXXX-xxxxxxxxxxxx",
    "/aws/ecs/containerinsights/EcsAppClusterXXXXXXXX-xxxxxxxxxxxx/performance",
  ],
  // It's just sample query. Please you optimize to your situation.
  cwLogsInsightQuery: "fields @message | limit 100",
  databaseName: "athenadatacatalog1111111",
  albAccessLogTableName: "alb_access_logs",
  cloudTrailLogTableName: "cloud_trail_logs",
  xrayTrace: true,
  topicArn:
    "arn:aws:sns:us-east-1:123456789012:MonitoringAlarmTopicXXXXXXXX-xxxxxxxxxxxx",
};
