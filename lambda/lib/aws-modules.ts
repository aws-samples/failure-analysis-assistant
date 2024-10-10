// This file is wrapper of AWS SDK.
import {
  CloudWatchClient,
  GetMetricDataCommand,
  GetMetricDataCommandInput,
  ListMetricsCommand,
  Metric,
  MetricDataQuery,
  MetricDataResult
} from '@aws-sdk/client-cloudwatch';
import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
  StartQueryCommandInput,
  QueryStatus
} from "@aws-sdk/client-cloudwatch-logs";
import {
  AthenaClient,
  GetQueryExecutionCommand,
  GetQueryResultsCommand as AthenaGetQueryResultsCommand,
  StartQueryExecutionCommand,
  QueryExecutionState,
  Row
} from "@aws-sdk/client-athena";
import {
  GetTraceSummariesCommand,
  TimeRangeType,
  TraceSummary,
  XRayClient
} from "@aws-sdk/client-xray";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  ConverseCommand,
  ConverseCommandInput,
  Message
} from "@aws-sdk/client-bedrock-runtime";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import {
  LambdaClient,
  InvokeCommandInputType,
  InvokeCommand
} from "@aws-sdk/client-lambda";
import { createSelectMetricsPrompt } from './prompts.js';
import logger from './logger.js';
import {split} from 'lodash';

// It's a tool to be used from ToolUse of LLM.
function listMetricsTool() {
  return {
    toolSpec: {
      name: "ListMetrics",
      inputSchema: {
        "json": {
          "type": "object",
          "properties": {
              "Namespace": {
                "type": "string",
                "description": "The metric namespace to filter against. Only the namespace that matches exactly will be returned."
              },
              "MetricName": {
                "type": "string",
                "description": "The name of the metric to filter against. Only the metrics with names that match exactly will be returned."
              },
              "Dimensions": {
                "description": "The dimensions to filter against. Only the dimensions that match exactly will be returned.",
                "items": {
                "type": "object",
                "properties": {
                  "Name": {"type": "string"},
                  "Value": {"type": "string"}
                }
              }
              },
              "NextToken": {
                "type": "string",
                "description": "The token returned by a previous call to indicate that there is more data available."
              },
              "RecentlyActive": {
                "type": "string",
                "description": "To filter the results to show only metrics that have had data points published in the past three hours, specify this parameter with a value of PT3H. This is the only valid value for this parameter.The results that are returned are an approximation of the value you specify. There is a low probability that the returned results include metrics with last published data as much as 40 minutes more than the specified time interval."
              },
              "IncludeLinkedAccounts": {
                "type": "boolean",
                "description": "If you are using this operation in a monitoring account, specify true to include metrics from source accounts in the returned data. The default is false."
              },
              "OwningAccount": {
                "type": "string",
                "description": "When you use this operation in a monitoring account, use this field to return metrics only from one source account. To do so, specify that source account ID in this field, and also specify true for IncludeLinkedAccounts."
              }
          },
          "required": []
        }
      }
    }
  };
}

// It's a tool to get CloudWatch metrics via ToolUse
async function listMetrics(){
  logger.info('listMetrics started');
  const client = new CloudWatchClient();
  const resListMetricsCommand = await client.send(new ListMetricsCommand());
  const metrics = resListMetricsCommand.Metrics;
  logger.info(`ListMetrics ended: ${JSON.stringify(metrics)}`);
  return metrics ? metrics : [] as Metric[];
}

// The method of calling ToolUse 
export async function getCWMetrics(
  startDate: string,
  endDate: string,
  errorDescription: string,
  outputKey: string
){
  logger.info(`ToolUse for CloudWatch Metrics Input: ${startDate}, ${endDate}, ${outputKey}`);

  const client = new BedrockRuntimeClient();

  const messages:Message[] = [
      {
        "role": "user",
        "content": [{"text": createSelectMetricsPrompt(errorDescription)}]
      }
    ];
  const converseCommandInput :ConverseCommandInput = {
    modelId: process.env.MODEL_ID,
    messages,
    toolConfig: {
      tools: [
        listMetricsTool(),
      ],
      toolChoice: {
        tool: {name: "ListMetrics"}
      }
    }
  }

  const converseOutput = await client.send(new ConverseCommand(converseCommandInput));
  messages.push(converseOutput.output!.message!);
  
  if(converseOutput.stopReason === "tool_use"){
    const toolRequests = converseOutput.output?.message?.content;
    if(toolRequests && toolRequests.length > 0){
      for(const tr of toolRequests){
        const tool = tr['toolUse'];
        if(tool){
          logger.info(`Requesting tool ${tool['name']}, Request: ${tool['toolUseId']}`);
          const metrics = await listMetrics();
          const toolResult = {
            "toolUseId": tool["toolUseId"],
            "content": [{"text": JSON.stringify(metrics)}]
          };
          const toolResultMessage:Message = {
            "role": "user",
            "content": [{
              "toolResult": toolResult
            }]
          };
          messages.push(toolResultMessage);
        }
      }
    }
  };

  const response = await client.send(new ConverseCommand({
    modelId:process.env.MODEL_ID,
    messages,
    toolConfig: {
      tools: [
        listMetricsTool(), // LLM always use this tool in ToolUse by this parameter.
      ],
    }
  }));

  logger.info(`ToolUse result: ${JSON.stringify(response.output)}`);

  const metricDataQuery = split(split(response.output!.message!.content![0].text!, '<MetricDataQuery>')[1], '</MetricDataQuery>')[0];

  logger.info(`MetricDataQuery: ${metricDataQuery}`);

  return await queryToCWMetrics(startDate, endDate, JSON.parse(metricDataQuery), outputKey);
}

