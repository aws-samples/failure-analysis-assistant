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
  slashCommands: SlashCommands;
  detectorId?: string;
}

export const developParameter: AppParameter = {
  env: {
    account: "654654344320",
    region: "us-east-1",
  },
  language: "ja",
  envName: "Development",
  // modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  modelId: "anthropic.claude-3-haiku-20240307-v1:0",
  slackAppTokenKey: "SlackAppToken",
  slackSigningSecretKey: "SlackSigningSecret",
  architectureDescription: `
  あなたが担当するワークロードは、CloudFront、ALB、ECS on EC2、DynamoDBで構成されており、
  ECS on EC2上にSpringアプリケーションがデプロイされています。`,
  cwLogsLogGroups: [
    "Dev-TargetEcsApp-EcsAppApiLogGroup53F0BB6F-VwapRzMXwd2J",
    "/aws/ecs/containerinsights/Dev-TargetEcsApp-EcsAppCluster7C7DF57B-vc2x3xgyPKvK/performance",
  ],
  cwLogsInsightQuery: "fields @message | limit 100",
  databaseName: "devtargetmonitoringathenadatacatalogc5576921",
  albAccessLogTableName: "alb_access_logs",
  cloudTrailLogTableName: "cloud_trail_logs",
  xrayTrace: true,
  slashCommands: {
    insight: true,
    findingsReport: true,
  },
  detectorId: "ccc7636809ab9ef126976785ad0df79e"
};

export const stageParameter: AppParameter = {
  env: {
    account: "654654344320",
    region: "us-east-1",
  },
  language: "ja",
  envName: "Stage",
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  slackAppTokenKey: "SlackAppTokenStage",
  slackSigningSecretKey: "SlackSigningSecretStage",
  architectureDescription: "あなたが担当するワークロードは、CloudFront、ALB、ECS on EC2、DynamoDBで構成されており、ECS on EC2上にSpringアプリケーションがデプロイされています。",
  cwLogsLogGroups: [
    "Dev-TargetEcsApp-EcsAppApiLogGroup53F0BB6F-VwapRzMXwd2J",
    "/aws/ecs/containerinsights/Dev-TargetEcsApp-EcsAppCluster7C7DF57B-vc2x3xgyPKvK/performance",
  ],
  cwLogsInsightQuery: "fields @message | limit 100",
  databaseName: "devtargetmonitoringathenadatacatalogc5576921",
  albAccessLogTableName: "alb_access_logs",
  cloudTrailLogTableName: "cloud_trail_logs",
  xrayTrace: true,
  slashCommands: {
    insight: true,
    findingsReport: true,
  },
  detectorId: "ccc7636809ab9ef126976785ad0df79e"
}

export const prodParameter: AppParameter = {
  env: {
    account: "654654344320",
    region: "us-east-1",
  },
  language: "ja",
  envName: "Production",
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  slackAppTokenKey: "SlackAppTokenProd",
  slackSigningSecretKey: "SlackSigningSecretProd",
  architectureDescription: "あなたが担当するワークロードは、CloudFront、ALB、ECS on EC2、DynamoDBで構成されており、ECS on EC2上にSpringアプリケーションがデプロイされています。",
  cwLogsLogGroups: [
    "Dev-TargetEcsApp-EcsAppApiLogGroup53F0BB6F-VwapRzMXwd2J",
    "/aws/ecs/containerinsights/Dev-TargetEcsApp-EcsAppCluster7C7DF57B-vc2x3xgyPKvK/performance",
  ],
  cwLogsInsightQuery: "fields @message | limit 100",
  databaseName: "devtargetmonitoringathenadatacatalogc5576921",
  albAccessLogTableName: "alb_access_logs",
  cloudTrailLogTableName: "cloud_trail_logs",
  xrayTrace: true,
  slashCommands: {
    insight: true,
    findingsReport: true,
  },
  detectorId: "ccc7636809ab9ef126976785ad0df79e"
}

export const devParameter = stageParameter;