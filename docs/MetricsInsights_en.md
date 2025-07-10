# Metrics Analysis

Metrics Analysis Support is a feature that utilizes AWS CloudWatch metrics to analyze system status and issues. With this feature, users can simply input queries in natural language to automatically identify relevant metrics and obtain analysis results.

## Key Features

1. **Natural Language Query Processing**
   - When users input queries in natural language, the system analyzes them to infer relevant AWS namespaces
   - Example: From a query like "Investigate why CPU utilization is high on EC2 instances," the system automatically identifies the AWS/EC2 namespace

2. **Intelligent Metric Selection**
   - Automatically selects the most relevant metrics based on query content
   - Identifies appropriate metrics from multiple namespaces (EC2, ECS, RDS, Lambda, etc.)

3. **Advanced Analysis and Insights**
   - Retrieves data for selected metrics and performs statistical analysis
   - Detects anomalies and analyzes trends to provide insights for identifying root causes

4. **Clear Report Generation**
   - Formats analysis results in Markdown and sends them to Slack
   - Provides comprehensive reports including statistical information

## How to Use

You type `/insight` in the Slack chat form and send, a modal will be displayed.
In the modal form, enter [the question you want answered based on the metrics] and [the period you want to obtain the metrics].
In about 1-2 minutes, you'll get an answer.

The following example asks questions about ECS performance.

![insight-form](./docs/images/en/fa2-insight-form.png)

![query-about-ecs-performance](./docs/images/en/fa2-query-about-ecs-performance.png)

## Technical Mechanism

1. Infer relevant AWS namespaces from user queries (using Bedrock LLM)
2. Retrieve a list of metrics from the inferred namespaces
3. Generate optimal MetricDataQuery based on the query and metrics list (using Bedrock LLM)
4. Retrieve actual metrics data using the CloudWatch API
5. Analyze the retrieved data and generate insights (using Bedrock LLM)
6. Format results in Markdown and send to Slack

## Configuration

To enable Metrics Analysis Support, configure the following in the `parameter.ts` file:

```typescript
export const devParameter: AppParameter = {
  // Other settings...
  slashCommands: {
    insight: true,  // Enable Metrics Analysis Support
    // Other settings...
  },
  // Other settings...
};
```

### [Optional] Slack App Configuration for Metrics Analysis Support

1. Click on [Slash Commands] in the left menu, then click [Create New Command]
2. Enter the values as shown in the table below, and click [Save] when you have entered them all

   | Item Name | Value |
   | --------- | ----- |
   | Command | /insight |
   | Request URL | Same URL as the Request URL |
   | Short Description | Get insight for your workload |

3. Click on [App Home] in the left menu, and check [Allow users to send Slash commands and messages from the messages tab] in the [Message Tab] section
   - This makes it easier to execute and receive results from Metrics Analysis Support in the Slack App's DM area
4. Click on [OAuth & Permissions] in the left menu, and add `commands` in the [Scopes] section

## Implementation Details

The Metrics Analysis Support feature consists of the following main components:

1. **Lambda Function**: `lambda/functions/metrics-insight/main.mts`
   - Processes user queries, identifies relevant metrics, and performs analysis
   - Integrates Bedrock service and CloudWatch service

2. **Metrics Tool**: `lambda/lib/tool-executors/metrics-tool.ts`
   - Tool for retrieving and analyzing CloudWatch metrics
   - Performs basic statistical calculations and anomaly detection

3. **Prompt Generation**: `lambda/lib/prompt.ts`
   - Generates prompts to send to the LLM
   - Provides specialized prompts for namespace inference, metric selection, and insight generation
