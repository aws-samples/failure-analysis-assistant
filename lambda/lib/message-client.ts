import { format, parse } from "date-fns";
import { KnownBlock } from "@slack/types";
import { WebClient } from "@slack/web-api";
import { random } from "lodash";
import logger from "./logger.js";
import { Language } from "../../parameter.js";

function convertDateFormat(dateString: string): string {
  // Parse dateString from specific format
  const parsedDate = parse(
    dateString,
    "EEE, dd MMM yyyy HH:mm:ss 'UTC'",
    new Date(),
  );

  // Modify format.
  const formattedDate = format(parsedDate, "yyyy-MM-dd HH:mm:ss");

  return formattedDate;
};

export class MessageClient {
  slackClient: WebClient;
  language: Language; 
  constructor(
    token: string,
    language: Language = "en",
  ){
    this.slackClient = new WebClient(token);
    this.language = language;
  }
  
  // It's an explanation to avoid the hallucination that may include in llm's answer.
  public createHowToGetLogs(
    startDate: string,
    endDate: string,
    logGroups: string[],
    cwLogsQuery: string,
    cwMetricQuery: string,
    xrayTraces: boolean,
    albQuery?: string,
    trailQuery?: string,
  ) {
    let howToGetLogs: string;

    if(this.language === "ja"){
      howToGetLogs = 
`
# ログやメトリクス、トレースの取得手順

参考にしたログは、それぞれ以下の手順とクエリで取得可能です。\n

## CloudWatch Logs

CloudWatch Logs Insightのコンソールにて、対象ロググループを指定し、時間範囲を \`${startDate}\` から \`${endDate}\` と設定した上で、クエリを実行してください。\n

### 対象ロググループ

\`\`\`${logGroups.join(", ")}\`\`\`

### クエリ

\`\`\`${cwLogsQuery}\`\`\`

`;

  howToGetLogs += albQuery
    ? 
`## ALB

Athenaのコンソールで、 \`${process.env.ATHENA_DATABASE_NAME}\` のデータベースに対し、クエリを実行してください。\n

### クエリ

\`\`\`${albQuery} \`\`\`

`
    : "";

  howToGetLogs += trailQuery
    ? 
`## CloudTrail

Athenaのコンソールで、 \`${process.env.ATHENA_DATABASE_NAME}\` のデータベースに対し、クエリを実行してください。

### クエリ

\`\`\`${trailQuery}\`\`\`

    `
        : "";

      howToGetLogs += `
## CloudWatchのメトリクス

次のクエリをローカル環境にJSON形式で保存し、CLIでコマンドを実行してください。

### クエリ

\`\`\`${cwMetricQuery}\`\`\`

### コマンド

\`\`\`aws cloudwatch get-metric-data --metric-data-queries file://{path-to-file/name-you-saved.json} --start-time ${startDate} --end-time ${endDate} --profile {your-profile-name} \`\`\`

`

      howToGetLogs += xrayTraces
        ? `
## X-rayのトレース情報

X-rayのコンソールで、時間範囲を \`${startDate}\` から \`${endDate}\` に指定してください。`
        : "";
    }else{
      howToGetLogs = `
# How to Get..

You can get the logs that LLM refered followed ways.

## CloudWatch Logs

CloudWatch Logs Insight Console, you choose target log groups and set time range like from \`${startDate}\` to \`${endDate}\`. Finally, you run query as below:\n

### Target log groups

\`\`\`${logGroups.join(", ")}\`\`\`

### Query

\`\`\`${cwLogsQuery}\`\`\`
`;

      howToGetLogs += albQuery
        ? `
## ALB

In Athena's management console, You run the query to \`${process.env.ATHENA_DATABASE_NAME}\` database.\n

### Query

\`\`\`${albQuery} \`\`\`

`
        : "";

      howToGetLogs += trailQuery
        ? `
## CloudTrail

In Athena's management console, You run the query to \`${process.env.ATHENA_DATABASE_NAME}\` database.\n

### Query

\`\`\`${trailQuery}\`\`\`

`
        : "";

      howToGetLogs += `
## CloudWatch Metrics

You should save below query as JSON file to your local environment and run the command.

### Query

\`\`\`${JSON.stringify(cwMetricQuery)}\`\`\`
  
### Command

\`\`\`aws cloudwatch get-metric-data --metric-data-queries file://{path-to-file/name-you-saved.json} --start-time ${startDate} --end-time ${endDate} --profile {your-profile-name} \`\`\`

`

      howToGetLogs += xrayTraces
        ? `
## X-ray Traces

X-ray's management console, please set data range like from \`${startDate}\` to \`${endDate}\` .`
        : "";

      }

    return howToGetLogs;
  }

