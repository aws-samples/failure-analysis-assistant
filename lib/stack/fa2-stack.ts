import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { FA2 } from "../constructs/fa2";
import { Language } from "../../parameter.js";
import { NagSuppressions } from "cdk-nag";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

interface FA2StackProps extends StackProps {
  language: Language;
  qualityModelId: string;
  fastModelId: string;
  topicArn: string;
  architectureDescription: string;
  cwLogLogGroups: string[];
  cwLogsInsightQuery: string;
  xrayTrace: boolean;
  databaseName?: string;
  albAccessLogTableName?: string;
  cloudTrailLogTableName?: string;
  insight: boolean;
  findingsReport: boolean;
  detectorId?: string;
}

export class FA2Stack extends Stack {
  public readonly fa2BackendFunction: NodejsFunction;
  constructor(scope: Construct, id: string, props: FA2StackProps) {
    super(scope, id, props);

    const fa2 = new FA2(this, "FA2Chatbot", {
      language: props.language,
      qualityModelId: props.qualityModelId,
      fastModelId: props.fastModelId,
      topicArn: props.topicArn,
      architectureDescription: props.architectureDescription,
      cwLogLogGroups: props.cwLogLogGroups,
      cwLogsInsightQuery: props.cwLogsInsightQuery,
      xrayTrace: props.xrayTrace,
      databaseName: props.databaseName,
      albAccessLogTableName: props.albAccessLogTableName,
      cloudTrailLogTableName: props.cloudTrailLogTableName,
      insight: props.insight,
      findingsReport: props.findingsReport,
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

    if(props.insight){
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
    
    if(props.findingsReport && props.detectorId){
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
