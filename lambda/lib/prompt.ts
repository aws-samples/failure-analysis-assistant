import { ToolDescription } from "./tools-registry.js";
import { HistoryItem } from "./react-agent.js";
import { Language } from "../../parameter.js";
import { logger } from "./logger.js";

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
  
  /**
   * Create findings report prompt
   * @param securityHubFindings Security Hub findings
   * @param guardDutyFindings GuardDuty findings
   * @returns Prompt for findings report
   */
  createFindingsReportPrompt(
    securityHubFindings: string,
    guardDutyFindings: string
  ): string {
    logger.info("Creating findings report prompt", {
      securityHubFindingsLength: securityHubFindings?.length || 0,
      guardDutyFindingsLength: guardDutyFindings?.length || 0
    });
    
    if (this.language === "ja") {
      return `あなたはAWSのセキュリティ専門家です。以下のSecurityHubとGuardDutyの検出結果を分析し、重要な問題点と推奨される対応策をまとめたレポートを作成してください。

## SecurityHub検出結果
${securityHubFindings || "検出結果はありません。"}

## GuardDuty検出結果
${guardDutyFindings || "検出結果はありません。"}

レポートは以下の形式でMarkdown形式で作成してください：

<outputReport>
# AWS セキュリティ検出結果レポート

## 概要
（検出された主要な問題の簡潔な概要）

## 重大度の高い問題
（重大度の高い問題の詳細な説明と潜在的な影響）

## 推奨される対応策
（問題を解決するための具体的な手順）

## 詳細な検出結果
（検出結果の詳細なリスト、重大度別に整理）

## 次のステップ
（長期的なセキュリティ体制を強化するための推奨事項）
</outputReport>`;
    } else {
      return `You are an AWS security expert. Analyze the following SecurityHub and GuardDuty findings and create a report summarizing the key issues and recommended actions.

## SecurityHub Findings
${securityHubFindings || "No findings available."}

## GuardDuty Findings
${guardDutyFindings || "No findings available."}

Please create the report in Markdown format using the following structure:

<outputReport>
# AWS Security Findings Report

## Overview
(Brief summary of the main issues detected)

## High Severity Issues
(Detailed explanation of high severity issues and their potential impact)

## Recommended Actions
(Specific steps to address the issues)

## Detailed Findings
(Detailed list of findings, organized by severity)

## Next Steps
(Recommendations for strengthening security posture long-term)
</outputReport>`;
    }
  }
  
  /**
   * Optimize history
   * When there are many cycles, include only recent history in detail and summarize older history
   */
  private optimizeHistory(history: HistoryItem[], cycleCount: number): string {
    // 履歴が長い場合（例：5回以上）
    if (cycleCount >= 5) {
      // 直近の3回分の履歴を詳細に含める
      const recentHistory = history.slice(-3);
      const recentHistoryText = recentHistory
        .map((item, index) => {
          const cycleNumber = history.length - 3 + index + 1;
          // ツール名を抽出
          const toolName = this.extractToolName(item.action);
          return `【サイクル ${cycleNumber}】\n思考: ${item.thinking}\n実行したツール: ${toolName}\n実行結果: ${item.observation}`;
        })
        .join('\n\n');
      
      // 残りの履歴を要約
      if (history.length > 3) {
        const oldHistoryCount = history.length - 3;
        const oldHistorySummary = `注: 上記の前に${oldHistoryCount}回の分析ステップが実行されています。`;
        
        return `${oldHistorySummary}\n\n${recentHistoryText}`;
      }
      
      return recentHistoryText;
    }
    
    // 履歴が短い場合は全て含める
    return history
      .map((item, index) => {
        const cycleNumber = index + 1;
        // ツール名を抽出
        const toolName = this.extractToolName(item.action);
        return `【サイクル ${cycleNumber}】\n思考: ${item.thinking}\n実行したツール: ${toolName}\n実行結果: ${item.observation}`;
      })
      .join('\n\n');
  }
  
  /**
   * ツール名を抽出するヘルパーメソッド
   */
  private extractToolName(action: string): string {
    try {
      const actionObj = JSON.parse(action);
      return actionObj.tool || "不明なツール";
    } catch {
      return "不明なツール";
    }
  }
  
  /**
   * Enhance prompt based on cycle count
   * Strongly encourage final answer generation when there are many cycles
   */
  private enhancePromptForHighCycleCount(basePrompt: string, cycleCount: number): string {
    if (cycleCount >= 4) {
      return `${basePrompt}

注意: これは${cycleCount}回目の思考ステップです。分析サイクルが多くなっています。
トークン制限に達する前に、必ず<FinalAnswer>タグを使用して最終回答を提供してください。
例: 
<FinalAnswer>
障害の根本原因と解決策を詳細に説明します。
</FinalAnswer>

現在の情報で結論を出せる場合は、必ず最終回答を生成してください。`;
    }
    
    return basePrompt;
  }

  public createReactThinkingPrompt(
    context: string,
    history: HistoryItem[],
    availableTools: ToolDescription[],
    cycleCount: number = 0
  ): string {
    // デバッグログを追加
    logger.debug("createReactThinkingPrompt - 入力パラメータ", {
      contextLength: context.length,
      historyLength: history.length,
      availableToolsCount: availableTools.length,
      cycleCount: cycleCount
    });
    
    // 最新の履歴項目の内容をログに出力
    if (history.length > 0) {
      const latestHistory = history[history.length - 1];
      logger.debug("createReactThinkingPrompt - 最新の履歴項目", {
        hasThinking: !!latestHistory.thinking,
        thinkingPreview: latestHistory.thinking ? latestHistory.thinking.substring(0, 100) + "..." : "なし",
        hasAction: !!latestHistory.action,
        actionPreview: latestHistory.action ? latestHistory.action.substring(0, 100) + "..." : "なし",
        hasObservation: !!latestHistory.observation,
        observationPreview: latestHistory.observation ? latestHistory.observation.substring(0, 100) + "..." : "なし"
      });
    }
    
    const toolDescriptions = availableTools
      .map(tool => `${tool.name}: ${tool.description}\nパラメータ: ${JSON.stringify(tool.parameters)}`)
      .join('\n\n');
    
    // 履歴の最適化
    const historyText = this.optimizeHistory(history, cycleCount);
    
    // 最適化された履歴テキストのログ出力
    logger.debug("createReactThinkingPrompt - 最適化された履歴テキスト", {
      historyTextLength: historyText.length,
      historyTextPreview: historyText.substring(0, 200) + "..."
    });
    
    // 基本プロンプトの生成
    let basePrompt = "";
    if (this.language === "ja") {
      basePrompt = `あなたは、AWS上で稼働するワークロードを監視・運用するエージェントです。
      ${this.architectureDescription}
      
      現在、以下の障害が報告されています：
      ${context}
      
      <AnalysisHistory>
      ${historyText}
      </AnalysisHistory>
      
      <AvailableTools>
      ${toolDescriptions}
      </AvailableTools>
      
      【重要】履歴を注意深く確認してください。各サイクルで実行されたツールとその結果を正確に把握することが重要です。
      特に、あるツールが実行されたかどうか、その結果が返ってきたかどうかを正確に理解してください。
      
      次に何をすべきか考えてください。以下の形式で回答してください：
      
      <Thought>
      現在の状況を分析し、次に何をすべきか考えます。
      これまでに実行したツールとその結果を整理します：
      - サイクル1: [実行したツール名] - [結果の要約]
      - サイクル2: [実行したツール名] - [結果の要約]
      （以降、実行したサイクル数に応じて）
      </Thought>
      
      <Action>
      {
        "tool": "使用するツール名",
        "parameters": {
          "param1": "値1",
          "param2": "値2"
        }
      }
      </Action>
      
      以下のいずれかの条件を満たす場合は、最終回答を生成してください：
      
      1. 十分なデータが集まり、高い確信度で根本原因と解決策を特定できる場合
      2. 一部のデータが不足していても、既存の情報から根本原因を推測できる場合
      3. 一定回数（5回以上）のツール実行を行っても十分なデータが集まらない場合
      
      データが不足している場合は、以下の戦略を使って分析を進めてください：
      
      - 得られた情報から最大限の推論を行う
      - アーキテクチャ知識を活用して可能性の高いシナリオを提示する
      - 確信度レベルを明示する（高/中/低/最小）
      - データ不足箇所を明示する
      - 追加で収集すべき情報を提案する
      
      最終回答を生成する場合は以下のように回答してください。
      <FinalAnswer></FinalAnswer>で根本原因と解決策をマークアップすることを忘れないでください。：
      
      <Thought>
      これまでの情報から、根本原因と解決策について分析しました。
      確信度レベル: [高/中/低/最小]
      
      データ収集状況:
      - メトリクス: [収集済み/一部収集/未収集]
      - ログ: [収集済み/一部収集/未収集]
      - 変更履歴: [収集済み/一部収集/未収集]
      - X-Ray: [収集済み/一部収集/未収集]
      - Knowledge Base: [収集済み/一部収集/未収集]
      
      不足しているデータ:
      - [不足しているデータの詳細]
      
      以下の点から最終回答を生成します：
      1. [根本原因の要約]
      2. [解決策の要約]
      3. [再発防止策の要約]
      </Thought>
      
      <FinalAnswer>
      障害の根本原因と解決策を詳細に説明します。
      </FinalAnswer>`;
      
      // サイクル数に応じたプロンプト強化
      const finalPrompt = this.enhancePromptForHighCycleCount(basePrompt, cycleCount);
      
      // 生成されたプロンプトのログ出力
      logger.debug("createReactThinkingPrompt - 生成されたプロンプト", {
        promptLength: finalPrompt.length,
        promptPreview: finalPrompt.substring(0, 200) + "..."
      });
      
      return finalPrompt;
    } else {
      basePrompt = `You are an agent that monitors and operates workloads running on AWS.
      ${this.architectureDescription}
      
      Currently, the following issue has been reported:
      ${context}
      
      <AnalysisHistory>
      ${historyText}
      </AnalysisHistory>
      
      <AvailableTools>
      ${toolDescriptions}
      </AvailableTools>
      
      【IMPORTANT】Carefully review the history. It is crucial to accurately understand the tools executed in each cycle and their results.
      In particular, be precise about whether a tool has been executed and whether its results have been returned.
      
      Think about what to do next. Please respond in the following format:
      
      <Thought>
      Analyze the current situation and consider what to do next.
      Let me organize the tools executed so far and their results:
      - Cycle 1: [tool name used] - [summary of results]
      - Cycle 2: [tool name used] - [summary of results]
      (and so on, according to the number of cycles executed)
      </Thought>
      
      <Action>
      {
        "tool": "tool_name_to_use",
        "parameters": {
          "param1": "value1",
          "param2": "value2"
        }
      }
      </Action>
      
      Generate a FinalAnswer if ANY of the following conditions are met:
      
      1. You have gathered sufficient information to identify the root cause with high confidence
      2. You can infer the root cause from existing information despite some missing data
      3. You have executed tools multiple times (5+) but still cannot gather sufficient data
      
      When data is missing, use these strategies:
      
      - Make maximum inferences from available information
      - Use architectural knowledge to present likely scenarios
      - Clearly state your confidence level (high/medium/low/minimal)
      - Identify missing data points
      - Suggest additional information that would be helpful
      
      If you decide to provide a FinalAnswer, respond as follows:
      
      <Thought>
      I have analyzed the root cause and solution based on available information.
      Confidence level: [high/medium/low/minimal]
      
      Data collection status:
      - Metrics: [collected/partially collected/not collected]
      - Logs: [collected/partially collected/not collected]
      - Change history: [collected/partially collected/not collected]
      - X-Ray: [collected/partially collected/not collected]
      - Knowledge Base: [collected/partially collected/not collected]
      
      Missing data:
      - [details of missing data]
      
      I will generate the FinalAnswer based on:
      1. [Summary of root cause]
      2. [Summary of solution]
      3. [Summary of prevention measures]
      </Thought>
      
      <FinalAnswer>
      Detailed explanation of the root cause and solution for the issue.
      </FinalAnswer>`;
      
      // サイクル数に応じたプロンプト強化
      const finalPrompt = this.enhancePromptForHighCycleCount(basePrompt, cycleCount);
      
      // 生成されたプロンプトのログ出力
      logger.debug("createReactThinkingPrompt - 生成されたプロンプト", {
        promptLength: finalPrompt.length,
        promptPreview: finalPrompt.substring(0, 200) + "..."
      });
      
      return finalPrompt;
    }
  }

  public createReactInitialPrompt(
    errorDescription: string,
    availableTools: ToolDescription[]
  ): string {
    const toolDescriptions = availableTools
      .map(tool => `${tool.name}: ${tool.description}\nパラメータ: ${JSON.stringify(tool.parameters)}`)
      .join('\n\n');
    
    if (this.language === "ja") {
      return `あなたは、AWS上で稼働するワークロードを監視・運用するエージェントです。
      ${this.architectureDescription}
      
      現在、以下の障害が報告されています：
      ${errorDescription}
      
      <AvailableTools>
      ${toolDescriptions}
      </AvailableTools>
      
      まず、この障害について理解するために、どのような情報が必要か考えてください。
      そして、必要な情報を収集するために適切なツールを選択してください。
      
      以下の形式で回答してください：
      
      <Thought>
      障害の内容を理解し、必要な情報を特定します。
      </Thought>
      
      <Action>
      {
        "tool": "使用するツール名",
        "parameters": {
          "param1": "値1",
          "param2": "値2"
        }
      }
      </Action>`;
    } else {
      return `You are an agent that monitors and operates workloads running on AWS.
      ${this.architectureDescription}
      
      Currently, the following issue has been reported:
      ${errorDescription}
      
      <Available Tools>
      ${toolDescriptions}
      
      First, think about what information you need to understand this issue.
      Then, select the appropriate tools to gather the necessary information.
      
      Please respond in the following format:
      
      <Thought>
      Understand the issue and identify the information needed.
      </Thought>
      
      <Action>
      {
        "tool": "tool_name_to_use",
        "parameters": {
          "param1": "value1",
          "param2": "value2"
        }
      }
      </Action>`;
    }
  }

    /**
   * クエリからAWSのnamespaceを推論するためのプロンプトを作成する
   * @param query ユーザーのクエリ
   * @returns プロンプトテキスト
   */
  createNamespaceInferencePrompt(query: string): string {
    return this.language === "ja" 
      ? `あなたはAWSのCloudWatchメトリクスの専門家です。以下のユーザーのクエリから、関連するAWS CloudWatchのnamespaceを推論してください。
クエリ: "${query}"

以下の形式でJSON配列として返してください。関連性が高いと思われるnamespaceのみを含めてください。
["Namespace1", "Namespace2", ...]

一般的なAWS CloudWatch namespaceの例:
- AWS/EC2: EC2インスタンスに関するメトリクス
- AWS/ECS: ECSクラスターやサービスに関するメトリクス
- AWS/RDS: RDSデータベースに関するメトリクス
- AWS/Lambda: Lambda関数に関するメトリクス
- AWS/DynamoDB: DynamoDBテーブルに関するメトリクス
- AWS/ElastiCache: ElastiCacheクラスターに関するメトリクス
- AWS/ApplicationELB: Application Load Balancerに関するメトリクス
- AWS/NetworkELB: Network Load Balancerに関するメトリクス
- AWS/S3: S3バケットに関するメトリクス
- AWS/ApiGateway: API Gatewayに関するメトリクス
- AWS/SQS: SQSキューに関するメトリクス
- AWS/SNS: SNSトピックに関するメトリクス
- AWS/CloudFront: CloudFrontディストリビューションに関するメトリクス`
      : `You are an AWS CloudWatch metrics expert. Based on the following user query, infer the relevant AWS CloudWatch namespaces.
Query: "${query}"

Please respond with a JSON array in the following format. Include only the namespaces you think are relevant:
["Namespace1", "Namespace2", ...]

Examples of common AWS CloudWatch namespaces:
- AWS/EC2: Metrics for EC2 instances
- AWS/ECS: Metrics for ECS clusters and services
- AWS/RDS: Metrics for RDS databases
- AWS/Lambda: Metrics for Lambda functions
- AWS/DynamoDB: Metrics for DynamoDB tables
- AWS/ElastiCache: Metrics for ElastiCache clusters
- AWS/ApplicationELB: Metrics for Application Load Balancers
- AWS/NetworkELB: Metrics for Network Load Balancers
- AWS/S3: Metrics for S3 buckets
- AWS/ApiGateway: Metrics for API Gateway
- AWS/SQS: Metrics for SQS queues
- AWS/SNS: Metrics for SNS topics
- AWS/CloudFront: Metrics for CloudFront distributions`;
  }

  /**
   * メトリクス選択のためのプロンプトを作成する
   * @param query ユーザーのクエリ
   * @param metrics 利用可能なメトリクス
   * @param durationInDays 期間（日数）
   * @returns プロンプトテキスト
   */
  createMetricSelectionPrompt(
    query: string, 
    metrics: string, 
    durationInDays: number
  ): string {
    return this.language === "ja"
      ? `あなたはAWSのCloudWatchメトリクスの専門家です。ユーザーのクエリに基づいて、最も関連性の高いメトリクスを選択し、CloudWatch GetMetricDataのクエリを作成してください。

ユーザーのクエリ: "${query}"

利用可能なメトリクス:
${metrics}

期間: ${durationInDays.toFixed(1)}日

以下の形式でMetricDataQueryの配列をJSON形式で返してください。各メトリクスには一意のIdを割り当て、わかりやすいLabelを付けてください。
必ず<Query>タグと</Query>タグで囲んでください。

<Query>
[
  {
    "Id": "m1",
    "Label": "メトリクスの説明ラベル",
    "MetricStat": {
      "Metric": {
        "Namespace": "AWS/Service",
        "MetricName": "MetricName",
        "Dimensions": [
          {
            "Name": "DimensionName",
            "Value": "DimensionValue"
          }
        ]
      },
      "Period": 300,
      "Stat": "Average"
    }
  }
]
</Query>

ユーザーのクエリに最も関連するメトリクスのみを選択し、5つ以内に制限してください。必ず<Query>タグと</Query>タグでJSONを囲んでください。`
      : `You are an AWS CloudWatch metrics expert. Based on the user's query, select the most relevant metrics and create a CloudWatch GetMetricData query.

User Query: "${query}"

Available Metrics:
${metrics}

Duration: ${durationInDays.toFixed(1)} days

Please respond with a JSON array of MetricDataQuery objects in the following format. Assign unique Ids to each metric and provide descriptive Labels.
Make sure to wrap your response with <Query> and </Query> tags.

<Query>
[
  {
    "Id": "m1",
    "Label": "Descriptive metric label",
    "MetricStat": {
      "Metric": {
        "Namespace": "AWS/Service",
        "MetricName": "MetricName",
        "Dimensions": [
          {
            "Name": "DimensionName",
            "Value": "DimensionValue"
          }
        ]
      },
      "Period": 300,
      "Stat": "Average"
    }
  }
]
</Query>

Select only the metrics most relevant to the user's query, limiting to 5 or fewer. Always wrap your JSON response with <Query> and </Query> tags.`;
  }

  /**
   * メトリクスインサイトのためのプロンプトを作成する
   * @param query ユーザーのクエリ
   * @param metricsData メトリクスデータ
   * @returns プロンプトテキスト
   */
  createMetricsInsightPrompt(
    query: string, 
    metricsData: string
  ): string {
    return this.language === "ja"
      ? `あなたはAWSのCloudWatchメトリクスの専門家です。以下のユーザーのクエリとメトリクスデータに基づいて、インサイトを提供してください。

ユーザーのクエリ: "${query}"

メトリクスデータ:
${metricsData}

以下の点を含めて、詳細な分析を提供してください：
1. メトリクスの概要と重要なポイント
2. 異常値や傾向の特定
3. パフォーマンスの問題や最適化の機会
4. ユーザーのクエリに対する具体的な回答
5. 推奨される次のステップや対応策

マークダウン形式で回答し、必要に応じて箇条書きや見出しを使用して読みやすくしてください。`
      : `You are an AWS CloudWatch metrics expert. Based on the following user query and metrics data, provide insights.

User Query: "${query}"

Metrics Data:
${metricsData}

Please provide a detailed analysis including:
1. Overview of the metrics and key points
2. Identification of anomalies or trends
3. Performance issues or optimization opportunities
4. Specific answers to the user's query
5. Recommended next steps or actions

Format your response in Markdown, using bullet points and headings as appropriate for readability.`;
  }

  public createReactFinalAnswerPrompt(
    context: string,
    history: HistoryItem[]
  ): string {
    const historyText = history
      .map(item => `思考: ${item.thinking}\n行動: ${item.action}\n観察: ${item.observation}`)
      .join('\n\n');
    
    if (this.language === "ja") {
      return `あなたは、AWS上で稼働するワークロードを監視・運用するエージェントです。
      ${this.architectureDescription}
      
      現在、以下の障害が報告されています：
      ${context}
      
      <AnalysisHistory>
      ${historyText}
      </AnalysisHistory>
      
      これまでの分析結果に基づいて、障害の根本原因と解決策を詳細に説明してください。
      以下の形式で回答してください：
      
      <output_format>
      ## 障害概要
      （障害の簡潔な説明）
      
      ## 根本原因
      （特定された根本原因の詳細な説明）
      - 重要度: [高/中/低] - 問題の影響範囲と深刻さに基づく評価
      - 確信度: [高/中/低] - 提供されたデータに基づく分析の確実性
      
      ## 参照したログ/メトリクス
      （分析に使用した具体的なログやメトリクスの引用と説明）
      
      ## 時系列分析
      （障害の発生から検知までの時系列の再構築）
      
      ## 推奨される対応策
      （問題解決のための具体的な推奨事項）
      
      ## 再発防止策
      （同様の問題が将来発生しないようにするための提案）
      </output_format>
      
      障害分析結果:`;
    } else {
      return `You are an agent that monitors and operates workloads running on AWS.
      ${this.architectureDescription}
      
      Currently, the following issue has been reported:
      ${context}
      
      <Analysis History>
      ${historyText}
      
      Based on the analysis results so far, please provide a detailed explanation of the root cause and solution for the issue.
      Please respond in the following format:
      
      <output_format>
      ## Issue Summary
      (Brief description of the issue)
      
      ## Root Cause
      (Detailed explanation of the identified root cause)
      - Severity: [High/Medium/Low] - Assessment based on the scope and severity of the problem
      - Confidence: [High/Medium/Low] - Certainty of the analysis based on the provided data
      
      ## Referenced Logs/Metrics
      (Citations and explanations of specific logs and metrics used in the analysis)
      
      ## Timeline Analysis
      (Reconstruction of the timeline from the occurrence to the detection of the issue)
      
      ## Recommended Actions
      (Specific recommendations for resolving the issue)
      
      ## Prevention Measures
      (Suggestions to prevent similar issues from occurring in the future)
      </output_format>
      
      Analysis Result:`;
    }
  }

}
