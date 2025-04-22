import { format, parse } from "date-fns";
import { KnownBlock, View } from "@slack/types";
import { WebClient } from "@slack/web-api";
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
  
  public createInsightCommandFormView(): View {
    return this.language === "ja" ? 
    {
      "title": {
        "type": "plain_text",
        "text": "insightコマンドの実行"
      },
      "submit": {
        "type": "plain_text",
        "text": "Submit"
      },
      "type": "modal",
      "callback_id": "view_insight",
      "blocks": [
        {
          "type": "input",
          "block_id": "input_query",
          "label": {
            "type": "plain_text",
            "text": "メトリクスからどのようなことを知りたいですか?"
          },
          "element": {
            "type": "plain_text_input",
            "action_id": "query",
            "multiline": true,
            "placeholder": {
              "type": "plain_text",
              "text": "例：ECSのリソースは十分ですか？チューニングの必要があるか教えてください"
            }
          },
        },
        {
          "type": "input",
          "block_id": "input_duration",
          "element": {
            "type": "static_select",
            "placeholder": {
              "type": "plain_text",
              "text": "期間を日単位で選択してください",
              "emoji": true
            },
            "options": [
              {
                "text": {
                  "type": "plain_text",
                  "text": "1日",
                  "emoji": true
                },
                "value": "1"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "2日",
                  "emoji": true
                },
                "value": "2"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "3日",
                  "emoji": true
                },
                "value": "3"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "4日",
                  "emoji": true
                },
                "value": "4"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "5日",
                  "emoji": true
                },
                "value": "5"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "6日",
                  "emoji": true
                },
                "value": "6"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "7日",
                  "emoji": true
                },
                "value": "7"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "8日",
                  "emoji": true
                },
                "value": "8"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "9日",
                  "emoji": true
                },
                "value": "9"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "10日",
                  "emoji": true
                },
                "value": "10"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "11日",
                  "emoji": true
                },
                "value": "11"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "12日",
                  "emoji": true
                },
                "value": "12"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "13日",
                  "emoji": true
                },
                "value": "13"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "14日",
                  "emoji": true
                },
                "value": "14"
              }
            ],
            "action_id": "duration"
          },
          "label": {
            "type": "plain_text",
            "text": "メトリクスを取得する期間",
                    "emoji": true
          }
        }
      ]
    } :
    {
      "title": {
        "type": "plain_text",
        "text": "Invoke insight command"
      },
      "submit": {
        "type": "plain_text",
        "text": "Submit"
      },
      "type": "modal",
      "callback_id": "view_insight",
      "blocks": [
        {
          "type": "input",
          "block_id": "input_query",
          "label": {
            "type": "plain_text",
            "text": "What do you want to know based on metrics?"
          },
          "element": {
            "type": "plain_text_input",
            "action_id": "query",
            "multiline": true,
            "placeholder": {
              "type": "plain_text",
              "text": "Ex. Are ECS resources enough? Please let me know if the tuning is required for this workload."
            }
          }
        },
        {
          "type": "input",
          "block_id": "input_duration",
          "element": {
            "type": "static_select",
            "placeholder": {
              "type": "plain_text",
              "text": "Please select days to get metric data",
              "emoji": true
            },
            "options": [
              {
                "text": {
                  "type": "plain_text",
                  "text": "1 Day",
                  "emoji": true
                },
                "value": "1"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "2 Days",
                  "emoji": true
                },
                "value": "2"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "3 Days",
                  "emoji": true
                },
                "value": "3"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "4 Days",
                  "emoji": true
                },
                "value": "4"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "5 Days",
                  "emoji": true
                },
                "value": "5"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "6 Days",
                  "emoji": true
                },
                "value": "6"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "7 Days",
                  "emoji": true
                },
                "value": "7"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "8 Days",
                  "emoji": true
                },
                "value": "8"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "9 Days",
                  "emoji": true
                },
                "value": "9"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "10 Days",
                  "emoji": true
                },
                "value": "10"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "11 Days",
                  "emoji": true
                },
                "value": "11"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "12 Days",
                  "emoji": true
                },
                "value": "12"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "13 Days",
                  "emoji": true
                },
                "value": "13"
              },
              {
                "text": {
                  "type": "plain_text",
                  "text": "14 Days",
                  "emoji": true
                },
                "value": "14"
              }
            ],
            "action_id": "duration"
          },
          "label": {
            "type": "plain_text",
            "text": "Duration of getting metric data",
                    "emoji": true
          }
        }
      ]
    }
  };

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

  // Message template for reference docs that are retrieved by Knolwedgebase
  public createRetrieveResultMessage(
    retreieveResult: {
      index: number;
      text: string;
      source: string;
      score: number;
    }[]
  ) {
    if(this.language === "ja"){
      return `
    *以下のドキュメントを参照しました:*\n
    ${retreieveResult.map((result) => {
      return `[${result.index+1}]${result.text}\n
      source: ${result.source}\n
      score:  (${result.score})\n`;
    })}
    `;
    }else{
      return `
    *The following documents are retrieved:*\n
    ${retreieveResult.map((result) => {
      return `[${result.index+1}]${result.text}\n
      source: ${result.source}\n
      score:  (${result.score})\n`;
    })}
    `;
    }
  }

  // To send message via Slack directly.
  public async sendMessage(
    message: KnownBlock[] | string,
    channelId: string,
    threadTs?: string
  ){
    try {
      if (threadTs) {
        await this.slackClient.chat.postMessage({
          channel: channelId,
          text: "FA2からのメッセージ",
          blocks: message as KnownBlock[],
          thread_ts: threadTs,
        });
      } else {
        await this.slackClient.chat.postMessage({
          channel: channelId,
          text: "FA2からのメッセージ",
          blocks: message as KnownBlock[]
        });
      }
    } catch (error) {
      logger.error("Failed", error as Error);
      await this.slackClient.chat.postMessage({
        channel: channelId,
        text: "Error. Please contact your system admin.",
        thread_ts: threadTs,
      });
    }
  }

  // Send snippet that is markdown docuemnt
  public async sendMarkdownSnippet(
    filename: string,
    markdownText: string,
    channelId: string,
    threadTs?: string
  ){
    try {
      if (threadTs) {
        await this.slackClient.filesUploadV2({
          channel_id: channelId,
          thread_ts: threadTs!,
          filename,
          content: markdownText,
          snippet_type: 'markdown'
        });
      } else {
        await this.slackClient.filesUploadV2({
          channel_id: channelId!,
          filename,
          content: markdownText,
          snippet_type: 'markdown'
        });
      }
    } catch (error) {
      logger.error("Failed", error as Error);
      await this.slackClient.chat.postMessage({
        channel: channelId,
        text: "Error. Please contact your system admin.",
        thread_ts: threadTs,
      });
    }
  }

  public async sendFile(
    file: Uint8Array<ArrayBufferLike> | undefined,
    filename: string,
    channelId: string,
    threadTs?: string
  ){
    try {
      let uploadedFile;
      if(threadTs){
        uploadedFile = await this.slackClient.filesUploadV2({
          channel_id: channelId,
          thread_ts: threadTs,
          file: Buffer.from(file!),
          filename,
          initial_comment: this.language === "ja" ? "ファイルをアップロードしました" : "Uploaded a file."
        })
      }else{
        uploadedFile = await this.slackClient.filesUploadV2({
          channel_id: channelId,
          file: Buffer.from(file!),
          filename,
          initial_comment: this.language === "ja" ? "ファイルをアップロードしました" : "Uploaded a file."
        })
      }
      logger.info('Uploaded file', {uploadFile: JSON.stringify(uploadedFile.files.at(0)!.files!.at(0)!)})
    } catch (error) {
      logger.error("Failed", error as Error);
      await this.slackClient.chat.postMessage({
        channel: channelId,
        text: "Error. Please contact your system admin.",
        thread_ts: threadTs,
      });
    }
  }
}