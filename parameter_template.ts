import { Environment } from "aws-cdk-lib";

export type Language = "ja" | "en";
export type SlackCommands = {insight: boolean};

export interface AppParameter {
  env?: Environment;
  language: Language;
  envName: string;
  modelId: string;
  slackAppTokenKey: string;
  slackSigningSecretKey: string;
  architectureDescription: string;
  cwLogsLogGroups: string[];
  cwLogsInsightQuery: string;
  databaseName?: string;
  albAccessLogTableName?: string;
  cloudTrailLogTableName?: string;
  xrayTrace: boolean;
  slackCommands: SlackCommands;
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
  slackAppTokenKey: "SlackAppToken",
  slackSigningSecretKey: "SlackSigningSecret",
  architectureDescription: "あなたが担当するワークロードは、CloudFront、ALB、ECS on EC2、DynamoDBで構成されており、ECS on EC2上にSpringアプリケーションがデプロイされています。",
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
  slackCommands: {
    insight: false
  }
};