  // Message template by Slack Block Kit
  public createFormBlock(date: string, time: string): KnownBlock[] {
    if(this.language === "ja"){
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "アラームが発生したようです。エラーの原因分析をしたい場合は、ログ検索を行う時刻の範囲を以下のフォームから入力してください。アラームのDatapointを参考に入力いただくと、比較的良い結果が得られやすいです。",
          },
        },
        {
          type: "divider",
        },
        {
          type: "input",
          block_id: "error_description",
          element: {
            type: "plain_text_input",
            action_id: "error_description",
            placeholder: {
              type: "plain_text",
              text: "例：外形監視のアラームで、エラー回数が規定以上になっています。",
            },
          },
          label: {
            type: "plain_text",
            text: "エラーの通知（アラーム）の内容",
            emoji: true,
          },
        },
        {
          type: "input",
          block_id: "start_date",
          element: {
            type: "datepicker",
            initial_date: date,
            placeholder: {
              type: "plain_text",
              text: "Select a date",
              emoji: true,
            },
            action_id: "start_date",
          },
          label: {
            type: "plain_text",
            text: "ログ取得の開始日",
            emoji: true,
          },
        },
        {
          type: "input",
          block_id: "start_time",
          element: {
            type: "timepicker",
            initial_time: time,
            placeholder: {
              type: "plain_text",
              text: "Select time",
              emoji: true,
            },
            action_id: "start_time",
          },
          label: {
            type: "plain_text",
            text: "ログ取得の開始時刻",
            emoji: true,
          },
        },
        {
          type: "input",
          block_id: "end_date",
          element: {
            type: "datepicker",
            initial_date: date,
            placeholder: {
              type: "plain_text",
              text: "Select a date",
              emoji: true,
            },
            action_id: "end_date",
          },
          label: {
            type: "plain_text",
            text: "ログ取得の終了日",
            emoji: true,
          },
        },
        {
          type: "input",
          block_id: "end_time",
          element: {
            type: "timepicker",
            initial_time: time,
            placeholder: {
              type: "plain_text",
              text: "Select time",
              emoji: true,
            },
            action_id: "end_time",
          },
          label: {
            type: "plain_text",
            text: "ログ取得の終了時刻",
            emoji: true,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "根本源因の分析を行う",
              },
              style: "primary",
              action_id: "submit_button",
              value: "submit",
            },
          ],
        },
      ];
    }else{
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "It seems that an alarm was happend. If you want to analysis root cause of this failure, please put time range to get the logs that may includes root cause.",
          },
        },
        {
          type: "divider",
        },
        {
          type: "input",
          block_id: "error_description",
          element: {
            type: "plain_text_input",
            action_id: "error_description",
            placeholder: {
              type: "plain_text",
              text: "Ex: It is an monitoring alarm, and the number of errors has exceeded the specified number.",
            },
          },
          label: {
            type: "plain_text",
            text: "The description of the error notification (alarm)",
            emoji: true,
          },
        },
        {
          type: "input",
          block_id: "start_date",
          element: {
            type: "datepicker",
            initial_date: date,
            placeholder: {
              type: "plain_text",
              text: "Select a date",
              emoji: true,
            },
            action_id: "start_date",
          },
          label: {
            type: "plain_text",
            text: "Start date to get the logs",
            emoji: true,
          },
        },
        {
          type: "input",
          block_id: "start_time",
          element: {
            type: "timepicker",
            initial_time: time,
            placeholder: {
              type: "plain_text",
              text: "Select time",
              emoji: true,
            },
            action_id: "start_time",
          },
          label: {
            type: "plain_text",
            text: "Start time to get the logs",
            emoji: true,
          },
        },
        {
          type: "input",
          block_id: "end_date",
          element: {
            type: "datepicker",
            initial_date: date,
            placeholder: {
              type: "plain_text",
              text: "Select a date",
              emoji: true,
            },
            action_id: "end_date",
          },
          label: {
            type: "plain_text",
            text: "End date to get the logs",
            emoji: true,
          },
        },
        {
          type: "input",
          block_id: "end_time",
          element: {
            type: "timepicker",
            initial_time: time,
            placeholder: {
              type: "plain_text",
              text: "Select time",
              emoji: true,
            },
            action_id: "end_time",
          },
          label: {
            type: "plain_text",
            text: "End time to get the logs",
            emoji: true,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "SUBMIT",
              },
              style: "primary",
              action_id: "submit_button",
              value: "submit",
            },
          ],
        },
      ];
    }
  }

  public createMessageBlock(message: string): KnownBlock[] {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: message,
        },
      },
    ];
  }

  public createErrorMessageBlock(): KnownBlock[] {
    if(this.language === "ja"){
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "エラーが発生しました。システム管理者にご連絡ください。",
          },
        },
      ];
    }else{
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Error: Please contact your system admin.",
          },
        },
      ];
    }
  }

  // Message template for answer.
  public createAnswerMessage(
    alarmName: string,
    alarmTimestamp: string,
    answer: string,
    howToGetLogs: string,
  ) {
    if(this.language === "ja"){
      return `
    *発生したAlarm:* ${alarmName}\n
    *発生時刻:* ${convertDateFormat(alarmTimestamp)}\n
    *FA2によるエラー原因の仮説:*\n  ${answer}\n
    この後画像に根本原因が図示されます。\n
    -----\n
    *ログの取得方法:*\n ${howToGetLogs}
    `;
    }else{
      return `
    *Alarm name:* ${alarmName}\n
    *Alarm timestamp:* ${convertDateFormat(alarmTimestamp)}\n
    *Assumption of root cause analysis by FA2:*\n  ${answer}\n
    Next, it shows the root cause on the image.\n
    -----\n
    *How to get Logs:*\n ${howToGetLogs}
    `;
    }
  }

  // To send message via Slack directly.
  public async sendMessage(
    message: KnownBlock[] | string,
    channelId: string,
    threadTs: string
  ){
    if ((channelId.startsWith("C") || channelId.startsWith("D")) && threadTs) {
      try {
        await this.slackClient.chat.postMessage({
          channel: channelId,
          text: "FA2からのメッセージ",
          blocks: message as KnownBlock[],
          thread_ts: threadTs,
        });
      } catch (error) {
        logger.error(JSON.stringify(error));
        await this.slackClient.chat.postMessage({
          channel: channelId,
          text: "Error. Please contact your system admin.",
          thread_ts: threadTs,
        });
      }
    } else {
      throw new Error("Channel ID and ThreadTS are required.");
    }
  }

  // Send snippet that is markdown docuemnt
  public async sendMarkdownSnippet(
    filename: string,
    markdownText: string,
    channelId: string,
    threadTs: string
  ){
    if ((channelId.startsWith("C") || channelId.startsWith("D")) && threadTs) {
      try {
        await this.slackClient.filesUploadV2({
          channel_id: channelId!,
          thread_ts: threadTs!,
          filename,
          content: markdownText,
          snippet_type: 'markdown'
        });
      } catch (error) {
        logger.error(JSON.stringify(error));
        await this.slackClient.chat.postMessage({
          channel: channelId,
          text: "Error. Please contact your system admin.",
          thread_ts: threadTs,
        });
      }
    } else {
      throw new Error("Channel ID and ThreadTS are required.");
    }
  }

  public async sendPngImage(
    png: Uint8Array<ArrayBufferLike> | undefined,
    channelId: string,
    threadTs: string
  ){
    if ((channelId.startsWith("C") || channelId.startsWith("D")) && threadTs) {
      try {
        const uploadedFile = await this.slackClient.filesUploadV2({
          channel_id: channelId!,
          thread_ts: threadTs!,
          file: Buffer.from(png!),
          filename: `fa2-output-image-${Date.now()}${random(100000000,999999999,false)}.png`,
          initial_comment: this.language === "ja" ? "障害原因を図示しました。" : "It shows the root cause on the diagram."
        })
        logger.info(`Uploaded file: ${JSON.stringify(uploadedFile.files.at(0)!.files!.at(0)!)}`)
      } catch (error) {
        logger.error(JSON.stringify(error));
        await this.slackClient.chat.postMessage({
          channel: channelId,
          text: "Error. Please contact your system admin.",
          thread_ts: threadTs,
        });
      }
    } else {
      throw new Error("Channel ID and ThreadTS are required.");
    }
  }
    
}