import "source-map-support/register";
import { App, Aspects } from "aws-cdk-lib";
import { devParameter } from "../parameter";
import { FA2Stack } from "../lib/stack/fa2-stack";
import { AwsSolutionsChecks } from "cdk-nag";

const app = new App();

Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

new FA2Stack(app, `${devParameter.envName.slice(0,3)}-FA2`, {
  env: {
    account: devParameter.env?.account || process.env.CDK_DEFAULT_ACCOUNT,
    region: devParameter.env?.region || process.env.CDK_DEFAULT_REGION,
  },
  tags: {
    Environment: devParameter.envName,
  },
  description:
    "Failure Analysis Assistant retrieve logs and traces from AWS services and helps analyze root cause of errors by LLM (uksb-o0f5mc077z) (tag:slackapp).",
  modelId: devParameter.modelId,
  language: devParameter.language,
  slackAppTokenKey: devParameter.slackAppTokenKey,
  slackSigningSecretKey: devParameter.slackSigningSecretKey,
  architectureDescription: devParameter.architectureDescription,
  cwLogLogGroups: devParameter.cwLogsLogGroups,
  cwLogsInsightQuery: devParameter.cwLogsInsightQuery,
  xrayTrace: devParameter.xrayTrace,
  databaseName: devParameter.databaseName,
  albAccessLogTableName: devParameter.albAccessLogTableName,
  cloudTrailLogTableName: devParameter.cloudTrailLogTableName,
});
