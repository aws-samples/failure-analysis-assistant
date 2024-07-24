import {
  queryToXray,
  queryToAthena,
  queryToCWLogs,
  invokeModel,
} from "../../lib/aws-modules.js";
import { Handler } from "aws-lambda";
import { Logger } from "@aws-lambda-powertools/logger";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import axios from "axios";
import middy from "@middy/core";
import pLimit from "p-limit";
import {
  createPromptJa,
  createPromptEn,
  getStringValueFromQueryResult,
} from "../../lib/prompts.js";
import {
  createHowToGetLogsJa,
  createHowToGetLogsEn,
  sendMessageToClient,
  createAnswerBlockJa,
  createAnswerBlockEn,
  createAnswerMessageJa,
  createAnswerMessageEn,
  createErrorMessageBlockJa,
  createErrorMessageBlockEn,
} from "../../lib/messages.js";
import { Language } from "../../../parameter.js";

const logger = new Logger({ serviceName: "FA2" });

export const lambdaHandler: Handler = async (event: {
  errorDescription: string;
  startDate: string;
  endDate: string;
  responseUrl?: string;
  alarmName?: string;
  alarmTimestamp?: string;
}) => {
  // Event parameters
  logger.info(`Event: ${JSON.stringify(event)}`);
  const {
    errorDescription,
    startDate,
    endDate,
    responseUrl,
    alarmName,
    alarmTimestamp,
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
  const topicArn = process.env.TOPIC_ARN;

  // Check required variables.
  if (!modelId || !lang || !cwLogsQuery || !logGroups || !region) {
    logger.error(`Not found any environment variables. Please check them.`);
    if (responseUrl) {
      await axios.post(responseUrl, {
        text:
          lang && lang === "ja"
            ? "エラーが発生しました: 環境変数が設定されていない、または渡されていない可能性があります。"
            : "Error: Not found any environment variables.",
      });
    }
    return;
  }

  // Send query to each AWS APIs in parallel.
  const limit = pLimit(5);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const input: Promise<any>[] = [
    limit(() =>
      queryToCWLogs(
        startDate,
        endDate,
        logGroups,
        cwLogsQuery,
        "ApplicationLogs",
        logger,
      ),
    ),
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
          "AlbAccessLogs",
          logger,
        ),
      ),
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
          "CloudTrailLogs",
          logger,
        ),
      ),
    );
  }

  if (xrayTrace) {
    input.push(
      limit(() => queryToXray(startDate, endDate, "XrayTraces", logger)),
    );
  }

  try {
    const results = await Promise.all(input);

    // Prompt
    const prompt =
      lang === "ja"
        ? createPromptJa({
            errorDescription,
            applicationLogs: getStringValueFromQueryResult(
              results,
              "ApplicationLogs",
            ),
            albAccessLogs: getStringValueFromQueryResult(
              results,
              "AlbAccessLogs",
            ),
            cloudTrailLogs: getStringValueFromQueryResult(
              results,
              "CloudTrailLogs",
            ),
            xrayTraces: getStringValueFromQueryResult(results, "XrayTraces"),
          })
        : createPromptEn({
            errorDescription,
            applicationLogs: getStringValueFromQueryResult(
              results,
              "ApplicationLogs",
            ),
            albAccessLogs: getStringValueFromQueryResult(
              results,
              "AlbAccessLogs",
            ),
            cloudTrailLogs: getStringValueFromQueryResult(
              results,
              "CloudTrailLogs",
            ),
            xrayTraces: getStringValueFromQueryResult(results, "XrayTraces"),
          });

    logger.info(`Bedrock prompt: ${prompt}`);

    // If you want to tune parameters for LLM.
    const llmPayload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 2000,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    };

    const answer = await invokeModel(llmPayload, modelId, logger);

    // Create explanation to get logs by operators.
    const howToGetLogs =
      lang === "ja"
        ? createHowToGetLogsJa(
            startDate,
            endDate,
            logGroups,
            cwLogsQuery,
            xrayTrace,
            getStringValueFromQueryResult(results, "AlbAccessLogsQueryString"),
            getStringValueFromQueryResult(results, "CloudTrailLogsQueryString"),
          )
        : createHowToGetLogsEn(
            startDate,
            endDate,
            logGroups,
            cwLogsQuery,
            xrayTrace,
            getStringValueFromQueryResult(results, "AlbAccessLogsQueryString"),
            getStringValueFromQueryResult(results, "CloudTrailLogsQueryString"),
          );
    logger.info(`Bedrock answer: ${answer}`);

    if (responseUrl) {
      // Send answer that combined the explanation to Slack directly.
      await sendMessageToClient(
        lang === "ja"
          ? createAnswerBlockJa(answer, howToGetLogs)
          : createAnswerBlockEn(answer, howToGetLogs),
        responseUrl, // If you want to use Custom action, please pass the TopicARN for this parameter.
        logger,
      );
    } else if (alarmName && alarmTimestamp && topicArn) {
      // This case is sending answer via SNS topic and AWS Chatbot.
      await sendMessageToClient(
        lang === "ja"
          ? createAnswerMessageJa(
              alarmName,
              alarmTimestamp,
              answer,
              howToGetLogs,
            )
          : createAnswerMessageEn(
              alarmName,
              alarmTimestamp,
              answer,
              howToGetLogs,
            ),
        topicArn!, // If you want to use Custom action, please pass the TopicARN for this parameter.
        logger,
      );
    }
  } catch (error) {
    logger.error(`${JSON.stringify(error)}`);
    if (responseUrl) {
      // Send answer that combined the explanation to Slack directly.
      await sendMessageToClient(
        lang === "ja"
          ? createErrorMessageBlockJa()
          : createErrorMessageBlockEn(),
        responseUrl, // If you want to use Custom action, please pass the TopicARN for this parameter.
        logger,
      );
    } else if (alarmName && alarmTimestamp && topicArn) {
      // This case is sending answer via SNS topic and AWS Chatbot.
      await sendMessageToClient(
        lang === "ja"
          ? createErrorMessageBlockJa()
          : createErrorMessageBlockEn(),
        topicArn!, // If you want to use Custom action, please pass the TopicARN for this parameter.
        logger,
      );
    }
  }
  return;
};

export const handler = middy(lambdaHandler).use(injectLambdaContext(logger));
