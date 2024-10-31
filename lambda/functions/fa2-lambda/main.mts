import { Handler } from "aws-lambda";
import { getSecret } from "@aws-lambda-powertools/parameters/secrets";
import { random, split } from "lodash";
import pLimit from "p-limit";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  queryToXray,
  queryToAthena,
  queryToCWLogs,
  queryToCWMetrics,
  generateMetricDataQuery,
  converse,
  listMetrics,
} from "../../lib/aws-modules.js";
import { Prompt } from "../../lib/prompts.js";
import { MessageClient } from "../../lib/message-client.js";
import { Language } from "../../../parameter.js";
import logger from "../../lib/logger.js"; 
import { convertMermaidToImage } from "../../lib/puppeteer.js";

export const handler: Handler = async (event: {
  errorDescription: string;
  startDate: string;
  endDate: string;
  channelId?: string;
  threadTs?: string;
}) => {
  // Event parameters
  logger.info("Request started", event);
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
  const slackAppTokenKey = process.env.SLACK_APP_TOKEN_KEY!;
  const architectureDescription = process.env.ARCHITECTURE_DESCRIPTION!;
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

  const token = await getSecret(slackAppTokenKey);
  const messageClient = new MessageClient(token!.toString(), lang);
  const prompt = new Prompt(lang, architectureDescription);

  // Check required variables.
  if (!modelId || !cwLogsQuery || !logGroups || !region || !channelId || !threadTs) {
    logger.error(`Not found any environment variables. Please check.`, {environemnts: {modelId, cwLogsQuery, logGroups, region, channelId, threadTs}});
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

  try {
    // Generate a query for getMetricData API
    const metrics = await listMetrics();
    const metricSelectionPrompt = prompt.createSelectMetricsForFailureAnalysisPrompt(errorDescription, JSON.stringify(metrics));
    const metricDataQuery = await generateMetricDataQuery(metricSelectionPrompt);

    // Send query to each AWS APIs in parallel.
    const limit = pLimit(5);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const input: Promise<any>[] = [
      limit(() => queryToCWLogs(startDate, endDate, logGroups, cwLogsQuery, "ApplicationLogs")),
      limit(() => queryToCWMetrics(startDate, endDate, metricDataQuery, "CWMetrics"))
    ];
  
    if (
      athenaDatabaseName &&
      athenaQueryOutputLocation &&
      albAccessLogTableName
    ) {
      // The rows used are limited. In this case, we didn't use success request to analyze failure root cause.
      // It's just sample query. Please you optimize to your situation.
      const albQuery = `SELECT * FROM ${albAccessLogTableName} WHERE time BETWEEN ? AND ? AND elb_status_code >= 400`;
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

    const results = await Promise.all(input);

    // Prompt
    const failureAnalysisPrompt =
      prompt.createFailureAnalysisPrompt(
        errorDescription,
        Prompt.getStringValueFromQueryResult(
          results,
          "ApplicationLogs",
        ),
        Prompt.getStringValueFromQueryResult(
          results,
          "CWMetrics",
        ),
        Prompt.getStringValueFromQueryResult(
          results,
          "AlbAccessLogs",
        ),
        Prompt.getStringValueFromQueryResult(
          results,
          "CloudTrailLogs",
        ),
        Prompt.getStringValueFromQueryResult(results, "XrayTraces")
      );

    logger.info("Made prompt", {prompt: failureAnalysisPrompt});

    const answer = await converse(failureAnalysisPrompt);

    if(!answer) throw new Error("No response from LLM");

    // We assume that threshold is 3,500. And it's not accurate. Please modify this value when you met error. 
    if(answer.length < 3500){
      // Send the answer to Slack directly.
      await messageClient.sendMessage(
        messageClient.createMessageBlock(answer),
        channelId,
        threadTs
      );
    }else{
      // Send the snippet of answer instead of message due to limitation of message size.
      await messageClient.sendMarkdownSnippet("answer.md", answer, channelId, threadTs)
    }

    logger.info('Success to get answer:', answer);

    // Create explanation how to get logs by operators.
    const howToGetLogs =
      messageClient.createHowToGetLogs(
        startDate,
        endDate,
        logGroups,
        cwLogsQuery,
        JSON.stringify(metricDataQuery),
        xrayTrace,
        Prompt.getStringValueFromQueryResult(results, "AlbAccessLogsQueryString"),
        Prompt.getStringValueFromQueryResult(results, "CloudTrailLogsQueryString")
      );
    logger.info('Success to create HowToGetLogs', {howToGetLogs});

    // Send the explanation to Slack directly.
    await messageClient.sendMarkdownSnippet(
      "HowToGet.md",
      howToGetLogs,
      channelId,
      threadTs
    );

    /* ****** */
    // Additional process. It shows the root cause on the image.
    // If you don't need it, please comment out below.
    const outputImageResponse = await converse(
      prompt.createImageGenerationPrompt(errorDescription, answer), 
      'anthropic.claude-3-5-sonnet-20240620-v1:0', 
    )
    const mermaidSyntax = split(split(outputImageResponse, '<OutputMermaidSyntax>')[1], '</OutputMermaidSyntax>')[0];
    logger.info('Success to create Mermaid syntax', {mermaidSyntax})

    const png = await convertMermaidToImage(mermaidSyntax)

    if(!png) {
      throw new Error("Failed to create Mermaid image")
    }

    await messageClient.sendFile(png, `fa2-output-image-${Date.now()}${random(100000000,999999999,false)}.png`, channelId, threadTs);
        
    // end of output image task
    /* ****** */

  } catch (error) {
    logger.error("Something happened", error as Error);
    // Send the form to retry when error was occured.
    if(channelId && threadTs){
      await messageClient.sendMessage(
        messageClient.createErrorMessageBlock(),
        channelId, 
        threadTs
      );
      await messageClient.sendMessage( 
        messageClient.createMessageBlock(
          lang === "ja" 
            ? "リトライしたい場合は、以下のフォームからもう一度同じ内容のリクエストを送ってください。" 
            : "If you want to retry it, you send same request again from below form."
        ),
        channelId, 
        threadTs
      );
      const now = toZonedTime(new Date(), "Asia/Tokyo");
      await messageClient.sendMessage(
        messageClient.createFormBlock(format(now, "yyyy-MM-dd"), format(now, "HH:mm")),
        channelId,
        threadTs
      )
    }
  }
  return;
};
