import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { FA2 } from "../constructs/fa2";
import { Language, SlashCommands } from "../../parameter.ts_old";
import { NagSuppressions } from "cdk-nag";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

interface FA2StackProps extends StackProps {
  language: Language;
<<<<<<< HEAD
  modelId: string;
  slackAppTokenKey: string;
  slackSigningSecretKey: string;
=======
  qualityModelId: string;
  fastModelId: string;
  topicArn: string;
>>>>>>> cd9d6dc11c732095a1cf40119b7514881bb26be3
  architectureDescription: string;
  cwLogLogGroups: string[];
  cwLogsInsightQuery: string;
  xrayTrace: boolean;
  slashCommands: SlashCommands;
  databaseName?: string;
  albAccessLogTableName?: string;
  cloudTrailLogTableName?: string;
<<<<<<< HEAD
=======
  insight: boolean;
  findingsReport: boolean;
>>>>>>> cd9d6dc11c732095a1cf40119b7514881bb26be3
  detectorId?: string;
}

export class FA2Stack extends Stack {
  public readonly fa2BackendFunction: NodejsFunction;
  constructor(scope: Construct, id: string, props: FA2StackProps) {
    super(scope, id, props);

<<<<<<< HEAD
    // To deploy FA2 backend with Slack bot backend.
    const fa2 = new FA2(this, "FA2Slack", {
      language: props.language,
      modelId: props.modelId,
      slackAppTokenKey: props.slackAppTokenKey,
      slackSigningSecretKey: props.slackSigningSecretKey,
=======
    const fa2 = new FA2(this, "FA2Chatbot", {
      language: props.language,
      qualityModelId: props.qualityModelId,
      fastModelId: props.fastModelId,
      topicArn: props.topicArn,
>>>>>>> cd9d6dc11c732095a1cf40119b7514881bb26be3
      architectureDescription: props.architectureDescription,
      cwLogLogGroups: props.cwLogLogGroups,
      cwLogsInsightQuery: props.cwLogsInsightQuery,
      xrayTrace: props.xrayTrace,
      slashCommands: props.slashCommands,
      databaseName: props.databaseName,
      albAccessLogTableName: props.albAccessLogTableName,
      cloudTrailLogTableName: props.cloudTrailLogTableName,
<<<<<<< HEAD
=======
      insight: props.insight,
      findingsReport: props.findingsReport,
>>>>>>> cd9d6dc11c732095a1cf40119b7514881bb26be3
      detectorId: props.detectorId,
    });
    this.fa2BackendFunction = fa2.backendFunction;

    // ----- CDK Nag Suppressions -----
    NagSuppressions.addResourceSuppressions(fa2.backendRole, [
      {
        id: "AwsSolutions-IAM4",
        reason:
          "This managed role is for logging and Using it keeps simple code instead of customer managed policies.",
      },
      {
        id: "AwsSolutions-IAM5",
        reason:
          "CloudWatch Logs, Athena, X-Ray need * resources to do these API actions.",
      },
    ]);

<<<<<<< HEAD
    if(props.slashCommands.insight){
=======
    if(props.insight){
>>>>>>> cd9d6dc11c732095a1cf40119b7514881bb26be3
      NagSuppressions.addResourceSuppressions(fa2.metricsInsightRole, [
        {
          id: "AwsSolutions-IAM4",
          reason:
            "This managed role is for logging and Using it keeps simple code instead of customer managed policies.",
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "CloudWatch need * resources to do these API actions.",
        },
      ]);
    }
    
<<<<<<< HEAD
    if(props.slashCommands.findingsReport && props.detectorId){
=======
    if(props.findingsReport && props.detectorId){
>>>>>>> cd9d6dc11c732095a1cf40119b7514881bb26be3
      NagSuppressions.addResourceSuppressions(fa2.findingsReportRole, [
        {
          id: "AwsSolutions-IAM4",
          reason:
            "This managed role is for logging and Using it keeps simple code instead of customer managed policies.",
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "CloudWatch need * resources to do these API actions.",
        },
      ]);
    }

    if (
      props.databaseName &&
      (props.albAccessLogTableName || props.cloudTrailLogTableName)
    ) {
      NagSuppressions.addResourceSuppressionsByPath(
        Stack.of(this),
        `/${Stack.of(this).stackName}/${fa2.node.id}/${
          fa2.backendRole.node.id
        }/DefaultPolicy/Resource`,
        [
          {
            id: "AwsSolutions-IAM5",
            reason:
              "CloudWatch Logs, Athena, X-Ray need * resources to do these API actions.",
          },
        ],
      );
    }
  }
}
