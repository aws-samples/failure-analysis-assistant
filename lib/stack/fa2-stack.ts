import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { FA2 } from "../constructs/fa2";
import { Language, SlashCommands } from "../../parameter";
import { NagSuppressions } from "cdk-nag";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

interface FA2StackProps extends StackProps {
  language: Language;
  modelId: string;
  slackAppTokenKey: string;
  slackSigningSecretKey: string;
  architectureDescription: string;
  cwLogsLogGroups: string[];
  cwLogsInsightQuery: string;
  xrayTrace: boolean;
  databaseName?: string;
  albAccessLogTableName?: string;
  cloudTrailLogTableName?: string;
  slashCommands: SlashCommands;
  detectorId?: string;
  knowledgeBaseId?: string;
  rerankModelId?: string;
  maxAgentCycles?: number;
}

export class FA2Stack extends Stack {
  public readonly fa2BackendFunction: NodejsFunction;
  constructor(scope: Construct, id: string, props: FA2StackProps) {
    super(scope, id, props);

    // To deploy FA2 backend with Slack bot backend.
    const fa2 = new FA2(this, "FA2Slack", {
      language: props.language,
      modelId: props.modelId,
      slackAppTokenKey: props.slackAppTokenKey,
      slackSigningSecretKey: props.slackSigningSecretKey,
      architectureDescription: props.architectureDescription,
      cwLogsLogGroups: props.cwLogsLogGroups,
      cwLogsInsightQuery: props.cwLogsInsightQuery,
      xrayTrace: props.xrayTrace,
      databaseName: props.databaseName,
      albAccessLogTableName: props.albAccessLogTableName,
      cloudTrailLogTableName: props.cloudTrailLogTableName,
      slashCommands: props.slashCommands,
      detectorId: props.detectorId,
      maxAgentCycles: props.maxAgentCycles,
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
    NagSuppressions.addResourceSuppressionsByPath(
      Stack.of(this),
      `${Stack.of(this).stackName}/${fa2.node.id}/SlackHandlerEndpoint/CloudWatchRole/Resource`,
      [
        {
          id: "AwsSolutions-IAM4",
          reason: "Make it simple by using Managed Policy/Role"
        }
      ]
    )

    NagSuppressions.addStackSuppressions(this, [
      {
        id: "AwsSolutions-L1",
        reason: "Puppetter didn't work on lambda of the runtime of Node.js v22."
      }
    ])

        if(props.slashCommands.insight){
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
    
    if(props.slashCommands.findingsReport && props.detectorId){
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

    if (fa2.slackHandlerRole) {
      NagSuppressions.addResourceSuppressions(fa2.slackHandlerRole, [
        {
          id: "AwsSolutions-IAM4",
          reason:
            "This managed role is for logging and Using it keeps simple code instead of customer managed policies.",
        },
        {
          id: "AwsSolutions-IAM5",
          reason: "CloudWatch Logs need * resources to do these API actions.",
        },
      ]);
      NagSuppressions.addResourceSuppressionsByPath(
        Stack.of(this),
        `/${Stack.of(this).stackName}/${fa2.node.id}/${
          fa2.slackHandlerRole.node.id
        }/DefaultPolicy/Resource`,
        [
          {
            id: "AwsSolutions-IAM5",
            reason:
              "* resource is given by Grant method of CDK for Lambda function automatically.",
          },
        ],
      );
      NagSuppressions.addResourceSuppressionsByPath(
        Stack.of(this),
        `/${Stack.of(this).stackName}/${fa2.node.id}/${
          fa2.slackRestApi.node.id
        }/DeploymentStage.v1/Resource`,
        [
          {
            id: "AwsSolutions-APIG3",
            reason:
              "This is sample. If you deploy to Production, please add WAF for endpoint protection.",
          },
        ],
      );
      NagSuppressions.addResourceSuppressionsByPath(
        Stack.of(this),
        `/${Stack.of(this).stackName}/${fa2.node.id}/${
          fa2.slackRestApi.node.id
        }/Default/slack/events/POST/Resource`,
        [
          {
            id: "AwsSolutions-APIG4",
            reason:
              "Request verification is implemented to Bolt framework. ref: * Flag that determines whether Bolt should {@link https://api.slack.com/authentication/verifying-requests-from-slack|verify Slack's signature on incoming requests}..",
          },
          {
            id: "AwsSolutions-COG4",
            reason:
              "This API keeps public for Slack services. We couldn't use Cognito user pool authorizer.",
          },
        ],
      );
    }
  }
}
