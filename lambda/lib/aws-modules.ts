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
  GuardDutyClient,
  GetFindingsCommand,
  GetFindingsCommandInput,
  ListFindingsCommandInput,
  ListFindingsCommand,
} from "@aws-sdk/client-guardduty";
import {
  SecurityHubClient,
  GetFindingsCommand as GetSecurityHubFindingsCommand,
  GetFindingsCommandInput as GetSecurityHubFindingsCommandInput,
} from "@aws-sdk/client-securityhub";
import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseCommandInput,
  InferenceConfiguration,
} from "@aws-sdk/client-bedrock-runtime";
import {
  BedrockAgentRuntimeClient,
  KnowledgeBaseRetrievalResult,
  RetrieveCommand,
  RetrieveCommandOutput,
  SearchType
} from "@aws-sdk/client-bedrock-agent-runtime";
import {
  LambdaClient,
  InvokeCommandInputType,
  InvokeCommand
} from "@aws-sdk/client-lambda";
import logger from './logger.js';
import {split} from 'lodash';

// To get CloudWatch metrics 
export async function listMetrics(){
  logger.info("Start", {funciton: listMetrics.name, input: {}});
  const client = new CloudWatchClient();
  // To get recently active metrics only
  const resListMetricsCommand = await client.send(new ListMetricsCommand({RecentlyActive: "PT3H"}));
  const metrics = resListMetricsCommand.Metrics;
  logger.info("End", {funciton: listMetrics.name, output: {metrics}});
  return metrics ? metrics : [] as Metric[];
}

export async function generateMetricDataQuery(
  prompt: string
){
  logger.info("Start", {funciton: generateMetricDataQuery.name, input: {prompt}});

  const converseOutput = await converse(prompt);
  const metricDataQuery = split(split(converseOutput, '<metricDataQuery>')[1], '</metricDataQuery>')[0];

  logger.info("End", {funciton: generateMetricDataQuery.name, output: {metricDataQuery}});

  return JSON.parse(metricDataQuery) as MetricDataQuery[];
}

export async function queryToCWMetrics(
  startDate: string,
  endDate: string,
  query: MetricDataQuery[],
  outputKey: string
){
  logger.info("Start", {funciton: queryToCWMetrics.name, input: {startDate, endDate, query, outputKey}});

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
  logger.info("End", {funciton: queryToCWMetrics.name, output: {metricsData}});
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
  logger.info("Start", {funciton: queryToCWLogs.name, input: {startDate, endDate, logGroups, queryString, outputKey}});

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

  logger.info("End", {funciton: queryToCWLogs.name, output: {resQueryResults}});

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
  logger.info("Start", {funciton: queryToAthena.name, input: {query, queryExecutionContext, queryParams, outputLocation, outputKey}});

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

  logger.info("End", {funciton: queryToAthena.name, output: {results, queryString}});
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
  logger.info("Start", {funciton: queryToXray.name, input: {startDate, endDate, outputKey}});
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

  logger.info("End", {funciton: queryToXray.name, output: {traces}});
  return { key: outputKey, value: traces };
}

export async function listGuardDutyFindings(detectorId: string, outputKey: string) {
  logger.info("Start", {funciton: listGuardDutyFindings.name, input: {detectorId, outputKey}});
  const guarddutyClient = new GuardDutyClient();

  let listFindingsCommandInput: ListFindingsCommandInput = {
    DetectorId: detectorId,
    FindingCriteria: {
      Criterion: {
        severity: {
          GreaterThanOrEqual: 7.0,
        },
      },
    },
  };
  let listFindingsCommand = new ListFindingsCommand(listFindingsCommandInput);
  let listFindingsResponse = await guarddutyClient.send(listFindingsCommand);
  const findingIds = listFindingsResponse.FindingIds
    ? listFindingsResponse.FindingIds
    : [];

  while (listFindingsResponse.NextToken) {
    listFindingsCommandInput = {
      ...listFindingsCommandInput,
      NextToken: listFindingsResponse.NextToken,
    };

    listFindingsCommand = new ListFindingsCommand(listFindingsCommandInput);
    listFindingsResponse = await guarddutyClient.send(listFindingsCommand);
    if (listFindingsResponse.FindingIds)
      findingIds.push(...listFindingsResponse.FindingIds);
  }

  const input: GetFindingsCommandInput = {
    DetectorId: detectorId,
    FindingIds: findingIds,
  };
  const getFindingsResponse = await guarddutyClient.send(new GetFindingsCommand(input));
  const findings = getFindingsResponse.Findings
    ? getFindingsResponse.Findings
    : [];

  logger.info("End", {funciton: listGuardDutyFindings.name, output: {numberOfFindings: findings.length, findings}});
  return { key: outputKey, value: findings };
}

