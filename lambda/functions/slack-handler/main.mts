import {
  APIGatewayProxyCallbackV2,
  APIGatewayProxyEvent,
  Context,
} from "aws-lambda";
import { App, AwsLambdaReceiver, BlockAction, SayArguments } from "@slack/bolt";
import { getSecret } from "@aws-lambda-powertools/parameters/secrets";
import { format } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { MessageClient } from "../../lib/message-client.js";
import { invokeAsyncLambdaFunc } from "../../lib/aws-modules.js";
import { Language } from "../../../parameter.js";
import logger from "../../lib/logger.js";

// Environment variables
const lang: Language = process.env.LANG ? (process.env.LANG as Language) : "en";
const funcName = process.env.FUNCTION_NAME!;

// Utility method
const convertJSTToUTC = (date: string, time: string): string => {
  const japanDate = new Date(`${date}T${time}`);
  const internationalTime = fromZonedTime(japanDate, "Asia/Tokyo");
  return internationalTime.toISOString();
};

// Slack Credentials
const token = await getSecret("SlackAppToken");
const signingSecret = await getSecret("SlackSigningSecret");

if (
  !token ||
  !signingSecret ||
  typeof token !== "string" ||
  typeof signingSecret !== "string"
) {
  throw new Error("No slack credentials.");
}

const awsLambdaReceiver = new AwsLambdaReceiver({
  signingSecret
});

const app = new App({
  token,
  receiver: awsLambdaReceiver
});

const messageClient = new MessageClient(token, "ja")

// When app receive an alarm from AWS Chatbot, send the form of FA2.
app.message("", async ({ event, body, payload, say }) => {
  logger.info(`Event= ${JSON.stringify(event)}`);
  logger.info(`payload=${JSON.stringify(payload)}`);
  logger.info(`body=${JSON.stringify(body)}`);

  // This ID is for AWS Chatbot app.
  // FA2 will return the form, when AWS Chatbot sent a message.
  // Please modify the condition by your environment.
  if (
    "root" in event &&
    "app_id" in event.root &&
    event.root.app_id === "A6L22LZNH"
  ) {
    const now = toZonedTime(new Date(), "Asia/Tokyo");
    const res = await say({
      blocks: messageClient.createFormBlock(format(now, "yyyy-MM-dd"), format(now, "HH:mm")),
      reply_broadcast: true
    } as SayArguments);
    logger.info(`response: ${JSON.stringify(res)}`);
  }
});

// When app receive input data from FA2 form, invoke FA2 backend lambda.
app.action("submit_button", async ({ body, ack, respond }) => {
  await ack();

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

    if (res.StatusCode! > 400) {
      throw new Error("Failed to invoke lambda function");
    }

    // Send the message to notify the completion of receiving request.
    await respond({
      blocks: messageClient.createMessageBlock(
        lang === "ja"
          ? "リクエストを受け付けました。分析完了までお待ちください。"
          : "Reveived your request. Please wait...",
      ),
      replace_original: true,
    });
  } catch (err) {
    // Send result to Slack
    logger.error(JSON.stringify(err));
    await respond({
      blocks: messageClient.createErrorMessageBlock(),
      replace_original: true,
    });
  }
  return;
});

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: APIGatewayProxyCallbackV2,
) => {
  const handler = await awsLambdaReceiver.start();
  return handler(event, context, callback);
};
