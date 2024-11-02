import _ from "lodash";
import { Language } from "../../parameter.js";
import logger from "./logger.js";

export class Prompt {
  language: Language;
  architectureDescription: string;

  constructor(
    language: Language = "en",
    architectureDescription: string,
  ){
    this.language = language;
    this.architectureDescription = architectureDescription;
  }

  public createFailureAnalysisPrompt(
    query: string,
    applicationLogs?: string,
    metrics?: string,
    albAccessLogs?: string,
    cloudTrailLogs?: string,
    xrayTraces?: string
    ) {
    logger.info("Start", {
      function: this.createFailureAnalysisPrompt.name,
      input: {
        query,
        applicationLogs: applicationLogs?.length,
        metrics: metrics?.length,
        albAccessLogs: albAccessLogs?.length,
        cloudtrail: cloudTrailLogs?.length,
        xray: xrayTraces
      }
    });
    let prompt: string;
    if(this.language === "ja"){
      prompt = `あなたは、AWS上で稼働するワークロードを監視・運用するエージェントです。必ず日本語で回答してください。
        あなたが担当するワークロードのアーキテクチャは、${this.architectureDescription}です。
        現在、運用管理者から ${query} という事象が発生したとの連絡がありました。
        あなたは、<logs>タグに与えられたログと<metrics>タグに与えられたメトリクス、<trace>タグに与えられたトレースを確認し、発生した事象の根本原因を推測してください。
        根本原因を記述する際に、参考にしたログやメトリクスの内容についても記載し、運用管理者が実際のログやメトリクスを確認しやすくしてください。
        <logs>
          <ApplicationLogs>${applicationLogs}</ApplicationLogs>
        `;

      prompt += albAccessLogs
        ? `<ALBAccessLogs>${albAccessLogs}</ALBAccessLogs>`
        : "";

      prompt += cloudTrailLogs
        ? `<CloudTrailLogs>${cloudTrailLogs}</CloudTrailLogs>`
        : "";

      prompt += `
        </logs>
        `
      prompt += metrics ? `
        <metrics>
        ${metrics}
        </metrics>
        ` : "";

      prompt += xrayTraces ? `<traces>${xrayTraces}</traces>` : "";

      prompt += "発生した事象の根本原因 : ";
    }else{
      prompt = `You are an agent that monitors and operates workloads running on AWS.
        The architecture of your workload is ${this.architectureDescription}.
        Currently, the operations manager has informed us that an event called ${query.replace(
          /\+/g,
          " ",
        )} has occurred.
        You should check the <logs> tags, Based on logs sandwiched between tags, and the <metrics> tags, Based on metrics sandwiched between tags,
        and the <traces> tags, based on traces sandwiched between tags, the root cause of the event that occurred is inferred.
        When describing the root cause, please also describe the contents of the log and the metrics you referred to, making it easier for operator to check the actual logs and metrics.
        <logs>
          <ApplicationLogs>${applicationLogs}</ApplicationLogs>
        `;
      prompt += albAccessLogs
        ? `<ALBAccessLogs>${albAccessLogs}</ALBAccessLogs>`
        : "";

      prompt += cloudTrailLogs
        ? `<CloudTrailLogs>${cloudTrailLogs}</CloudTrailLogs>`
        : "";

      prompt += `
        </logs>
        `
      prompt += metrics ? `
        <metrics>
        ${metrics}
        </metrics>
        ` : "";

      prompt += xrayTraces ? `<traces>${xrayTraces}</traces>` : "";

      prompt += "Root causes list that you thought: ";
    }
    return prompt;
  };

  public createMetricsInsightPrompt(query: string, metrics: string){
    logger.info("Start", {function: this.createMetricsInsightPrompt.name, input: {query, metrics: metrics.length}} )
    return this.language === "ja" ?
    `あなたは、AWS上で稼働するワークロードを監視・運用するエージェントです。
    ${this.architectureDescription}
    運用管理者から${query}という依頼が来ています。
    <metrics>タグに与えられたメトリクスをもとに、ユーザからの依頼に対応してください。
    また、対応するために根拠としたメトリクスについては、メトリクス名を列挙して後から管理者がそのメトリクスを参照しやすくしてください。
    必ず日本語で答えてください。

    <metrics>
    ${metrics}
    </metrics>

    対応結果：
    `:
    `You are an agent that monitors and operates workloads running on AWS.
    The architecture of your workload is ${this.architectureDescription}.
    Currently, the operations manager asked us about ${query}.
    You should check the <metrics> tags, Based on metrics sandwiched between tags, and answer an asked question.
    Also, you should show the list of metric names when you checked them to answer the question.
    You have to answer it in English.

    <metrics>
    ${metrics}
    </metrics>

    Answer:
    `;
  }