export async function listSecurityHubFindings(outputKey: string) {
  logger.info("Start", {funciton: listSecurityHubFindings.name, input: {outputKey}});
  const securityHubClient = new SecurityHubClient();

  const getSecurityHubFindingsInput: GetSecurityHubFindingsCommandInput = {
    // Refer to configuration of Baseline Environment on AWS
    // https://github.com/aws-samples/baseline-environment-on-aws/blob/ef33275e8961f4305509eccfb7dc8338407dbc9f/usecases/blea-gov-base-ct/lib/construct/detection.ts#L334
    Filters: {
      SeverityLabel: [
        { Comparison: "EQUALS", Value: "CRITICAL" },
        { Comparison: "EQUALS", Value: "HIGH" },
      ],
      ComplianceStatus: [{ Comparison: "EQUALS", Value: "FAILED" }],
      WorkflowStatus: [
        { Comparison: "EQUALS", Value: "NEW" },
        { Comparison: "EQUALS", Value: "NOTIFIED" },
      ],
      RecordState: [{ Comparison: "EQUALS", Value: "ACTIVE" }],
    },
  };
  const getSecurityHubFindingsCommand = new GetSecurityHubFindingsCommand(
    getSecurityHubFindingsInput
  );

  const response = await securityHubClient.send(getSecurityHubFindingsCommand);
  logger.info("End", {funciton: listSecurityHubFindings.name, output: {numberOfFindings: response.Findings?.length, findings: response.Findings}});

  return { key: outputKey, value: response.Findings};
}

export async function converse(
  prompt: string, 
  modelId: string = process.env.QUALITY_MODEL_ID!,
  inferenceConfig: InferenceConfiguration = {
    maxTokens: 2000,
    temperature: 0.1,
    topP: 0.97
  }
){
  logger.info("Start", {funciton: converse.name, input: {prompt, modelId, inferenceConfig}});
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
    logger.info("End", {funciton: converse.name, output: {converseOutput}});
    return converseOutput.output?.message?.content![0].text;
  }catch(error){
    logger.error("Something happened", error as Error);
    return "";
  }
}

export async function invokeAsyncLambdaFunc(
  payload: string,
  functionName: string
) {
  logger.info("Start", {funciton: invokeAsyncLambdaFunc.name, input: {payload, functionName}});
  const lambdaClient = new LambdaClient();
  const input: InvokeCommandInputType = {
    FunctionName: functionName,
    InvocationType: "Event",
    Payload: payload
  };
  const invokeCommand = new InvokeCommand(input);
  logger.info("Send command", {command: invokeCommand});
  const res = await lambdaClient.send(invokeCommand);
  logger.info("End", {funciton: invokeAsyncLambdaFunc.name, output: {response: res}});
  return res;
}

export async function retrieve(knowledgeBaseId: string, retrieveQuery: string, rerankModelId: string|undefined, outputKey: string) {

  logger.info("Start", {function: retrieve.name, input: {knowledgeBaseId, retrieveQuery}});

  const client = new BedrockAgentRuntimeClient();
  try {
    const retrieveCommand = rerankModelId ? 
      new RetrieveCommand({
        knowledgeBaseId: knowledgeBaseId,
        retrievalQuery: {
          text: retrieveQuery,
        },
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            numberOfResults: 3,
            overrideSearchType: SearchType.HYBRID,
            rerankingConfiguration: {
              type: 'BEDROCK_RERANKING_MODEL',
              bedrockRerankingConfiguration: {
                modelConfiguration: {
                  modelArn: `arn:aws:bedrock:${process.env.AWS_REGION}::foundation-model/${rerankModelId}`,
                },
                numberOfRerankedResults: 3,
              }
            }
          },
        },
      }):
      new RetrieveCommand({
        knowledgeBaseId: knowledgeBaseId,
        retrievalQuery: {
          text: retrieveQuery,
        },
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            numberOfResults: 3,
            overrideSearchType: SearchType.HYBRID,
          }
        }
      })
    const retrieveResponse: RetrieveCommandOutput = await client.send(retrieveCommand);
    logger.info("End", {function: retrieve.name, output: {retrieveResponse}});
    return [{
      key: outputKey,
      value: retrieveResponse.retrievalResults!.map((result, index) => `[${index}]${result.content?.text}\n`)
    },{
      key: `${outputKey}RawData`,
      value: retrieveResponse.retrievalResults!.map((result, index) => {
        return {
          index: index,
          text: result.content?.text,
          source: result.location?.s3Location?.uri,
          score: result.score
        }
      })
    }]
  } catch (error) {
    logger.error("Something happend", error as Error);
    return [] as KnowledgeBaseRetrievalResult[];
  }
}
