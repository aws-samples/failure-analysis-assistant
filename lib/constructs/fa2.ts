import {
  aws_apigateway as apigateway,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_lambda_nodejs as lambdaNodejs,
  aws_logs as logs,
  aws_secretsmanager as secretsManager,
  Duration,
  Stack,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";
import { Bucket } from "./bucket";
import { Language } from "../../parameter";

interface FA2Props {
  modelId: string;
  language: Language;
  slackAppTokenKey: string;
  slackSigningSecretKey: string;
  cwLogLogGroups: string[];
  cwLogsInsightQuery: string;
  xrayTrace: boolean;
  databaseName?: string;
  albAccessLogTableName?: string;
  cloudTrailLogTableName?: string;
  topicArn?: string;
}

export class FA2 extends Construct {
  backendRole: iam.Role;
  slackHandlerRole: iam.Role;
  slackRestApi: apigateway.RestApi;
  constructor(scope: Construct, id: string, props: FA2Props) {
    super(scope, id);

    // Baseline. CloudWatch Logs parameters are required.
    if (
      props.cwLogLogGroups.length < 1 ||
      props.cwLogsInsightQuery.length < 1
    ) {
      throw new Error("Please configure CloudWatch Logs LogGroups and Query.");
    }

    const fa2BackendRole = new iam.Role(this, "FA2BackendRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        // To put lambda logs to CloudWatch Logs
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
      ],
      inlinePolicies: {
        // To run query in CloudWatch Logs Insight
        cwlogs: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["cloudwatch:GenerateQuery"],
              resources: ["*"],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                "logs:StartQuery",
                "logs:GetQueryResults",
                "logs:StopQuery",
                "logs:FilterLogEvents",
                "logs:DescribeLogGroups",
                "logs:DescribeLogStreams",
              ],
              resources: [
                ...props.cwLogLogGroups.map(
                  (loggroup) =>
                    `arn:aws:logs:${Stack.of(this).region}:${
                      Stack.of(this).account
                    }:log-group:${loggroup}:*:*`,
                ),
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions:[
                "cloudwatch:GetMetricData",
                "cloudwatch:ListMetrics",
              ],
              resources: ["*"]
            })
          ],
        }),
        // Use LLM in Bedrock
        bedrock: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["bedrock:InvokeModel"],
              resources: [
                `arn:aws:bedrock:${Stack.of(this).region}::foundation-model/${
                  props.modelId
                }`,
              ],
            }),
          ],
        }),
      },
    });
    this.backendRole = fa2BackendRole;
    const fa2Function = new lambdaNodejs.NodejsFunction(this, "FA2Backend", {
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: Duration.seconds(600),
      entry: path.join(__dirname, "../../lambda/functions/fa2-lambda/main.mts"),
      environment: {
        MODEL_ID: props.modelId,
        LANG: props.language,
        SLACK_APP_TOKEN_KEY: props.slackAppTokenKey,
        CW_LOGS_LOGGROUPS: JSON.stringify({
          loggroups: props.cwLogLogGroups,
        }),
        CW_LOGS_INSIGHT_QUERY: props.cwLogsInsightQuery,
      },
      bundling: {
        minify: true,
        externalModules: ["@aws-sdk/*"],
        tsconfig: path.join(__dirname, "../../tsconfig.json"),
        format: lambdaNodejs.OutputFormat.ESM,
        banner:
          "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
      },
      role: fa2BackendRole,
    });

    // Existed workload has athena database and tables
    if (
      props.databaseName &&
      (props.albAccessLogTableName || props.cloudTrailLogTableName)
    ) {
      // To run query to Athena
      const athenaQueryBucket = new Bucket(this, "AthenaQueryBucket");
      fa2BackendRole.addToPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "athena:GetDataCatalog",
            "athena:GetQueryExecution",
            "athena:GetQueryResults",
            "athena:GetWorkGroup",
            "athena:StartQueryExecution",
            "athena:StopQueryExecution",
          ],
          resources: ["*"],
        }),
      );

      fa2BackendRole.addToPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["glue:GetDatabase"],
          resources: [
            `arn:aws:glue:${Stack.of(this).region}:${
              Stack.of(this).account
            }:catalog`,
            `arn:aws:glue:${Stack.of(this).region}:${
              Stack.of(this).account
            }:database/${props.databaseName}`,
          ],
        }),
      );

      // To get logs data in S3 buckets
      fa2BackendRole.addToPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["s3:GetBucketLocation", "s3:GetObject", "s3:ListBucket"],
          resources: ["*"],
        }),
      );
      // To put query when you run query to Athena
      fa2BackendRole.addToPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "s3:PutObject",
            "s3:AbortMultipartUpload",
            "s3:ListBucketMultipartUploads",
            "s3:ListMultipartUploadParts",
            "s3:GetBucketLocation",
            "s3:ListBucket",
          ],
          resources: [
            athenaQueryBucket.bucket.bucketArn,
            `${athenaQueryBucket.bucket.bucketArn}/*`,
          ],
        }),
      );

      fa2Function.addEnvironment("ATHENA_DATABASE_NAME", props.databaseName);
      fa2Function.addEnvironment(
        "ATHENA_QUERY_BUCKET",
        athenaQueryBucket.bucket.bucketName,
      );

      // To get ALB logs
      if (props.albAccessLogTableName) {
        fa2BackendRole.addToPolicy(
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              "glue:GetTable",
              "glue:GetDatabase",
              "glue:GetTables",
              "glue:GetDatabases",
              "glue:GetTableVersion",
              "glue:GetTableVersions",
            ],
            resources: [
              `arn:aws:glue:${Stack.of(this).region}:${
                Stack.of(this).account
              }:catalog`,
              `arn:aws:glue:${Stack.of(this).region}:${
                Stack.of(this).account
              }:database/${props.databaseName}`,
              `arn:aws:glue:${Stack.of(this).region}:${
                Stack.of(this).account
              }:table/${props.databaseName}/${props.albAccessLogTableName}`,
            ],
          }),
        );
        fa2Function.addEnvironment(
          "ALB_ACCESS_LOG_TABLE_NAME",
          props.albAccessLogTableName,
        );
      }
      // To get Trail logs
      if (props.cloudTrailLogTableName) {
        fa2BackendRole.addToPolicy(
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              "glue:GetTable",
              "glue:GetDatabase",
              "glue:GetTables",
              "glue:GetDatabases",
              "glue:GetTableVersion",
              "glue:GetTableVersions",
            ],
            resources: [
              `arn:aws:glue:${Stack.of(this).region}:${
                Stack.of(this).account
              }:catalog`,
              `arn:aws:glue:${Stack.of(this).region}:${
                Stack.of(this).account
              }:database/${props.databaseName}`,
              `arn:aws:glue:${Stack.of(this).region}:${
                Stack.of(this).account
              }:table/${props.databaseName}/${props.cloudTrailLogTableName}`,
            ],
          }),
        );
        fa2Function.addEnvironment(
          "CLOUD_TRAIL_LOG_TABLE_NAME",
          props.cloudTrailLogTableName,
        );
      }
    }

    // To get X-Ray traces
    if (props.xrayTrace) {
      fa2BackendRole.addToPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["xray:GetTraceSummaries"],
          resources: ["*"],
        }),
      );
      fa2Function.addEnvironment("XRAY_TRACE", "true");
    }

    // Slack Credentials
    const token = secretsManager.Secret.fromSecretNameV2(
      this,
      "SlackAppToken",
      props.slackAppTokenKey,
    );
    const signingSecret = secretsManager.Secret.fromSecretNameV2(
      this,
      "SlackSigningSecret",
      props.slackSigningSecretKey
    );

    const slackHandlerRole = new iam.Role(this, "SlackHandlerRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        // To put lambda logs to CloudWatch Logs
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
      ],
    });
    this.slackHandlerRole = slackHandlerRole;

    const slackHandler = new lambdaNodejs.NodejsFunction(
      this,
      "SlackHandler",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: Duration.seconds(600),
        entry: path.join(
          __dirname,
          "../../lambda/functions/slack-handler/main.mts",
        ),
        environment: {
          LANG: props.language,
          SLACK_APP_TOKEN_KEY: props.slackAppTokenKey,
          SLACK_SIGNING_SECRET_KEY: props.slackSigningSecretKey,
          FUNCTION_NAME: fa2Function.functionName,
        },
        role: slackHandlerRole,
        bundling: {
          minify: true,
          mainFields: ["module", "main"],
          // To solve warning of esbuild
          externalModules: ["@aws-sdk/*", "bufferutil", "utf-8-validate"],
          tsconfig: path.join(__dirname, "../../tsconfig.json"),
          format: lambdaNodejs.OutputFormat.ESM,
          esbuildArgs: {
            "--tree-shaking": "true",
          },
          // Ref: https://docs.powertools.aws.dev/lambda/typescript/2.0.2/upgrade/#unable-to-use-esm
          banner:
            "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
        },
      },
    );
    token.grantRead(slackHandler);
    token.grantRead(fa2Function);
    signingSecret.grantRead(slackHandler);
    fa2Function.grantInvoke(slackHandler);

    const logGroup = new logs.LogGroup(this, "ApiGatewayLogGroup");
    const restApi = new apigateway.RestApi(this, "SlackHandlerEndpoint", {
      deployOptions: {
        stageName: "v1",
        accessLogDestination: new apigateway.LogGroupLogDestination(logGroup),
        accessLogFormat: apigateway.AccessLogFormat.clf(),
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
      },
    });
    this.slackRestApi = restApi;
    restApi.addRequestValidator("ApiGatewayRequestValidator", {
      validateRequestBody: true,
      validateRequestParameters: true,
    });
    const slackEvents = restApi.root
      .addResource("slack")
      .addResource("events");
    slackEvents.addMethod(
      "POST",
      new apigateway.LambdaIntegration(slackHandler),
    );
    
  }
}
