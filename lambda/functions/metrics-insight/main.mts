import { Handler } from "aws-lambda";
import { getSecret } from "@aws-lambda-powertools/parameters/secrets";
import { listMetrics, queryToCWMetrics, generateMetricDataQuery, converse } from "../../lib/aws-modules.js";
import { Prompt } from "../../lib/prompts.js";
import { MessageClient } from "../../lib/message-client.js";
import { Language } from "../../../parameter.js";
import logger from "../../lib/logger.js"; 

export const handler: Handler = async (event: {
  query: string;
  startDate: string;
  endDate: string;
  channelId?: string;
}) => {
  // Event parameters
  logger.info("Request started", event);
  const {
    query,
    startDate,
    endDate,
    channelId
  } = event;

  // Environment variables
  const modelId = process.env.MODEL_ID;
  const lang: Language = process.env.LANG
    ? (process.env.LANG as Language)
    : "en";
  const slackAppTokenKey = process.env.SLACK_APP_TOKEN_KEY!;
  const architectureDescription = process.env.ARCHITECTURE_DESCRIPTION!;
  const region = process.env.AWS_REGION;
  const token = await getSecret(slackAppTokenKey);
  const messageClient = new MessageClient(token!.toString(), lang);
  const prompt = new Prompt(lang, architectureDescription);

  // Check required variables.
  if (!modelId || !region || !channelId ) {
    logger.error(`Not found any environment variables. Please check them.`, {environments: {modelId, region, channelId}});
    if (channelId) {
      messageClient.sendMessage(
        lang && lang === "ja"
          ? "エラーが発生しました: 環境変数が設定されていない、または渡されていない可能性があります。"
          : "Error: Not found any environment variables.",
        channelId,
      );
    }
    return;
  }

  try {
    // Generate a query for getMetricData API
    const metrics = await listMetrics();
    const metricSelectionPrompt = prompt.createSelectMetricsForInsightPrompt(query, JSON.stringify(metrics), ((new Date(endDate)).getTime() - (new Date(startDate)).getTime())/(1000 * 60 * 60* 24))
    const metricDataQuery = await generateMetricDataQuery(metricSelectionPrompt);

    const results = await queryToCWMetrics(startDate, endDate, metricDataQuery, "CWMetrics");

    const metricsInsightPrompt = 
        prompt.createMetricsInsightPrompt(query, JSON.stringify(results.value));
    logger.info("Made prompt", {prompt: metricsInsightPrompt})

    const answer = await converse(metricsInsightPrompt);
    if(!answer) throw new Error("No response from LLM");

    logger.info("Answer", answer);

    if(answer.length < 3500){
      // Send the answer to Slack directly.
      await messageClient.sendMessage(
        messageClient.createMessageBlock(answer),
        channelId,
      );
    }else{
      // Send the snippet of answer instead of message due to limitation of message size.
      await messageClient.sendMarkdownSnippet("answer.md", answer, channelId)
    }
  } catch (error) {
    logger.error("Something happened", error as Error);
    // Send the form to retry when error was occured.
    if(channelId){
      await messageClient.sendMessage(
        messageClient.createErrorMessageBlock(),
        channelId
      );
    }
  }
  
  return;
}
