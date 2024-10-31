import _ from "lodash";
import { Language } from "../../parameter.js";

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
       return this.language === "ja" ?
    `あなたは、AWS上で稼働するワークロードを監視・運用するエージェントです。
    ${this.architectureDescription}
    <findings>タグに与えられたSecurity HubとGuardDutyのFingindsを、与えられたMarkdownのフォーマットで整理し、レポートとして<OutputReport>タグの間に出力してください。
    レポートを読んだ運用管理者がアクションを取りやすくするため、findingがなぜ発生していて、どのようなリスクがあるのか、わかりやすく説明してください。
    必ず日本語で答えてください。フォーマットのようなMarkdown以外の出力は絶対にしてはいけません。

    <findings>
      <securtiyhub>${secHubFindings}</securityhub>
      <guardduty>${guarddutyFindings}</guardduty>
    </findings>

    <レポートのMarkdownフォーマット>
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

    </レポートのフォーマット>

    レポート：
    `:
    `You are an agent that monitors and operates workloads running on AWS.
    ${this.architectureDescription}
    Organize the <findings> Security Hub and GuardDuty findings given to the tag in the given Markdown format and output them between the <OutputReport>  tags as a report.
 To make it easier for operations managers who read the report to take action, please explain why finding is occurring and what risks there are.
 Please be sure to answer in English. You should never output anything other than Markdown, such as formatting.

    <findings>
      <securtiyhub>${secHubFindings}</securityhub>
      <guardduty>${guarddutyFindings}</guardduty>
    </findings>

    <MarkdownFormatOfReport>
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

    </MarkdownFormatOfReport>

    Report:
    `; 
  }

  // To create the prompt for metrics selection
  public createSelectMetricsForFailureAnalysisPrompt(query: string, metrics: string){
    return `あなたは、AWS上で稼働するワークロードを監視・運用するエージェントです。
    ${this.architectureDescription}
    運用管理者から${query}という状況が報告されています。
    次の手順でGetMetricData APIに送るためのMetricDataQueryを<MetricDataQuerySpecification>タグのようなJSON形式で作成してください。
    <steps>
    1. <Metrics></Metrics>タグの間に定義された、現在設定されているCloudWatchのメトリクスを確認する
    2. 運用管理者から報告された状況が、なぜ発生しているか、根本原因を探るために必要なメトリクスを全て選ぶ
    3. 一つ以上の選んだメトリクスから、GetMetricData APIに送るためのMetricDataQueryをJSON形式で作成する
    4. 作成したクエリは、<MetricDataQuery></MetricDataQuery>というタグで囲んで出力し、それ以外の回答はしない
    </steps>

    MetricDataQueryの例:
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
      // 複数のメトリクスが必要な場合は、上記のようなオブジェクトが追加される
    ]

    <Metrics>
    ${metrics}
    </Metrics>

    <MetricDataQuery>
    ` 
  }

  // To create the prompt for metrics selection
  public createSelectMetricsForInsightPrompt(query: string, metrics: string, days: number){
    return `あなたは、AWS上で稼働するワークロードを監視・運用するエージェントです。
    ${this.architectureDescription}
    運用管理者から${query}という依頼が来ています。
    次の手順でGetMetricData APIに送るためのMetricDataQueryを<MetricDataQuerySpecification>タグのようなJSON形式で作成してください。
    <Steps>
    1. <Metrics></Metrics>タグの間に定義された、現在設定されているCloudWatchのメトリクスを確認する
    2. 運用管理者からの依頼に答えるために必要なメトリクスを全て選ぶ
    3. 一つ以上の選んだメトリクスから、GetMetricData APIに送るためのMetricDataQueryをJSON形式で作成する
    4. 作成したクエリは、<MetricDataQuery></MetricDataQuery>というタグで囲んで出力し、それ以外の回答はしない
    </Steps>

    MetricDataQueryの例:
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

    <Metrics>
    ${metrics}
    </Metrics>

    <MetricDataQuery>
    ` 
  }

  // To create the prompt for image generation.
  public createImageGenerationPrompt(
    query: string,
    rootCauseHypothesis: string,
  ) {
    return `AWS上で稼働するワークロードを監視・運用するエージェントです。
    あなたが担当するワークロードのアーキテクチャは、${this.architectureDescription}です。
    現在、このワークロードで、${query} という障害が観測されています。
    あなたには、<RootCauseHypothesis></RootCauseHypothesis>というタグで、発生した障害の根本原因の仮説が与えられます。
    アーキテクチャのどこに障害が発生したのか、その原因の仮説とともに、<OutputMermaidSyntax></OutputMermaidSyntax>タグの間にMermaid記法で、簡易的なアーキテクチャ図を出力してください。

    <RootCauseHypothesis>
      ${rootCauseHypothesis}
    </RootCauseHypothesis>

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