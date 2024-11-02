import {
  APIGatewayProxyCallbackV2,
  APIGatewayProxyEvent,
  Context,
} from "aws-lambda";
import { App, AwsLambdaReceiver, BlockAction, RespondArguments, SayArguments } from "@slack/bolt";
import { getSecret } from "@aws-lambda-powertools/parameters/secrets";
import { format, sub } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { MessageClient } from "../../lib/message-client.js";
import { invokeAsyncLambdaFunc } from "../../lib/aws-modules.js";
import { Language } from "../../../parameter.js";
import logger from "../../lib/logger.js";

// Environment variables
const lang: Language = process.env.LANG ? (process.env.LANG as Language) : "en";
const funcName = process.env.FUNCTION_NAME!;
const metricsInsightFunction = process.env.METRICS_INSIGHT_NAME!;
const findingsReportFunction = process.env.FINDINGS_REPORT_NAME!;
const slackAppTokenKey = process.env.SLACK_APP_TOKEN_KEY!;
const slackSigningSecretKey = process.env.SLACK_SIGNING_SECRET_KEY!;

// Utility method
const convertJSTToUTC = (date: string, time: string): string => {
  const japanDate = new Date(`${date}T${time}`);
  const internationalTime = fromZonedTime(japanDate, "Asia/Tokyo");
  return internationalTime.toISOString();
};

// Slack Credentials
const token = await getSecret(slackAppTokenKey);
const signingSecret = await getSecret(slackSigningSecretKey);

if (
  !token ||
  !signingSecret ||
  typeof token !== "string" ||
  typeof signingSecret !== "string"
) {
  logger.error("Credentials are not good.", {credentials: {token, signingSecret}})
  throw new Error("No slack credentials.");
}

const awsLambdaReceiver = new AwsLambdaReceiver({
  signingSecret
});

const app = new App({
  token,
  receiver: awsLambdaReceiver
});

const messageClient = new MessageClient(token, lang); 

// When app receive an alarm from AWS Chatbot, send the form of FA2.
app.message("", async ({ event, body, payload, say }) => {
  logger.info("message", {event: event, payload: payload, body: body});

  // This ID is for AWS Chatbot app.
  // FA2 will return the form, when AWS Chatbot sent a message.
  // Please modify the condition by your environment.
  if ("app_id" in event && event.app_id === "A6L22LZNH") {
    const now = toZonedTime(new Date(), "Asia/Tokyo");
    const res = await say({
      blocks: messageClient.createFormBlock(format(now, "yyyy-MM-dd"), format(now, "HH:mm")),
      reply_broadcast: true
    } as SayArguments);
    logger.info('response', {response: res});
  }
});

// When app receive input data from FA2 form, invoke FA2 backend lambda.
app.action("submit_button", async ({ body, ack, respond }) => {
  await ack();
  logger.info("submit_button action", {body})

  try {
    const payload = body as BlockAction;
    if (!payload.state) {
      throw new Error("No body from FA2 form.");
    }
    const errorDescription =
      payload.state.values["error_description"].error_description.value;
    const startDate =
      payload.state.values["start_date"].start_date.selected_date;
    const startTime =
      payload.state.values["start_time"].start_time.selected_time;
    const endDate = payload.state.values["end_date"].end_date.selected_date;
    const endTime = payload.state.values["end_time"].end_time.selected_time;

    if (!startDate || !endDate || !startTime || !endTime) {
      throw new Error("Date or Time is not set.");
    }

    // Invoke backend lambda
    const res = await invokeAsyncLambdaFunc(
      JSON.stringify({
        errorDescription,
        startDate: convertJSTToUTC(startDate, startTime),
        endDate: convertJSTToUTC(endDate, endTime),
        channelId: payload.channel?.id,
        threadTs: payload.message?.ts
      }),
      funcName
    );

    if (res.StatusCode! >= 400) {
      throw new Error("Failed to invoke lambda function");
    }

    // Send the message to notify the completion of receiving request.
    await respond({
      blocks: messageClient.createMessageBlock(
        lang === "ja"
          ? `リクエストを受け付けました。分析完了までお待ちください。\nリクエスト内容: \`\`\`${JSON.stringify({errorDescription, startDate, startTime, endDate, endTime})}\`\`\` `
          : `Reveived your request. Please wait... \nInput parameters: \`\`\`${JSON.stringify({errorDescription, startDate, startTime, endDate, endTime})}\`\`\` `,
      ),
      replace_original: true,
    } as RespondArguments);
  } catch (error) {
    // Send result to Slack
    logger.error("Something happened", error as Error);
    await respond({
      blocks: messageClient.createErrorMessageBlock(),
      replace_original: true,
    } as RespondArguments);
  }
  return;
});

app.command('/insight-dev', async ({ client, body, ack }) => {
  // Ack the request of insight command
  await ack();
  logger.info("/insight command", {body})

  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: messageClient.createInsightCommandFormView()
    });
  } catch (error) {
    logger.error("Failed to open views", error as Error);
  }
});

app.view('view_insight', async ({ ack, view, client, body }) => {
  // Ack the request of view_insight
  await ack();
  logger.info("view_insight view", {view, body})
  
  // Get the form data
  const query = view['state']['values']['input_query']['query']['value'];
  const duration = view['state']['values']['input_duration']['duration']['selected_option']!['value'];

  // Convert from duration to datetime
  const now = new Date();
  const nowItnTime = fromZonedTime(now, "Asia/Tokyo");
  const pastItnTime = fromZonedTime(sub(now,{days: Number(duration)}), "Asia/Tokyo");
  try{
    // Invoke backend lambda
    const res = await invokeAsyncLambdaFunc(
      JSON.stringify({
        query: query,
        startDate: pastItnTime.toISOString(),
        endDate: nowItnTime.toISOString(),
        channelId: body.user.id 
      }),
      metricsInsightFunction
    );

    if (res.StatusCode! >= 400) {
      throw new Error("Failed to invoke lambda function");
    }

    // Send the message to notify the completion of receiving request.
    await client.chat.postMessage({
      blocks: messageClient.createMessageBlock(
        lang === "ja"
          ? `質問：${query}を、${duration}日分のメトリクスで確認します。FA2の回答をお待ちください。`
          : `FA2 received your question: ${query} with the metric data of ${duration} days. Please wait for its answer..`,
      ),
      channel: body.user.id
    });
  } catch (error) {
    // Send result to Slack
    logger.error("Somegthing happend", error as Error);
    await client.chat.postMessage({
      blocks: messageClient.createErrorMessageBlock(),
      channel: body.user.id
    });
  }
  return;
});

app.command('/findings-report-dev', async ({ client, body, ack }) => {
  // Ack the request of insight command
  await ack();
  logger.info("/findings-report command", {body})

  try {
    const res = await invokeAsyncLambdaFunc(
      JSON.stringify({
        channelId: body.channel_id 
      }),
      findingsReportFunction
    );

    if (res.StatusCode! >= 400) {
      throw new Error("Failed to invoke lambda function");
    }

    // Send the message to notify the completion of receiving request.
    await client.chat.postMessage({
      blocks: messageClient.createMessageBlock(
        lang === "ja"
          ? `Findingsのレポート作成依頼を受け付けました。FA2の回答をお待ちください。`
          : `FA2 received your request to create a report of findings. Please wait for its answer..`,
      ),
      channel: body.channel_id
    });
  } catch (error) {
    logger.error("Something happened", error as Error);
  }
});

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: APIGatewayProxyCallbackV2,
) => {
  const handler = await awsLambdaReceiver.start();
  return handler(event, context, callback);
};
