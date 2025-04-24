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
import { Language, SlashCommands } from "../../parameter";

interface FA2Props {
  language: Language;
  qualityModelId: string;
  fastModelId: string;
  slackAppTokenKey: string;
  slackSigningSecretKey: string;
  architectureDescription: string;
  cwLogLogGroups: string[];
  cwLogsInsightQuery: string;
  xrayTrace: boolean;
  slashCommands: SlashCommands;
  databaseName?: string;
  albAccessLogTableName?: string;
  cloudTrailLogTableName?: string;
  detectorId?: string;
}

export class FA2 extends Construct {
  backendRole: iam.Role;
  backendFunction: lambdaNodejs.NodejsFunction;
  metricsInsightRole: iam.Role;
  findingsReportRole: iam.Role;
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

    // Function of Failure Analysis
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
              resources: ["*"],
            }),
          ],
        }),
      },
    });
    this.backendRole = fa2BackendRole;
    // Layer includes fonts and nodejs directroies.
    // Font file is necessary to show Japanese characters in the diagram.
    const converterLayer = new lambda.LayerVersion(this, "ConverterLayer", {
        code: lambda.Code.fromAsset(
        path.join(`${__dirname}/../..`, "lambda/layers"),
      ),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: "A layer of headless chromium and font",
    });
    const fa2Function = new lambdaNodejs.NodejsFunction(this, "FA2Backend", {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 2048,
      timeout: Duration.seconds(600),
      entry: path.join(__dirname, "../../lambda/functions/fa2-lambda/main.mts"),
      environment: {
        QUALITY_MODEL_ID: props.qualityModelId,
        FAST_MODEL_ID: props.fastModelId,
        LANG: props.language,
        SLACK_APP_TOKEN_KEY: props.slackAppTokenKey,
        ARCHITECTURE_DESCRIPTION: props.architectureDescription,
        CW_LOGS_LOGGROUPS: JSON.stringify({
          loggroups: props.cwLogLogGroups,
        }),
        CW_LOGS_INSIGHT_QUERY: props.cwLogsInsightQuery,
      },
      layers: [converterLayer],
      bundling: {
        minify: true,
        keepNames: true,
        externalModules: ["@aws-sdk/*", "@sparticuz/chromium"],
        tsconfig: path.join(__dirname, "../../tsconfig.json"),
        format: lambdaNodejs.OutputFormat.ESM,
        banner:
          // __dirname and __filename is necessary to use @sparticuz/chromium in *.mts file
          "import { createRequire } from 'module';import { fileURLToPath } from 'node:url';import { dirname } from 'path';const require = createRequire(import.meta.url);const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);",
      },
      role: fa2BackendRole,
    });
    this.backendFunction = fa2Function;
    token.grantRead(fa2Function);

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

    // Function and API Endpoint for Slack App
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
          keepNames: true,
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

    // For the command of metrics insight
    if(props.slashCommands.insight){
      const metricsInsightRole = new iam.Role(this, "MetricsInsightRole", {
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
                resources: ["*"],
              }),
            ],
          }),
        },
      });
      this.metricsInsightRole = metricsInsightRole;

      const metricsInsightFunction = new lambdaNodejs.NodejsFunction(this, "MetricsInsight", {
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: 512,
        timeout: Duration.seconds(600),
        entry: path.join(__dirname, "../../lambda/functions/metrics-insight/main.mts"),
        environment: {
          QUALITY_MODEL_ID: props.qualityModelId,
          LANG: props.language,
          SLACK_APP_TOKEN_KEY: props.slackAppTokenKey,
          ARCHITECTURE_DESCRIPTION: props.architectureDescription
        },
        bundling: {
          minify: true,
          keepNames: true,
          externalModules: ["@aws-sdk/*"],
          tsconfig: path.join(__dirname, "../../tsconfig.json"),
          format: lambdaNodejs.OutputFormat.ESM,
          banner:
            "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
        },
        role: metricsInsightRole,
      });
      // Give access permission of slack token from metrics insight function
      token.grantRead(metricsInsightFunction);

      // Give access permission from slack handler to metrics insight function
      slackHandler.addEnvironment("METRICS_INSIGHT_NAME", metricsInsightFunction.functionName)
      metricsInsightFunction.grantInvoke(slackHandler);
    }

    // For the command of findings report
    if(props.slashCommands.findingsReport && props.detectorId){
      const findingsReportRole = new iam.Role(this, "FindingsReportRole", {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        managedPolicies: [
          // To put lambda logs to CloudWatch Logs
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaBasicExecutionRole",
          ),
          iam.ManagedPolicy.fromAwsManagedPolicyName("AWSHealthFullAccess"),
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "AmazonGuardDutyReadOnlyAccess"
          ),
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "AWSSecurityHubReadOnlyAccess"
          )
        ],
        inlinePolicies: {
          // Use LLM in Bedrock
          bedrock: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ["bedrock:InvokeModel"],
                resources: ["*"],
              }),
            ],
          }),
        },
      });
      this.findingsReportRole = findingsReportRole;

      const findingsReportFunction = new lambdaNodejs.NodejsFunction(this, "FindingsReport", {
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: 2048,
        timeout: Duration.seconds(600),
        entry: path.join(__dirname, "../../lambda/functions/findings-report/main.mts"),
        environment: {
          QUALITY_MODEL_ID: props.qualityModelId,
          LANG: props.language,
          SLACK_APP_TOKEN_KEY: props.slackAppTokenKey,
          ARCHITECTURE_DESCRIPTION: props.architectureDescription,
          DETECTOR_ID: props.detectorId
        },
        layers: [converterLayer],
        bundling: {
          minify: true,
          keepNames: true,
          externalModules: ["@aws-sdk/*", "@sparticuz/chromium"],
          tsconfig: path.join(__dirname, "../../tsconfig.json"),
          format: lambdaNodejs.OutputFormat.ESM,
          banner:
            // __dirname and __filename is necessary to use @sparticuz/chromium in *.mts file
            "import { createRequire } from 'module';import { fileURLToPath } from 'node:url';import { dirname } from 'path';const require = createRequire(import.meta.url);const __filename = fileURLToPath(import.meta.url);const __dirname = dirname(__filename);",
        },
        role: findingsReportRole,
      });
      // Give access permission of slack token from metrics insight function
      token.grantRead(findingsReportFunction);

      // Give access permission from slack handler to metrics insight function
      slackHandler.addEnvironment("FINDINGS_REPORT_NAME", findingsReportFunction.functionName)
      findingsReportFunction.grantInvoke(slackHandler); 
    }
  }
}
