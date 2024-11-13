import { format, parse } from "date-fns";
import { publish } from "./aws-modules.js";
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
  topicArn: string;
  language: Language; 
  constructor(
    topicArn: string,
    language: Language = "en"
  ){
    this.topicArn = topicArn;
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

  public createErrorMessage(): string{
    if(this.language === "ja"){
      return "エラーが発生しました。システム管理者にご連絡ください。";
    }else{
      return "Error: Please contact your system admin.";
    }
  }

  // Message template for answer.
  public createAnswerMessage(
    alarmName: string,
    alarmTimestamp: string,
    answer: string
  ) {
    if(this.language === "ja"){
      return `
*発生したAlarm:* ${alarmName}\n
*発生時刻:* ${convertDateFormat(alarmTimestamp)}\n
*FA2によるエラー原因の仮説:*\n  ${answer}\n
`;
    }else{
      return `
*Alarm name:* ${alarmName}\n
*Alarm timestamp:* ${convertDateFormat(alarmTimestamp)}\n
*Assumption of root cause analysis by FA2:*\n  ${answer}\n
`;
    }
  }

  public createArchitectureImageMessage(signedUrl: string){
    if(this.language === "ja"){
      return `*根本原因の仮説の図示*\n
根本原因の仮説を示した図は以下のURLからダウンロードしてください。\n
<${signedUrl}|Download URL>`;
    }else{
      return `*Illustration of the root cause hypothesis*\n
Please download the image of the root cause hypothesis from below link.\n
<${signedUrl}|Download URL>`;
    }
  }
  
  public createMetricsInsightMessage(answer: string){
    if(this.language === "ja"){
      return `*Metrics Insight コマンドの実行結果*\n
${answer}`;
    }else{
      return `*The result of metrics insight*\n
${answer} `;
    }
  }

  public createFindingsReportMessage(signedUrl: string){
    if(this.language === "ja"){
      return `*findings-report コマンドの実行結果*\n
レポートを作成しました。URL の有効期限は1時間です。\n
<${signedUrl}|Download URL> 
      `
    }else{
      return `*The result of findings-report*\n
Findings report was created. This URL expires in 1 hour.\n
<${signedUrl}|Download URL> 
`
    }
  }

  // To send message via Slack directly.
  public async sendMessage(
    message: string,
  ){
    try {
      await publish(
        this.topicArn,
        JSON.stringify({
          version: "1.0",
          source: "custom",
          content: {
            description: message,
          },
        })
      );
    } catch (error) {
      logger.error("Failed", error as Error);
      await publish(
        this.topicArn,
        JSON.stringify({
          version: "1.0",
          source: "custom",
          content: {
            description: this.createErrorMessage(),
          },
        })
      );
    }
  }

}