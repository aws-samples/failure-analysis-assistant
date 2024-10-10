import { Handler } from "aws-lambda";
import { getSecret } from "@aws-lambda-powertools/parameters/secrets";
import pLimit from "p-limit";
import {
  queryToXray,
  queryToAthena,
  queryToCWLogs,
  invokeModel,
  getCWMetrics
} from "../../lib/aws-modules.js";
import {
  createFailureAnalysisPrompt,
  getStringValueFromQueryResult
} from "../../lib/prompts.js";
import { MessageClient } from "../../lib/message-client.js";
import { Language } from "../../../parameter.js";
import logger from "../../lib/logger.js"; 


export const handler: Handler = async (event: {
  errorDescription: string;
  startDate: string;
  endDate: string;
  channelId?: string;
  threadTs?: string;
  alarmName?: string;
  alarmTimestamp?: string;
}) => {
  // Event parameters
  logger.info(`Event: ${JSON.stringify(event)}`);
  const {
    errorDescription,
    startDate,
    endDate,
    channelId,
    threadTs,
  } = event;

  // Environment variables
  const modelId = process.env.MODEL_ID;
  const lang: Language = process.env.LANG
    ? (process.env.LANG as Language)
    : "en";
  const cwLogsQuery = process.env.CW_LOGS_INSIGHT_QUERY!;
  const logGroups = (
    JSON.parse(process.env.CW_LOGS_LOGGROUPS!) as { loggroups: string[] }
  ).loggroups;
  const xrayTrace =
    process.env.XRAY_TRACE && process.env.XRAY_TRACE === "true" ? true : false;
  const albAccessLogTableName = process.env.ALB_ACCESS_LOG_TABLE_NAME;
  const cloudTrailLogTableName = process.env.CLOUD_TRAIL_LOG_TABLE_NAME;
  const region = process.env.AWS_REGION;
  const athenaDatabaseName = process.env.ATHENA_DATABASE_NAME;
  const athenaQueryOutputLocation = `s3://${process.env.ATHENA_QUERY_BUCKET}/`;

  const token = await getSecret("SlackAppToken");
  const messageClient = new MessageClient(token!.toString(), lang);

  // Check required variables.
  if (!modelId || !cwLogsQuery || !logGroups || !region || !channelId || !threadTs) {
    logger.error(`Not found any environment variables. Please check them.`);
    if (channelId && threadTs) {
      messageClient.sendMessage(
        lang && lang === "ja"
          ? "エラーが発生しました: 環境変数が設定されていない、または渡されていない可能性があります。"
          : "Error: Not found any environment variables.",
        channelId, 
        threadTs
      );
    }
    return;
  }

  // Send query to each AWS APIs in parallel.
  const limit = pLimit(5);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const input: Promise<any>[] = [
    limit(() => queryToCWLogs(startDate, endDate, logGroups, cwLogsQuery, "ApplicationLogs")),
    limit(() => getCWMetrics(startDate, endDate, errorDescription, "CWMetrics"))
  ];

  if (
    athenaDatabaseName &&
    athenaQueryOutputLocation &&
    albAccessLogTableName
  ) {
    // The rows used are limited. In this case, we didn't use success request to analyze failure root cause.
    // It's just sample query. Please you optimize to your situation.
    const albQuery = `SELECT * FROM ${albAccessLogTableName} WHERE time BETWEEN ? AND ? AND elb_status_code > 400`;
    const albQueryParams = [startDate, endDate];
    input.push(
      limit(() =>
        queryToAthena(
          albQuery,
          {
            Database: athenaDatabaseName,
          },
          albQueryParams,
          athenaQueryOutputLocation,
          "AlbAccessLogs"
        ),
      )
    );
  }

  if (
    athenaDatabaseName &&
    athenaQueryOutputLocation &&
    cloudTrailLogTableName
  ) {
    // The columns used are limited. In this case, we thought that all columns are not required for failure analysis.
    // It's just sample query. Please you optimize to your situation.
    const trailQuery = `SELECT eventtime, eventsource, eventname, awsregion, sourceipaddress, errorcode, errormessage FROM ${cloudTrailLogTableName} WHERE eventtime BETWEEN ? AND ? AND awsregion = ? AND sourceipaddress LIKE ?`;
    const trailQueryParams = [startDate, endDate, region, "%.amazonaws.com"];
    input.push(
      limit(() =>
        queryToAthena(
          trailQuery,
          {
            Database: athenaDatabaseName,
          },
          trailQueryParams,
          athenaQueryOutputLocation,
          "CloudTrailLogs"
        ),
      )
    );
  }

  if (xrayTrace) {
    input.push(
      limit(() => queryToXray(startDate, endDate, "XrayTraces"))
    );
  }

  try {
    const results = await Promise.all(input);

    // Prompt
    const prompt =
      createFailureAnalysisPrompt(
        lang,
        errorDescription,
        getStringValueFromQueryResult(
          results,
          "ApplicationLogs",
        ),
        getStringValueFromQueryResult(
          results,
          "CWMetrics",
        ),
        getStringValueFromQueryResult(
          results,
          "AlbAccessLogs",
        ),
        getStringValueFromQueryResult(
          results,
          "CloudTrailLogs",
        ),
        getStringValueFromQueryResult(results, "XrayTraces")
      );

    logger.info(`Bedrock prompt: ${prompt}`);

    // If you want to tune parameters for LLM.
    const llmPayload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 2000,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }]
    };

    const answer = await invokeModel(llmPayload, modelId);

    logger.info(`Bedrock answer: ${answer}`);

    // Create explanation to get logs by operators.
    const howToGetLogs =
      messageClient.createHowToGetLogs(
        startDate,
        endDate,
        logGroups,
        cwLogsQuery,
        xrayTrace,
        getStringValueFromQueryResult(results, "AlbAccessLogsQueryString"),
        getStringValueFromQueryResult(results, "CloudTrailLogsQueryString")
      );

      // Send answer that combined the explanation to Slack directly.
      await messageClient.sendMessage(
        messageClient.createAnswerBlock(answer, howToGetLogs),
        channelId,
        threadTs
      );
    
  } catch (error) {
    logger.error(`${JSON.stringify(error)}`);
    // Send answer that combined the explanation to Slack directly.
    if(channelId && threadTs){
      await messageClient.sendMessage( 
        messageClient.createErrorMessageBlock(),
        channelId, 
        threadTs
      );
    }
  }
  return;
};
