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
  knowledgeBase: boolean;
  embeddingModelId?: string;
  rerankModelId?: string;
  maxAgentCycles?: number; // Maximum number of cycles for ReAct agent
}

// Parameters for Dev Account
export const devParameter: AppParameter = {
  env: {
    account: "123456789012",
    region: "us-west-2",
  },
  language: "ja",
  envName: "Development",
  modelId: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
  slackAppTokenKey: "SlackAppToken",
  slackSigningSecretKey: "SlackSigningSecret",
  architectureDescription: `
  あなたが担当するワークロードは、ALB, EC2, Aurora で構成されています。また、EC2 上に Spring アプリケーションがデプロイされています。`,
  cwLogsLogGroups: [
    "/ec2/demoapp",
    "/ec2/messages",
    "/aws/application-signals/data",
  ],
  cwLogsInsightQuery: "fields @message | limit 100",
  xrayTrace: false,
  slashCommands: {
    insight: false,
    findingsReport: true,
  },
  detectorId: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  knowledgeBase: true,
  embeddingModelId: "amazon.titan-embed-text-v2:0",
  maxAgentCycles: 5 // Maximum number of cycles for ReAct agent
};
