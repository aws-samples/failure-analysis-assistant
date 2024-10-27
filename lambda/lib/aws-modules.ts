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
  ConverseCommand,
  ConverseCommandInput,
  InferenceConfiguration,
} from "@aws-sdk/client-bedrock-runtime";
import {
  LambdaClient,
  InvokeCommandInputType,
  InvokeCommand
} from "@aws-sdk/client-lambda";
import logger from './logger.js';
import {split} from 'lodash';

// To get CloudWatch metrics 
export async function listMetrics(){
  logger.info('listMetrics started');
  const client = new CloudWatchClient();
  // To get recently active metrics only
  const resListMetricsCommand = await client.send(new ListMetricsCommand({RecentlyActive: "PT3H"}));
  const metrics = resListMetricsCommand.Metrics;
  logger.info(`ListMetrics ended: ${JSON.stringify(metrics)}`);
  return metrics ? metrics : [] as Metric[];
}

export async function generateMetricDataQuery(
  prompt: string
){
  logger.info(`GenerateMetricDataQuery Input: ${prompt}`);

  const converseOutput = await converse(prompt);
  const metricDataQuery = split(split(converseOutput, '<MetricDataQuery>')[1], '</MetricDataQuery>')[0];

  logger.info(`MetricDataQuery: ${metricDataQuery}`);

  return JSON.parse(metricDataQuery) as MetricDataQuery[];
}

export async function queryToCWMetrics(
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

  logger.info(`QueryToCWLogs Output: ${JSON.stringify(resQueryResults.results)}`);

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

export async function converse(
  prompt: string, 
  modelId: string = process.env.MODEL_ID!,
  inferenceConfig: InferenceConfiguration = {
    maxTokens: 2000,
    temperature: 0.1,
    topP: 0.97
  }
){
  const client = new BedrockRuntimeClient();
  const converseCommandInput :ConverseCommandInput = {
    modelId,
    messages: [
      {
        "role": "user",
        "content": [{"text": prompt}]
      }
    ],
    inferenceConfig,
  }
  try{
    const converseOutput = await client.send(new ConverseCommand(converseCommandInput));
    return converseOutput.output?.message?.content![0].text;
  }catch(e){
    logger.error(JSON.stringify(e));
    return "";
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
