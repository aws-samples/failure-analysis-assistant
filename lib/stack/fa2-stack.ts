import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { FA2 } from "../constructs/fa2";
import { Language } from "../../parameter";
import { NagSuppressions } from "cdk-nag";

interface FA2StackProps extends StackProps {
  modelId: string;
  language: Language;
  cwLogLogGroups: string[];
  cwLogsInsightQuery: string;
  xrayTrace: boolean;
  databaseName?: string;
  albAccessLogTableName?: string;
  cloudTrailLogTableName?: string;
  topicArn?: string;
}

export class FA2Stack extends Stack {
  constructor(scope: Construct, id: string, props: FA2StackProps) {
    super(scope, id, props);

    const fa2 = new FA2(this, "FA2Chatbot", {
      modelId: props.modelId,
      language: props.language,
      cwLogLogGroups: props.cwLogLogGroups,
      cwLogsInsightQuery: props.cwLogsInsightQuery,
      xrayTrace: props.xrayTrace,
      databaseName: props.databaseName,
      albAccessLogTableName: props.albAccessLogTableName,
      cloudTrailLogTableName: props.cloudTrailLogTableName,
      topicArn: props.topicArn,
    });

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