  public createFindingsReportPrompt(secHubFindings?: string, guarddutyFindings?: string){
    logger.info("Start", {function: this.createFindingsReportPrompt.name, input: {securityHub: secHubFindings?.length, guardduty: guarddutyFindings?.length}} )
    return this.language === "ja" ?
    `あなたは、AWS上で稼働するワークロードを監視・運用するエージェントで、セキュリティのIssueに対し、レポートをする役割を持っています。
    ${this.architectureDescription}
    <steps>
    1. <findings>タグに与えられたSecurity HubとGuardDutyのFingindsを確認してください
    2. 全体を読んだ上で、サマリをまとめてください
    3. レポートを読んだ運用管理者がアクションを取りやすくするため、それぞれのfinding毎に、なぜ発生していて、どのようなリスクがあるのか、わかりやすく説明してください
    4. レポートを出力してください
    </steps>

    <rule>
    * レポートは <outputReport></outputReport> の xml タグに囲われた通りに出力してください。
    * レポートのフォーマットは、<reportFormat></reportFormat> を参照し、これを必ず守ってください。例外はありません。
    * 必ず日本語で答えてください。
    </rules>

    <findings>
      <securtiyhub>${secHubFindings}</securityhub>
      <guardduty>${guarddutyFindings}</guardduty>
    </findings>

    <reportFormat>
    # 全体サマリ

    // 全てのFindingsを横断的にチェックした時のサマリを記載し、もし緊急度の高いFindingがあれば、それも記載する

    # Security Hub の Findings

    ---
    - タイトル
    - AWS アカウント
    - 発生日時
    - 重要度
    - 概要
    - 解説
    ---
    // 上記を1セットとし、検知された分だけ繰り返す。Findingsが存在しない場合は、そのことがわかるよう記述する。

    # GuardDuty の Findings

    ---
    - タイトル
    - AWS アカウント
    - 発生日時
    - 重要度
    - 概要
    - 解説
    ---
    // 上記を1セットとし、検知された分だけ繰り返す。Findingsが存在しない場合は、そのことがわかるよう記述する。

    </reportFormat>

    レポート:
    `:
    `You are an agent that monitors and operates workloads running on AWS.
    ${this.architectureDescription}
    <steps>
    1. Check Security Hub and GuardDuty's findings that are given to the <findings></findings>tag
    2. Please read the whole thing and put together a summary
    3. In order to make it easier for operation managers who read the report to take action, please explain why it occurred and what risks there are for each finding in an easy-to-understand manner
    4. Please output a report
    </steps>

    <rule>
    * Please output the report as surrounded by <outputReport></outputReport> tags.
    * The report format is shown as surrounded by <reportFormat></reportFormat> tags. There are no exceptions.
    * Please be sure to answer in English。
    </rules>

    <findings>
      <securtiyhub>${secHubFindings}</securityhub>
      <guardduty>${guarddutyFindings}</guardduty>
    </findings>

    <reportFormat>
    # Summary

    // Describe a summary of when all Findings have been checked in a cross-sectional manner

    # Findings of Security Hub

    ---
    - Title
    - AWS Account
    - Date
    - Severity
    - Summary
    - Explanation by LLM
    ---
    // Set the above to 1 set and repeat for as long as detected

    # Findings of GuardDuty

    ---
    - Title
    - AWS Account
    - Date
    - Severity
    - Summary
    - Explanation by LLM
    ---
    // Set the above to 1 set and repeat for as long as detected

    </reportFormat>

    Report:
    `; 
  }

  // To create the prompt for metrics selection
  public createSelectMetricsForFailureAnalysisPrompt(query: string, metrics: string){
    logger.info("Start", {function: this.createSelectMetricsForFailureAnalysisPrompt.name, input: {query, metrics: metrics.length}} )
    return `あなたは、AWS上で稼働するワークロードを監視・運用する日本語が得意なエージェントです。必ず日本語で回答してください。
    ${this.architectureDescription}
    運用管理者から${query}という状況が報告されています。
    次の手順でGetMetricData APIに送るためのMetricDataQueryを作成してください。
    <steps>
    1. <metrics></metrics>タグの間に定義された、現在設定されているCloudWatchのメトリクスを確認する
    2. 運用管理者から報告された状況が、なぜ発生しているか、根本原因を探るために必要なメトリクスを全て選ぶ
    3. 一つ以上の選んだメトリクスから、GetMetricData APIに送るためのMetricDataQueryをJSON形式で作成する
    4. 作成したクエリは、<metricDataQuery></metricDataQuery>というタグで囲んで出力し、それ以外の回答はしない
    </steps>

    <rules>
    * クエリは、<querySpecification></querySpecification>タグに記載されたJSONフォーマットに従ってください。例外は認めません。
    * クエリ以外の出力はしないでください。例外は認めません。
    </rules>

    <querySpecification>
    [
      {
        "Id": "cwm1といった、小文字から始まる英数字を組み合わせたクエリ内で一意のIDを付与する",
        "Label": "適したラベルを自由に記述する",
        "MetricStat": {
            "Metric": {
                "Namespace": "<Metrics>タグで与えられたあるメトリクスのNamespaceから設定する。すべて半角英数字であること。",
                "MetricName": "<Metrics>タグで与えられたあるメトリクスのMetricNameから設定する。すべて半角英数字であること。",
                "Dimensions": [ 
                    {
                        "Name": "<Metrics>タグで与えられたあるメトリクスのDimensionsから設定する。すべて半角英数字であること。",
                        "Value": "<Metrics>タグで与えられたあるメトリクスのDimensionsから設定する。すべて半角英数字であること。"
                    },
                ]
            },
            "Period": 60, // 変更しない
            "Stat": "Average" // 変更しない
        }
      },
      // 複数のメトリクスが必要な場合は、上記のフォーマットのオブジェクトが追加される
    ] // 単一のメトリクスの場合でも、[]で囲み、配列とすること。例外はありません
    </querySpecification>

    <metrics>
    ${metrics}
    </metrics>

    <metricDataQuery>
    ` 
  }

