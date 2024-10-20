import _ from "lodash";
import { Language } from "../../parameter.js";

export class Prompt {
  language: Language;
  architectureDescription: string;
  errorDescription: string;

  constructor(
    language: Language = "en",
    architectureDescription: string,
    errorDescription: string
  ){
    this.language = language;
    this.architectureDescription = architectureDescription;
    this.errorDescription = errorDescription;
  }

  public createFailureAnalysisPrompt(
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
        現在、運用管理者から ${this.errorDescription} という事象が発生したとの連絡がありました。
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
        Currently, the operations manager has informed us that an event called ${this.errorDescription.replace(
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

  // To create the prompt for metrics selection
  public createSelectMetricsPrompt(){
    return `あなたは、AWS上で稼働するワークロードを監視・運用するエージェントです。
    ${this.architectureDescription}
    運用管理者から${this.errorDescription}という状況が報告されています。
    次の手順でGetMetricData APIに送るためのMetricDataQueryを<MetricDataQuerySpecification>タグのようなJSON形式で作成してください。
    1. ツールを利用して、現在定義されているCloudWatchのメトリクスを取得する
    2. 運用管理者から報告された状況が、なぜ発生しているか、根本原因を探るために必要なメトリクスを全て選ぶ
    3. 一つ以上の選んだメトリクスから、GetMetricData APIに送るためのMetricDataQueryをJSON形式で作成する
    4. 作成したクエリは、<MetricDataQuery></MetricDataQuery>というタグで囲んで出力し、それ以外の回答はしない

    MetricDataQueryの例:
    [
      {
        "Id": "cwm1といった、小文字から始まる英数字を組み合わせたクエリ内で一意のIDを付与する",
        "Label": "適したラベルを自由に記述する",
        "MetricStat": {
            "Metric": {
                "Namespace": "listMetricsで取得したNamespaceから設定する",
                "MetricName": "listMetricsで取得したMetricNameから設定する",
                "Dimensions": [ 
                    {
                        "Name": "listMetricsで取得したDimensionsから設定する",
                        "Value": "listMetricsで取得したDimensionsから設定する"
                    },
                ]
            },
            "Period": 60, // 変更しない
            "Stat": "Average" // 変更しない
        }
      },
      // 複数のメトリクスが必要な場合は、上記のようなオブジェクトが追加される
    ]

    <MetricDataQuery>
    ` 
  }

  // To create the prompt for image generation.
  public createImageGenerationPrompt(
    rootCauseHypothesis: string,
  ) {
    return `AWS上で稼働するワークロードを監視・運用するエージェントです。
    あなたが担当するワークロードのアーキテクチャは、${this.architectureDescription}です。
    現在、このワークロードで、${this.errorDescription} という障害が観測されています。
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