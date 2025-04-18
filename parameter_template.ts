import { Environment } from "aws-cdk-lib";

export type Language = "ja" | "en";
export type SlashCommands = {
  insight: boolean;
  findingsReport: boolean;
};

export interface AppParameter {
  env?: Environment;
  language: Language;
  envName: string;
  qualityModelId: string;
  fastModelId: string;
  topicArn: string; // SNS Topic Arn that is connected to AWS Chatbot
  architectureDescription: string;
  cwLogsLogGroups: string[];
  cwLogsInsightQuery: string;
  databaseName?: string;
  albAccessLogTableName?: string;
  cloudTrailLogTableName?: string;
  xrayTrace: boolean;
  insight: boolean;
  findingsReport: boolean;
  detectorId?: string;
  knowledgeBase?: boolean;
  reranking: boolean;
  rerankModelId?: string;
}

// Parameters for Dev Account
export const devParameter: AppParameter = {
  env: {
    account: "123456789012",
    region: "us-east-1",
  },
  language: "ja",
  envName: "Development",
  qualityModelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  fastModelId: "anthropic.claude-3-haiku-20240307-v1:0",
  topicArn: "arn:aws:sns:us-east-1:123456789012:MonitoringAlarmTopicXXXXXXXX-xxxxxxxxxxxx",
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
  insight: true,
  findingsReport: true,
  detectorId: "ccc7636809ab9ef126976785ad0df79e",
  knowledgeBase: true,
  reranking: false,
};