async function queryToCWMetrics(
  startDate: string,
  endDate: string,
  query: MetricDataQuery[],
  outputKey: string
){
  logger.info(
    `QueryToCW metrics Input: ${startDate}, ${endDate}, ${JSON.stringify(query)}`,
  );

  const client = new CloudWatchClient();

  const input: GetMetricDataCommandInput = {
    MetricDataQueries: query,
    StartTime: new Date(startDate),
    EndTime: new Date(endDate) 
  };

  let resGetMetricDataCommand = await client.send(new GetMetricDataCommand(input))
  const metricsData = resGetMetricDataCommand.MetricDataResults ? resGetMetricDataCommand.MetricDataResults : [] as MetricDataResult[];

  while(resGetMetricDataCommand.NextToken){
    resGetMetricDataCommand = await client.send(new GetMetricDataCommand({NextToken: resGetMetricDataCommand.NextToken, ...input}));
    if(resGetMetricDataCommand.MetricDataResults){
      metricsData.push(...resGetMetricDataCommand.MetricDataResults);
    }
  }
  logger.info(
    `QueryToCW metrics Output: ${JSON.stringify(metricsData)}`
  );
  return { key: outputKey, value: metricsData };
}

function iso8601ToMilliseconds(isoDate: string): number {
  const date = new Date(isoDate);
  return date.getTime();
}

// For CloudWatch Logs Insight
export async function queryToCWLogs(
  startDate: string,
  endDate: string,
  logGroups: string[],
  queryString: string,
  outputKey: string
) {
  logger.info(`QueryToCWLogs Input: ${startDate}, ${endDate}, ${logGroups.join(", ")}, ${queryString}`);

  const client = new CloudWatchLogsClient();

  const input: StartQueryCommandInput = {
    logGroupNames: [...logGroups],
    startTime: iso8601ToMilliseconds(startDate),
    endTime: iso8601ToMilliseconds(endDate),
    queryString
  };
  const startQueryCommand = new StartQueryCommand(input);
  const resStartQuery = await client.send(startQueryCommand);

  const getQueryResultsCommand = new GetQueryResultsCommand({
    queryId: resStartQuery.queryId
  });
  let resQueryResults = await client.send(getQueryResultsCommand);

  while (
    resQueryResults.status == QueryStatus.Running ||
    resQueryResults.status == QueryStatus.Scheduled
  ) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    resQueryResults = await client.send(getQueryResultsCommand);
  }

  logger.info(`QueryToCWLogs Output: ${resQueryResults.results}`);

  return { key: outputKey, value: resQueryResults.results };
}

// This method is to transform from Rows type to CSV.
// Because Rows type makes prompt's context more big.
// So we need to decrease token size by transformation.
function rowsToCSV(rows: Row[]) {
  return rows
    .map((row) => row.Data!.map((data) => data.VarCharValue).join(","))
    .join("\n");
}

