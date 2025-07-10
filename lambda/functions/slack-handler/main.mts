import {
  APIGatewayProxyCallbackV2,
  APIGatewayProxyEvent,
  Context,
} from "aws-lambda";
import { App, AwsLambdaReceiver, BlockAction, RespondArguments, SayArguments } from "@slack/bolt";
import { getSecret } from "@aws-lambda-powertools/parameters/secrets";
import { format, sub } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { MessageClient } from "../../lib/messaging/message-client.js";
import { AWSServiceFactory } from "../../lib/aws/aws-service-factory.js";
import { Language } from "../../../parameter.js";
import { logger } from "../../lib/logger.js";
import { getI18nProvider } from "../../lib/messaging/providers/i18n-factory.js";
import { ConfigurationService } from "../../lib/configuration-service.js";

// Initialize configuration service
const configService = ConfigurationService.getInstance();

// 初期化状態を確認
const { isInitialized, error } = ConfigurationService.getInitializationStatus();
if (!isInitialized) {
  logger.error("ConfigurationService initialization failed", { error });
}

// handlerで使用する変数のみグローバルスコープで宣言
let awsLambdaReceiver: AwsLambdaReceiver | undefined;

// Utility method
const convertJSTToUTC = (date: string, time: string): string => {
  const japanDate = new Date(`${date}T${time}`);
  const internationalTime = fromZonedTime(japanDate, "Asia/Tokyo");
  return internationalTime.toISOString();
};

if (isInitialized) {
  try {
    // Get configuration from configuration service
    const lang = configService.getLanguage() as Language;
    const funcName = configService.getLambdaFunctionName()!;
    const metricsInsightFunction = configService.getMetricsInsightName()!;
    const findingsReportFunction = configService.getFindingsReportName()!;
    const slackAppTokenKey = configService.getSlackAppTokenKey();
    const slackSigningSecretKey = configService.getSlackSigningSecretKey()!;
    const lambdaService = AWSServiceFactory.getLambdaService();
    
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
    
    awsLambdaReceiver = new AwsLambdaReceiver({
      signingSecret
    });
    
    const app = new App({
      token,
      receiver: awsLambdaReceiver
    });
    
    const messageClient = new MessageClient(token, lang, 'slack');
    const i18n = getI18nProvider(lang);
    
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

    app.command('/fa2', async ({ body, ack, say }) => {
      // Ack the request of insight command
      await ack();
      logger.info("/fa2 command", {body})

      const now = toZonedTime(new Date(), "Asia/Tokyo");
      const res = await say({
        blocks: messageClient.createFormBlock(format(now, "yyyy-MM-dd"), format(now, "HH:mm")),
        reply_broadcast: true
      } as SayArguments);
      logger.info('response', {response: res});
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
        const res = await lambdaService.invokeAsyncLambdaFunc(
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
            `${i18n.translate("requestAccepted")}\n${i18n.translate("requestParameters")}\`\`\`${JSON.stringify({errorDescription, startDate, startTime, endDate, endTime})}\`\`\` `
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

    app.command('/insight', async ({ client, body, ack, respond }) => {
      // Ack the request of insight command
      await ack();
      logger.info("/insight command", {body})

      try {
        // Check if the command is executed in DM (channel ID starts with 'D' for DM)
        if (body.channel_id.startsWith('D')) {
          logger.info("Command executed in DM, rejecting", { channel_id: body.channel_id });
          
          // Send a message to reject execution in DM
          await respond({
            blocks: messageClient.createMessageBlock(
              i18n.translate("dmNotAllowed")
            ),
            replace_original: false
          } as RespondArguments);
          return;
        }
        
        // Include channel ID in private_metadata
        const metadata = JSON.stringify({ channelId: body.channel_id });
        
        await client.views.open({
          trigger_id: body.trigger_id,
          view: {
            ...messageClient.createInsightCommandFormView(),
            private_metadata: metadata
          }
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
      const durationOption = view['state']['values']['input_duration']['duration']['selected_option'];
      
      if (!query || !durationOption || !durationOption.value) {
        throw new Error("Form data is incomplete");
      }
      
      const duration = durationOption.value;

      // Convert from duration to datetime
      const now = new Date();
      const nowItnTime = fromZonedTime(now, "Asia/Tokyo");
      const pastItnTime = fromZonedTime(sub(now,{days: Number(duration)}), "Asia/Tokyo");
      
      // Get channel ID from private_metadata
      let channelId: string | undefined;
      try {
        if (view.private_metadata) {
          const metadata = JSON.parse(view.private_metadata);
          if (metadata.channelId) {
            channelId = metadata.channelId;
            logger.info(`Using channel ID from metadata: ${channelId}`);
          }
        }
      } catch (error) {
        logger.warn("Failed to parse private_metadata", { error });
      }
      
      // Display an error if channel ID cannot be obtained
      if (!channelId) {
        logger.error("Channel ID not found in metadata");
        await client.chat.postMessage({
          blocks: messageClient.createMessageBlock(
            i18n.translate("channelIdNotFound")
          ),
          channel: body.user.id // Send error message to user's DM
        });
        return;
      }
      
      try{
        // Invoke backend lambda
        const res = await lambdaService.invokeAsyncLambdaFunc(
          JSON.stringify({
            query: query,
            startDate: pastItnTime.toISOString(),
            endDate: nowItnTime.toISOString(),
            channelId: channelId
          }),
          metricsInsightFunction
        );

        if (res.StatusCode! >= 400) {
          throw new Error("Failed to invoke lambda function");
        }

        // Send the message to notify the completion of receiving request.
        await client.chat.postMessage({
          blocks: messageClient.createMessageBlock(
            i18n.formatTranslation("insightConfirmation", query, duration)
          ),
          channel: channelId
        });
      } catch (error) {
        // Send result to Slack
        logger.error("Something happened", error as Error);
        await client.chat.postMessage({
          blocks: messageClient.createErrorMessageBlock(),
          channel: channelId
        });
      }
      return;
    });

    app.command('/findings-report', async ({ client, body, ack }) => {
      // Ack the request of insight command
      await ack();
      logger.info("/findings-report command", {body})

      try {
        const res = await lambdaService.invokeAsyncLambdaFunc(
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
            i18n.translate("findingsReportConfirmation")
          ),
          channel: body.channel_id
        });
      } catch (error) {
        logger.error("Something happened", error as Error);
      }
    });
  } catch (error) {
    logger.error("Failed to initialize global resources", { error });
    // ここでは例外をスローせず、ログに記録するだけ
  }
}

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: APIGatewayProxyCallbackV2,
) => {
  // 初期化状態を確認
  if (!isInitialized || !awsLambdaReceiver) {
    logger.error("Handler execution failed due to configuration error", { error });
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal server error due to configuration issues"
      })
    };
  }
  
  const handler = await awsLambdaReceiver.start();
  return handler(event, context, callback);
};
