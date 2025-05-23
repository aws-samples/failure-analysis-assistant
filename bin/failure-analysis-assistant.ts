import "source-map-support/register";
import { App, Aspects } from "aws-cdk-lib";
import { devParameter } from "../parameter";
import { FA2Stack } from "../lib/stack/fa2-stack";
import { AwsSolutionsChecks } from "cdk-nag";
import { KnowledgeBaseStack } from "../lib/stack/knowledge-base-stack";

const app = new App();

Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

const fa2Stack = new FA2Stack(app, `${devParameter.envName.slice(0,3)}-FA2`, {
  env: {
    account: devParameter.env?.account || process.env.CDK_DEFAULT_ACCOUNT,
    region: devParameter.env?.region || process.env.CDK_DEFAULT_REGION,
  },
  tags: {
    Environment: devParameter.envName,
  },
  description:
    "Failure Analysis Assistant retrieve logs and traces from AWS services and helps analyze root cause of errors by LLM (uksb-o0f5mc077z) (tag:chatbot-customaction).",
  language: devParameter.language,
  qualityModelId: devParameter.qualityModelId,
  fastModelId: devParameter.fastModelId,
  slackAppTokenKey: devParameter.slackAppTokenKey,
  slackSigningSecretKey: devParameter.slackSigningSecretKey,
  architectureDescription: devParameter.architectureDescription,
  cwLogLogGroups: devParameter.cwLogsLogGroups,
  cwLogsInsightQuery: devParameter.cwLogsInsightQuery,
  xrayTrace: devParameter.xrayTrace,
  slashCommands: devParameter.slashCommands,
  databaseName: devParameter.databaseName,
  albAccessLogTableName: devParameter.albAccessLogTableName,
  cloudTrailLogTableName: devParameter.cloudTrailLogTableName,
  detectorId: devParameter.detectorId,
});

if(devParameter.knowledgeBase){
  new KnowledgeBaseStack(app, `${devParameter.envName.slice(0,3)}-KnowledgeBase`, {
    env: {
      account: devParameter.env?.account || process.env.CDK_DEFAULT_ACCOUNT,
      region: devParameter.env?.region || process.env.CDK_DEFAULT_REGION,
    },
    envName: devParameter.envName,
    fa2BackendFunction: fa2Stack.fa2BackendFunction,
    embeddingModelId: devParameter.embeddingModelId,
    rerankModelId: devParameter.rerankModelId,
  });
}