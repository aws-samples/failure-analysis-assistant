# Failure Analysis Assistant (FA2) AWS Chatbot Custom Action version

[日本語で読む](./README.md)

This is a sample implementation that responds to alarms sent to Slack by AWS Chatbot and helps analyze the root cause of the failure.
This README introduces an implementation using **AWS Chatbot's Custom Action.**
If you want to check the Slack App version that was shown at the AWS Summit Japan 2024, go to [Failure Analysis Assistant (FA2) Slack App version](https://github.com/aws-samples/failure-analysis-assistant).

**Failure analysis assist**

Logs are retrieved from a predefined log storage location within a time range specified by the user, information is extracted and summarized with LLM, and information useful for failure analysis is returned to Slack.
For an example of how the function works, see [Failure Analysis Assist](#failure-analysis-assist).

**Metrics analysis support**

In response to questions given by users, a function has been added to select metrics that require generative AI and answer questions based on that metric data.
For example of the operation of the function, see [[Optional]Metric Analysis Assist](#optionalmetrics-analysis-assist).
**This feature is optional.** If you want to use it, please see [Setting parameters](#setting-parameters) and [[Optional]Configuration of Slack App for Metrics Insight Assist](#optionalconfiguration-of-slack-app-for-metrics-insight-assist).

**Findings Report**

We've added the feature to create a report explaining Security Hub and GuardDuty Findings by LLM.
For example of the function in action, see [[OPTIONAL]Findings Report](#optionalfindings-report).
**This feature is optional**, so if you want to enable it, check [Setting parameters](#setting-parameters) and [[Optional]Configuration of Slack App for Findings Report](#optionalconfiguration-of-slack-app-for-findings-report).
## Architecture & Workflow

The scope of existing workloads is based on the assumption that you have already been implemented.
You can try this sample if the log is output to Amazon CloudWatch Logs. Amazon S3 and AWS X-Ray are optional.

![chatbot-architecture](./docs/images/en/fa2-architecture-chatbot.png)

1. Alarms are triggered on the target system, and notifications are sent to Slack via Amazon SNS and AWS Chatbot
2. Execute a custom action with FA2 as the target, enter `log retrieval time range` and `event information understood from alarms`, and submit a request
3. FA2 runs on AWS Lambda and accesses you defined log search targets and collects information from the log retrieval time range included in the request
   1. The parameters you set determine what to search for. A log group of Amazon CloudWatch Logs is required; database of Amazon Athena, and the parameter of AWS X-Ray are optional
   2. By increasing the number of search targets, there is a possibility that more accurate answers can be obtained
4. The collected information is added as context to the prompt template included in FA2 and sent to Amazon Bedrock to summarize information related to the event and extract information necessary for event cause analysis
5. In order to return answers obtained from LLM, submit answers to existed SNS topics and send them to Slack via AWS Chatbot

## Requirements

- You can use the AWS Cloud Development Kit (CDK)
  - This sample is implemented in CDK
- You must have a CloudWatch Logs log group containing the logs you want to analyze
  - Amazon Athena and AWS X-Ray are optional
  - If you want to invlude AWS CloudTrail or Application Load Balancer (ALB) access logs, an Amazon Athena database must be created
  - If AWS X-Ray trace information is also used, an AWS X-Ray trace for the relevant system must have been obtained
- Claude 3 Sonnet and Claude 3.5 Sonnet access has been granted from model access on Amazon Bedrock
  - Claude 3.5 Sonnet is used for generation of the image written by Mermaid syntax.
- Confirm that an alarm notification will be sent to Slack from the AWS Chatbot set up in the existing workload
  - If you don't have the test envrionment for FA2 or you cannot use it for FA2. You can create test environment as follow [How to create a test environment for FA2](./docs/HowToCreateTestEnvironment_en.md).

## How to Deploy

### Setting parameters

Refer to the following description, copy `parameter_template.ts`, create `parameter.ts`, and then change each value.

```
// Example: Settings for the AWS Chatbot version when using Claude 3 Sonnet and using CloudWatch Logs, Athena, and X-Ray as search targets
export const devParameter: AppParameter = {
  env: {
    account: "123456789012",
    region: "us-east-1",
  },
  language: "ja",
  envName: "Development",
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  topicArn:
    "arn:aws:sns:us-east-1:123456789012:ExampleTopic",
  architectureDescription: "The workload you are responsible for consists of CloudFront, ALB, ECS on EC2, and DynamoDB, and Spring applications are deployed on ECS on EC2."
  cwLogsLogGroups: [
    "ApiLogGroup", "/aws/ecs/containerinsights/EcsAppCluster/performance"
  ],
  cwLogsInsightQuery: "fields @message | limit 100",
  databaseName: "athenadatacatalog",
  albAccessLogTableName: "alb_access_logs",
  cloudTrailLogTableName: "cloud_trail_logs",
  xrayTrace: true,
  detectorId: "xxxxxxxxxxxxxxx"
};
```

#### Explanation of parameters

| Parameters               | Example value                                                             | Description                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env.account`            | `"123456789012"`                                                          | AWS Account ID to deploy this sample                                                                                                                                                        |
| `env.region`             | `"us-east-1"`                                                             | AWS Region to deploy this sample                                                                                                                                                            |
| `language`               | `"ja"`                                                                    | Language setting for prompt and UI. Choose one, `en` or `ja`.                                                                                                                               |
| `envName`                | `"Development"`                                                           | Environment name.                                                                                                                                                                           |
| `modelId`                | `"anthropic.claude-3-sonnet-20240229-v1:0"`                               | Put the model ID of Amazon Bedrock you want to use. Please check access grants of chosen model.                                                                                             |
| `topicArn`               | `"arn:aws:sns:us-east-1:123456789012:ExampleTopic"`                       | The ARN of the Amazon SNS topic that is handing events to AWS Chatbot.                                                                               |
| `cwLogsLogGroups`        | `["ApiLogGroup", "/aws/ecs/containerinsights/EcsAppCluster/performance"]` | Specify the log group of Amazon CloudWatch Logs for which you want to retrieve logs. Up to 50 can be specified.                                                                             |
| `cwLogsInsightQuery`     | `"fields @message \| limit 100"`                                          | Specify the query you want to use with CloudWatch Logs Insight. Due to balance with the context window, the default limit is 100 (please modify the query according to actual environment). |
| `databaseName`           | `"athenadatacatalog"`                                                     | The name of the Amazon Athena database. Required if you want to use Athena to search logs.                                                                                                  |
| `albAccessLogTableName`  | `"alb_access_logs"`                                                       | ALB access log table name. In this sample, ALB access log search was implemented in Athena, so the ALB access log table name is specified when using it.                                    |
| `cloudTrailLogTableName` | `"cloud_trail_logs"`                                                      | AWS CloudTrail log table name. In this sample, we implemented a CloudTrail audit log log search in Athena, so specify the CloudTrail log table name when using it.                          |
| `xrayTrace`              | `true`                                                                    | A parameter for deciding whether to include AWS X-Ray trace information in the analysis                                                                                                     |
| `detectorId`              | `"xxxxxxxxxxx"`                                                                    | It is requred if you want to use `findings-report` command. Please input `detectorId` that is defined in your account                                                                                                      |

#### Modify prompts

Prompts used for each inference are described in `lambda/lib/prompts.ts`.
Each prompt uses `architectureDescription` in `parameter.ts` to obtain a description of the target workload's architecture.
Please change the description of this architecture according to the environment in which you are deploying FA2.

Also, if post-deployment testing does not produce the expected results, tune the prompts described in the `createFailureAnalysisPrompt` function.

### Deployment

First, a Lambda function layer is required for the function of illustrating the hypothesis of the cause of failure.
So, first run the command to install the modules required for Layer.
Next, execute the normal CDK deployment command.

```
$ npm run build:layer // This must be done for the function of illustrating hypotheses about the architecture of the system you are responsible for.
$ npm install
$ npx cdk bootstrap --profile {your_profile}
$ npx cdk deploy --all --profile {your_profile} --require-approval never
```

> [!NOTE]
> The part that begins with the description of `// Additional process` in `failure-analysis-assistant/lambda/functions/fa2-lambda/main.mts` that is the process of generating a hypothetical diagram of the cause of the fault.
> If you don't need to generate a diagram, comment out or delete this part.

### Configuration for Custom Action

1. After deploying the CDK, check the name of the deployed Lambda function
2. Click the 3-point reader on the AWS Chatbot notification

   ![fa2-customaction-start](./docs/images/en/fa2-customaction-start.png)

3. Click [Create] button in [Create a new custom action button] section

   ![fa2-customaction-create](./docs/images/en/fa2-customaction-create.png)

4. Input [FA2] to [Custom action name], and [Custom action button text], and choose [CLI action] from [Custom action type] list, finally, click [Next] button

   ![fa2-customaction-step1](./docs/images/en/fa2-customaction-step1.png)

5. Update below script {Deployed lambda function name} and {Deploy region}, and put it to [Define CLI command].

   ```bash
   lambda invoke --function-name {Deployed lambda function name} --payload {
     "startDate" : "$startDate",
     "endDate": "$endDate",
     "errorDescription": "$errorDescription",
     "alarmName": "$MetricAlarmName",
     "alarmTimestamp": "$Timestamp"
   } --region {Deploy region} --invocation-type Event
   ```

   ![fa2-customaction-step2](./docs/images/en/fa2-customaction-step2.png)
6. No change in [Display criteria], continue to proceed. Click [Save] button.
   ![fa2-customaction-step3](./docs/images/en/fa2-customaction-step3.png)
7. **The next notification that AWS Chatbot will send** will display the created [FA2] custom action as a button
   ![fa2-customaction-button](./docs/images/en/fa2-customaction-button.png)

#### [Optional]Configuration of Slack App for Metrics Insight Assist

#### [Optional]Configuration of Slack App for Findings Report

### Testing

#### Failure Analysis Assist

1. Click [FA2] button in an alarm.
2. Input some values followed below instruction:

   1. Input in `UTC` in `ISO 8601` format (`ISO 8601` format: yyyy-mm-ddTHH: mm:ssZ) to `startDate` and `enddate`.
   2. Enters an overview of the alarm to `errorDescription`
   3. Leave `alarmName` and `alarmTimeStamp` as they are, and click [Next]

      ![fa2-customaction-input](./docs/images/en/fa2-customaction-input.png)

3. Check the input values. If it's OK, click [Run] button

   ![fa2-customaction-confirm](./docs/images/en/fa2-customaction-confirm.png)

4. You will receive below response after request is success

   ![fa2-customaction-ack](./docs/images/en/fa2-customaction-ack.png)

5. Please wait a few minutes. FA2 will send response

   ![fa2-customaction-answer](./docs/images/en/fa2-customaction-answer.png)

#### [Optional]Metrics Analysis Assist

#### [Optional]Findings Report

## Delete deployed resources

Please use below command to delete the resources you deployed

```
$ npx cdk destroy --profile {your_profile}
```

## Considerations

Since this source code is a sample, AWS WAF is not attached to the Amazon API Gateway.
Slack's endpoints are publicly exposed, so they can be targeted by attacks.
For production use, please consider using AWS WAF to reduce security risks.

## Considerations for using Amazon Bedrock

Amazon Bedrock allows you to obtain a log of model accesses.
If you want to get a log, go to [Model invocation logging](https://docs.aws.amazon.com/bedrock/latest/userguide/model-invocation-logging.html) and configure the logging of model invocation.

And, you can filter input and output of the models of Amazon Bedrock.
If the logs contain sensitive information, you can use [Guardrails for Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html) to filter input and output to the model, so please consider that as well.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.