// For Athena. For example, CloudTrail Logs and ELB Access Logs, etc.
export async function queryToAthena(
  query: string,
  queryExecutionContext: { Database: string },
  queryParams: string[],
  outputLocation: string,
  outputKey: string
) {
  logger.info(`QueryToAthena Input: ${query}, ${queryExecutionContext.Database}`);
  
  const athenaClient = new AthenaClient();

  let results = [] as Row[];

  const startQueryExecutionCommand: StartQueryExecutionCommand =
    new StartQueryExecutionCommand({
      QueryString: query,
      QueryExecutionContext: queryExecutionContext,
      ExecutionParameters: queryParams,
      ResultConfiguration: {
        OutputLocation: outputLocation
      }
    });

  const { QueryExecutionId } = await athenaClient.send(
    startQueryExecutionCommand
  );

  const getQueryExecutionCommand = new GetQueryExecutionCommand({
    QueryExecutionId
  });
  let queryExecution = await athenaClient.send(getQueryExecutionCommand);

  // Loop to check the completion of query
  while (
    queryExecution.QueryExecution?.Status?.State ==
      QueryExecutionState.QUEUED ||
    queryExecution.QueryExecution?.Status?.State == QueryExecutionState.RUNNING
  ) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    queryExecution = await athenaClient.send(getQueryExecutionCommand);
  }

  // Get result of query
  let getQueryResultsCommand = new AthenaGetQueryResultsCommand({
    QueryExecutionId
  });
  let queryResults = await athenaClient.send(getQueryResultsCommand);
  results =
    queryResults.ResultSet && queryResults.ResultSet.Rows
      ? queryResults.ResultSet.Rows
      : [];

  // Loop to get all results
  while (queryResults.NextToken) {
    getQueryResultsCommand = new AthenaGetQueryResultsCommand({
      QueryExecutionId,
      NextToken: queryResults.NextToken
    });
    queryResults = await athenaClient.send(getQueryResultsCommand);
    (results as Row[]).push(
      ...(queryResults.ResultSet && queryResults.ResultSet.Rows
        ? queryResults.ResultSet.Rows
        : []));
  }

  // Do not use for query to run on Athena. Just use for the explanation how to get Logs
  const queryString = query.replace(
    /\?/g,
    // eslint-disable-next-line no-constant-binary-expression
    () => `'${queryParams.shift()}'` || ""
  );

  logger.info(`QueryToAthena Output: ${JSON.stringify(results)}`);
  // To decrease total tokens, transforming from rows to csv format.
  return [
    { key: outputKey, value: rowsToCSV(results) },
    { key: `${outputKey}QueryString`, value: queryString }
  ];
}

// For X-Ray
export async function queryToXray(
  startDate: string,
  endDate: string,
  outputKey: string
) {
  logger.info(`QueryToXRay Input: ${startDate}, ${endDate}`);
  const client = new XRayClient();
  const input = {
    StartTime: new Date(startDate),
    EndTime: new Date(endDate),
    TimeRangeType: TimeRangeType.Event
  };
  let command = new GetTraceSummariesCommand(input);
  let response = await client.send(command);
  const traces = response.TraceSummaries
    ? response.TraceSummaries
    : ([] as TraceSummary[]);

  while (response.NextToken) {
    command = new GetTraceSummariesCommand({
      ...input,
      NextToken: response.NextToken
    });
    response = await client.send(command);
    if (response.TraceSummaries) traces.push(...response.TraceSummaries);
  }

  logger.info(`QueryToXRay Output: ${JSON.stringify(traces)}`);
  return { key: outputKey, value: traces };
}

// To invoke Bedrock's LLM
export async function invokeModel(
  llmPayload: {
    anthropic_version: string;
    max_tokens: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: any;
  },
  modelId: string
): Promise<string> {
  logger.info(`InvokeModel Input: ${JSON.stringify(llmPayload)}`);
  const bedrockClient = new BedrockRuntimeClient();

  const invokeModelCommand = new InvokeModelCommand({
    contentType: "application/json",
    body: JSON.stringify(llmPayload),
    modelId
  });

  const bedrockInvokeModelResponse =
    await bedrockClient.send(invokeModelCommand);
  const decodedResponseBody = new TextDecoder().decode(
    bedrockInvokeModelResponse.body
  );

  logger.info(`InvokeModel Output: ${JSON.parse(decodedResponseBody).content[0].text}`);

  return JSON.parse(decodedResponseBody).content[0].text;
}

// To publish the message, like a answer and a error message, via SNS.
export async function publish(
  topicArn: string,
  message: string
) {
  logger.info(`Publish Input: ${topicArn}, ${message}`);
  const snsClient = new SNSClient();
  try {
    const res = await snsClient.send(
      new PublishCommand({
        TopicArn: topicArn,
        Message: message,
        MessageStructure: "default"
      }),
    );
    logger.info(`Publish Output: ${res.MessageId}, ${res.SequenceNumber}, ${JSON.stringify(res.$metadata)}`);
    
  } catch (error) {
    logger.error(`${JSON.stringify(error)}`);
  }
}

export async function invokeAsyncLambdaFunc(
  payload: string,
  functionName: string
) {
  logger.info(`InvokeAsyncLambda input: ${payload}, ${functionName}`);
  const lambdaClient = new LambdaClient();
  const input: InvokeCommandInputType = {
    FunctionName: functionName,
    InvocationType: "Event",
    Payload: payload
  };
  const invokeCommand = new InvokeCommand(input);
  logger.info(`send command: ${invokeCommand}`);
  const res = await lambdaClient.send(invokeCommand);
  return res;
}
