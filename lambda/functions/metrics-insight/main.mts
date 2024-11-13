import { Handler } from "aws-lambda";
import { sub } from "date-fns";
import { listMetrics, queryToCWMetrics, generateMetricDataQuery, converse } from "../../lib/aws-modules.js";
import { Prompt } from "../../lib/prompts.js";
import { MessageClient } from "../../lib/message-client.js";
import { Language } from "../../../parameter.js";
import logger from "../../lib/logger.js"; 

export const handler: Handler = async (event: {
  query: string;
  duration: number;
}) => {
  // Event parameters
  logger.info("Request started", event);
  const {
    query,
    duration
  } = event;

  // Environment variables
  const modelId = process.env.MODEL_ID;
  const lang: Language = process.env.LANG
    ? (process.env.LANG as Language)
    : "en";
  const architectureDescription = process.env.ARCHITECTURE_DESCRIPTION!;
  const region = process.env.AWS_REGION;
  const topicArn = process.env.TOPIC_ARN;

  const messageClient = new MessageClient(topicArn!.toString(), lang);
  const prompt = new Prompt(lang, architectureDescription);

  // Check required variables.
  if (!modelId || !region) {
    logger.error(`Not found any environment variables. Please check them.`);
    messageClient.sendMessage(messageClient.createErrorMessage());
    return;
  }

  if (duration > 14 && duration < 1){
    logger.error("Duration is not correct", {duration});
    messageClient.sendMessage("メトリクス取得期間は1から14で入力してください。");
    return;
  }
  // Convert from duration to datetime
  const now = new Date();
  const pastTime = sub(now,{days: Number(duration)});

  try {
    // Generate a query for getMetricData API
    const metrics = await listMetrics();
    const metricSelectionPrompt = prompt.createSelectMetricsForInsightPrompt(query, JSON.stringify(metrics), duration)
    const metricDataQuery = await generateMetricDataQuery(metricSelectionPrompt);

    const results = await queryToCWMetrics(pastTime.toISOString(), now.toISOString(), metricDataQuery, "CWMetrics");

    const metricsInsightPrompt = 
        prompt.createMetricsInsightPrompt(query, JSON.stringify(results.value));
    logger.info("Made prompt", {prompt: metricsInsightPrompt})

    const answer = await converse(metricsInsightPrompt);
    if(!answer) throw new Error("No response from LLM");

    logger.info("Answer", answer);

    await messageClient.sendMessage(messageClient.createMetricsInsightMessage(answer)); 

  } catch (error) {
    logger.error("Something happened", error as Error);
    // Send the form to retry when error was occured.
    await messageClient.sendMessage(messageClient.createErrorMessage());
  }
  
  return;
}
