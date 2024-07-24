import axios from "axios";
import { Logger } from "@aws-lambda-powertools/logger";
import { format, parse } from "date-fns";
import { KnownBlock } from "@slack/types";

import { publish } from "./aws-modules.js";

// It's an explanation to avoid the hallucination that may include in llm's answer.
export function createHowToGetLogsJa(
  startDate: string,
  endDate: string,
  logGroups: string[],
  cwLogsQuery: string,
  xrayTraces: boolean,
  albQuery?: string,
  trailQuery?: string,
) {
  let howToGetLogs = `参考にしたログは、それぞれ以下の手順とクエリで取得可能です。\n
*CloudWatch Logs:*\nCloudWatch Logs Insightのコンソールにて、対象ロググループを指定し、時間範囲を \`${startDate}\` から \`${endDate}\` と設定した上で、クエリを実行してください。\n
*対象ロググループ:*\n
\`\`\`${logGroups.join(", ")}\`\`\`
*クエリ:*\n
\`\`\`${cwLogsQuery}\`\`\`
`;

  howToGetLogs += albQuery
    ? `*ALB:*\nAthenaのコンソールで、 \`${process.env.ATHENA_DATABASE_NAME}\` のデータベースに対し、クエリを実行してください。\n
*クエリ:*\n
\`\`\`${albQuery} \`\`\`
`
    : "";

  howToGetLogs += trailQuery
    ? `*CloudTrail:*\nAthenaのコンソールで、 \`${process.env.ATHENA_DATABASE_NAME}\` のデータベースに対し、クエリを実行してください。
*クエリ:*\n
\`\`\`${trailQuery}\`\`\`
`
    : "";

  howToGetLogs += xrayTraces
    ? `*X-rayのトレース情報:*\nX-rayのコンソールで、時間範囲を \`${startDate}\` から \`${endDate}\` に指定してください。`
    : "";

  return howToGetLogs;
}
export function createHowToGetLogsEn(
  startDate: string,
  endDate: string,
  logGroups: string[],
  cwLogsQuery: string,
  xrayTraces: boolean,
  albQuery?: string,
  trailQuery?: string,
) {
  let howToGetLogs = `You can get the logs that LLM refered followed ways:\n
*CloudWatch Logs:*\n CloudWatch Logs Insight Console, you choose target log groups and set time range like from \`${startDate}\` to \`${endDate}\`. Finally, you run query as below:\n
*Target log groups:*\n
\`\`\`${logGroups.join(", ")}\`\`\`
*Query:*\n
\`\`\`${cwLogsQuery}\`\`\`
`;

  howToGetLogs += albQuery
    ? `*ALB:*\n In Athena's management console, You run the query to \`${process.env.ATHENA_DATABASE_NAME}\` database.\n
*Query:*\n
\`\`\`${albQuery} \`\`\`
`
    : "";

  howToGetLogs += trailQuery
    ? `*CloudTrail:*\n In Athena's management console, You run the query to \`${process.env.ATHENA_DATABASE_NAME}\` database.\n
*Query:*\n
\`\`\`${trailQuery}\`\`\`
`
    : "";

  howToGetLogs += xrayTraces
    ? `*X-ray Traces:*\n X-ray's management console, please set data range like from \`${startDate}\` to \`${endDate}\` .`
    : "";

  return howToGetLogs;
}

// Message template by Slack Block Kit

export function createFormBlockJa(date: string, time: string): KnownBlock[] {
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
}

export function createFormBlockEn(date: string, time: string): KnownBlock[] {
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

export function createAnswerBlockJa(
  answer: string,
  howToGetLogs: string,
): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*FA2によるエラー原因の仮説:*\n  ${answer}`,
      },
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*ログの取得方法:*\n ${howToGetLogs}`,
      },
    },
  ];
}

export function createAnswerBlockEn(
  answer: string,
  howToGetLogs: string,
): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Error root cause hypothesis:*\n  ${answer}`,
      },
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*How to get logs that LLM referred:*\n ${howToGetLogs}`,
      },
    },
  ];
}

export function createMessageBlock(message: string): KnownBlock[] {
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

export function createErrorMessageBlockJa(): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "エラーが発生しました。システム管理者にご連絡ください。",
      },
    },
  ];
}

export function createErrorMessageBlockEn(): KnownBlock[] {
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

// Message template to send via AWS SNS/AWS Chatbot.
export function createAnswerMessageJa(
  alarmName: string,
  alarmTimestamp: string,
  answer: string,
  howToGetLogs: string,
) {
  return `
*発生したAlarm:* ${alarmName}\n
*発生時刻:* ${convertDateFormat(alarmTimestamp)}\n
*FA2によるエラー原因の仮説:*\n  ${answer}\n
-----\n
*ログの取得方法:*\n ${howToGetLogs}
`;
}

export function createAnswerMessageEn(
  alarmName: string,
  alarmTimestamp: string,
  answer: string,
  howToGetLogs: string,
) {
  return `
*Alarm name:* ${alarmName}\n
*Alarm timestamp:* ${convertDateFormat(alarmTimestamp)}\n
*Assumption of root cause analysis by FA2:*\n  ${answer}\n
-----\n
*How to get Logs:*\n ${howToGetLogs}
`;
}

const convertDateFormat = (dateString: string): string => {
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

// To send message via AWS Chatbot/SNS or Slack directly.
export const sendMessageToClient = async (
  message: KnownBlock[] | string,
  destination: string,
  logger: Logger,
) => {
  if (destination.startsWith("https://hooks.slack.com/actions")) {
    try {
      await axios.post(
        destination,
        {
          blocks: message,
        },
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      logger.error(JSON.stringify(error));
      await axios.post(destination, {
        text: "Error. Please contact your system admin.",
      });
    }
  } else if (destination.startsWith("arn:aws:sns:")) {
    await publish(
      destination,
      JSON.stringify({
        version: "1.0",
        source: "custom",
        content: {
          description: message,
        },
      }),
      logger,
    );
  } else {
    throw new Error("ResponseUrl or TopicArn is required.");
  }
};
