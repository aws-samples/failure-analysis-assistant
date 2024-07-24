# Failure Analysis Assistant (FA2) Slack App Version

[日本語で読む](./README.md)

This is a sample implementation that responds to alarms sent to Slack by AWS Chatbot and helps analyze the root cause of the failure.
Logs are retrieved from a predefined log storage location within a time range specified by the user, information is extracted and summarized with LLM, and information useful for failure analysis is returned to Slack.

This is the sample code for the demo shown at the AWS Summit Japan 2024 booth.

## Branches

- [`main`](https://github.com/aws-samples/failure-analysis-assistant) - This branch. This version uses the Slack App. This was exhibited at the AWS Summit Japan 2024.
- [`chatbot-customaction`](https://github.com/aws-samples/failure-analysis-assistant/tree/chatbot-customaction) - Instead of the Slack App, this is a version that implements an input form using a `Custom Action` of AWS Chatbot. If you don't have an environment where you can't use the Slack App, or if you don't want to manage the Slack App, use this.

## Background

I think there are many people who have implemented ChatOps to send alarm notifications to the chat applications.
However, when an event such as an alarm occurs, what actually takes time is root cause analysis and correction after identification of analysis results, which occurs after the event is detected.
This sample shows failure analysis using LLM as one idea to make cause analysis as efficient as possible.

Normally, when you analyses root cause, you aquired logs after defining a fixed period of time from the time the alarm occurred using empirical rules.
The logs are not in one place, and there are in many places. After collecting logs from all places, we organize their dependencies, and identify the root cause.

This process is so hard task that requires patience and time, and pressure will be applied in situations in the case of happening the negative impact to your business.
Amazon CloudWatch Logs, which is a typical log output location for AWS, has an API for querying, so if you have specific time range, you can retrieve logs. we can retrieve the logs from Amazon S3 that is combined with Amazon Athena in similar way.
Additionally, by specifying a time range, AWS X-Ray can also obtain trace information for that time range.

From the above, it is possible to automate the retrieval of logs and traces programmatically.
And, we inputted the acquired information into a large language model (LLM) to improve the efficiency of information extraction and summarization.

LLM is known for its ability to handle summaries and information extraction. It is possible to process more input information in a faster time than humans.
There is a possibility that hallucination will be included in LLM response, so caution is necessary, but I think it can be used as an auxiliary way for humans to make decisions in the end.

Please use this sample and try out the effects.

## Architecture & Workflow

The scope of existing workloads is based on the assumption that you have already been implemented.
You can try this sample if the log is output to CloudWatch Logs. S3 and X-Ray are optional.

![slackapp-architecture](./docs/images/en/fa2-architecture-slack.png)

1. Alarms are triggered on the target system, and notifications are sent to Slack via Amazon SNS and AWS Chatbot
2. Show the input form of Slack App when it received an alarm.
3. Enter `log retrieval time range` and `event information understood from alarms`, and submit a request
4. FA2 runs on AWS Lambda and accesses you defined log search targets and collects information from the log retrieval time range included in the request
   1. The parameters you set determine what to search for. A log group of Amazon CloudWatch Logs is required; database of Amazon Athena, and the parameter of AWS X-Ray are optional
   2. By increasing the number of search targets, there is a possibility that more accurate answers can be obtained
5. The collected information is added as context to the prompt template included in FA2 and sent to Amazon Bedrock to summarize information related to the event and extract information necessary for event cause analysis
6. In order to return answers obtained from LLM, submit answers to `response_url`.

## Requirements

- You can use the AWS Cloud Development Kit (CDK)
  - This sample is implemented in CDK
- You must have a CloudWatch Logs log group containing the logs you want to analyze
  - Amazon Athena and AWS X-Ray are optional
  - If you want to invlude AWS CloudTrail or Application Load Balancer (ALB) access logs, an Amazon Athena database must be created
  - If AWS X-Ray trace information is also used, an AWS X-Ray trace for the relevant system must have been obtained
- Claude v3 Sonnet access has been granted from model access on Amazon Bedrock
- Confirm that an alarm notification will be sent to Slack from the AWS Chatbot set up in the existing workload
  - If you don't have the test envrionment for FA2 or you cannot use it for FA2. You can create test environment as follow [How to create a test environment for FA2](./docs/HowToCreateTestEnvironment_en.md).
- You must have the permission to register the Slack App to the Slack workspace you want to use.

## How to Deploy

### Registration of Slack App

1. Access to [Slack api](https://api.slack.com/apps) and click [create New App]
2. Select [From scratch], enter an app name, select the workspace you want to use when developing, and then click [Create App]
3. The app you created will be shown in [Slack api](https://api.slack.com/apps). Choose it you created.
4. Click [Basic Information] on the left menu, check [Signing Secret], execute the following command, and register with AWS Secrets Manager
   1. `$ aws secretsmanager create-secret --name slackSigningSecret --secret-string XXXXXXXXXXXXXXXXXXXX --profile {your_profile} `
5. Click [OAuth & Permissions] on the left menu, check [Bot User OAuth Token], execute the following command, and register with AWS Secrets Manager
   1. `$ aws secretsmanager create-secret --name slackAppToken --secret-string xxxx-111111111111111-11111111111111111-xxxxxxxxxxxxxxxxxxxxxxxxx-profile {your_profile} `

### Setting parameters

Refer to the following description, copy `parameter_template.ts`, create `parameter.ts`, and then change each value.

```
// Example: Settings for the Slack App version when using Claude 3 Sonnet and using CloudWatch Logs, Athena, and X-Ray as search targets
export const devParameter: AppParameter = {
  env: {
    account: "123456789012",
    region: "us-east-1",
  },
  language: "ja",
  envName: "Development",
  clientType: "SLACKAPP",
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  cwLogsLogGroups: [
    "ApiLogGroup", "/aws/ecs/containerinsights/EcsAppCluster/performance"
  ],
  cwLogsInsightQuery: "fields @message | limit 100",
  databaseName: "athenadatacatalog",
  albAccessLogTableName: "alb_access_logs",
  cloudTrailLogTableName: "cloud_trail_logs",
  xrayTrace: true,
};
```

#### Explanation of parameters

| Parameters               | Example value                                                             | Description                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env.account`            | `"123456789012"`                                                          | AWS Account ID to deploy this sample                                                                                                                                                        |
| `env.region`             | `"us-east-1"`                                                             | AWS Region to deploy this sample                                                                                                                                                            |
| `language`               | `"ja"`                                                                    | Language setting for prompt and UI. Choose one, `en` or `ja`.                                                                                                                               |
| `envName`                | `"Development"`                                                           | Environment name.                                                                                                                                                                           |
| `clientType`             | `"SLACKAPP"`                                                              | Client type you required. Choose `SLACKAPP` is in case of Slack App version.                                                                                                                |
| `modelId`                | `"anthropic.claude-3-sonnet-20240229-v1:0"`                               | Put the model ID of Amazon Bedrock you want to use. Please check access grants of chosen model.                                                                                             |
| `cwLogsLogGroups`        | `["ApiLogGroup", "/aws/ecs/containerinsights/EcsAppCluster/performance"]` | Specify the log group of Amazon CloudWatch Logs for which you want to retrieve logs. Up to 50 can be specified.                                                                             |
| `cwLogsInsightQuery`     | `"fields @message \| limit 100"`                                          | Specify the query you want to use with CloudWatch Logs Insight. Due to balance with the context window, the default limit is 100 (please modify the query according to actual environment). |
| `databaseName`           | `"athenadatacatalog"`                                                     | The name of the Amazon Athena database. Required if you want to use Athena to search logs.                                                                                                  |
| `albAccessLogTableName`  | `"alb_access_logs"`                                                       | ALB access log table name. In this sample, ALB access log search was implemented in Athena, so the ALB access log table name is specified when using it.                                    |
| `cloudTrailLogTableName` | `"cloud_trail_logs"`                                                      | AWS CloudTrail log table name. In this sample, we implemented a CloudTrail audit log log search in Athena, so specify the CloudTrail log table name when using it.                          |
| `xrayTrace`              | `true`                                                                    | A parameter for deciding whether to include AWS X-Ray trace information in the analysis                                                                                                     |

### Deployment

Follow below instruction,

```
$ npm install
$ npx cdk bootstrap --profile {your_profile}
$ npx cdk deploy --all --profile {your_profile} --require-approval never
```

#### Configuration of Slack App

1. After deploying the CDK, check the Amazon API Gateway endpoint URL
2. Access to [Slack api](https://api.slack.com/apps), select [Interactivity & Shortcuts] on the left menu of the displayed screen, set [Interactivity] to turn on, and enter the endpoint of Amazon API Gateway in [Request URL](example: https://{API Gateway endpoint}/v1/slack/events)
   1. If the API resource name hasn't changed, it will be /slack/events, as shown in the example
3. Next, click [Event Subscriptions] on the left menu, set [Enable Events] to turn on, then set [Reqeust URL] in the same way as [Interactivity]
4. Open [Subscribe to bot events] on the same screen, click [Add Bot User Event] and add `message.channels`
5. Additionally, add `channels:read` and `chat:write` in [Scopes] on the same screen (`channels:history` was automatically added when step 3 was performed, so we don't care here)
6. Once you've made it this far, a pop-up prompting you to reinstall will appear at the top of the screen, click on it and reinstall the Slack App on the target channel
   1. If you haven't subscribed to the target channel yet, join it yourself.

### Testing

Some kind of error occurred on the target system from which the log was output.
(This time, we used AWS FIS and caused a connection failure from the Amazon ECS container to Amazon DynamoDB.)
Then, the following alarm is displayed on the Slack channel.
(In the example, Amazon CloudWatch Synthetics is used to perform external monitoring, so this error occurs.)

![alarm-sample](./docs/images/en/fa2-slackapp-chatbot-alarm.png)

When a notification of the alarm is received, FA2 responds and displays a form like the one below

![fa2-form](./docs/images/en/fa2-slackapp-initial-form.png)

The alarm displayed earlier is confirmed, and the contents of the alarm and the time range for which the log is to be acquired are inputted to the displayed form.

\*The datapoints shown by AWS Chatbot are expressed in GMT, so please enter the form after converting it to your local time zone.

![fa2-form-input-sample](./docs/images/en/fa2-slackapp-put-value.png)

Clicked the button, requests are accepted.

![request-success](./docs/images/en/fa2-slackapp-receive-request.png)

Wait a few minutes, and the answers will appear in Slack.

![fa2-answer](./docs/images/en/fa2-slackapp-answer.png)

## Delete deployed resources

Please use below command to delete the resources you deployed

```
$ npx cdk destroy --profile {your_profile}
```

## Considerations

Since this source code is a sample, AWS WAF is not attached to the Amazon API Gateway.
Slack's endpoints are publicly exposed, so they can be targeted by attacks.
For production use, please consider using AWS WAF to reduce security risks.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.