  // To create the prompt for metrics selection
  public createSelectMetricsForInsightPrompt(query: string, metrics: string, days: number){
    logger.info("Start", {function: this.createSelectMetricsForInsightPrompt.name, input: {query, metrics, days}} )
    return `あなたは、AWS上で稼働するワークロードを監視・運用する日本語が得意なエージェントです。必ず日本語で回答してください。
    ${this.architectureDescription}
    運用管理者から${query}という依頼が来ています。
    次の手順でGetMetricData APIに送るためのMetricDataQueryを作成してください。
    <steps>
    1. <metrics></metrics>タグの間に定義された、現在設定されているCloudWatchのメトリクスを確認する
    2. 運用管理者からの依頼に答えるために必要なメトリクスを全て選ぶ
    3. 一つ以上の選んだメトリクスから、GetMetricData APIに送るためのMetricDataQueryをJSON形式で作成する
    4. 作成したクエリは、<metricDataQuery></metricDataQuery>というタグで囲んで出力し、それ以外の回答は絶対にしない
    </steps>

    <rules>
    * クエリは、<querySpecification></querySpecification>タグに記載されたJSONフォーマットに従ってください。例外は認めません。
    * クエリ以外の出力はしないでください。例外は認めません。
    </rules>

    <querySpecification>
    [
      {
        "Id": "cwm1といった、小文字から始まる英数字を組み合わせたクエリ内で一意のIDを付与する",
        "Label": "適したラベルを自由に記述する",
        "MetricStat": {
          "Metric": {
            "Namespace": "<Metrics>タグで与えられたあるメトリクスのNamespaceから設定する。すべて半角英数字であること。",
            "MetricName": "<Metrics>タグで与えられたあるメトリクスのMetricNameから設定する。すべて半角英数字であること。",
            "Dimensions": [ 
              {
                "Name": "<Metrics>タグで与えられたあるメトリクスのDimensionsから設定する。すべて半角英数字であること。",
                "Value": "<Metrics>タグで与えられたあるメトリクスのDimensionsから設定する。すべて半角英数字であること。"
              },
            ]
          },
          "Period": ${3600 + Math.floor(days / 5) * 3600}, // 変更しない
          "Stat": "Average" // 変更しない
        }
      },
      // 複数のメトリクスが必要な場合は、上記のようなオブジェクトが追加される
    ]
    </querySpecification>

    <metrics>
    ${metrics}
    </metrics>

    <metricDataQuery>
    ` 
  }

  // To create the prompt for image generation.
  public createImageGenerationPrompt(
    query: string,
    rootCauseHypothesis: string,
  ) {
    logger.info("Start", {function: this.createImageGenerationPrompt.name, input: {query, rootCauseHypothesis}} )
    return `AWS上で稼働するワークロードを監視・運用するエージェントです。
    あなたが担当するワークロードのアーキテクチャは、${this.architectureDescription}です。
    現在、このワークロードで、${query} という障害が観測されています。
    あなたには、<rootCauseHypothesis></rootCauseHypothesis>というタグで、発生した障害の根本原因の仮説が与えられます。
    アーキテクチャのどこに障害が発生したのか、その原因の仮説とともに、<outputMermaidSyntax></outputMermaidSyntax>タグの間にMermaid記法で、簡易的なアーキテクチャ図を出力してください。

    <rootCauseHypothesis>
      ${rootCauseHypothesis}
    </rootCauseHypothesis>

    アーキテクチャ図: 
    `  
  }

  static getStringValueFromQueryResult(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryResult: any[],
    key: string,
  ): string | undefined {
    return JSON.stringify(
      _.get(_.find(_.flatMap(queryResult), { key: key }), "value"),
    );
  }
}