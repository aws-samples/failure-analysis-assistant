import { ToolDescription } from "./tools-registry.js";
import { HistoryItem } from "./react-agent.js";
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

  /**
   * 履歴を最適化する
   * サイクル数が多い場合は直近の履歴のみを詳細に含め、古い履歴は要約する
   */
  private optimizeHistory(history: HistoryItem[], cycleCount: number): string {
    // 履歴が長い場合（例：5回以上）
    if (cycleCount >= 5) {
      // 直近の3回分の履歴を詳細に含める
      const recentHistory = history.slice(-3);
      const recentHistoryText = recentHistory
        .map(item => `思考: ${item.thinking}\n行動: ${item.action}\n観察: ${item.observation}`)
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
      .map(item => `思考: ${item.thinking}\n行動: ${item.action}\n観察: ${item.observation}`)
      .join('\n\n');
  }
  
  /**
   * サイクル数に応じたプロンプト強化
   * サイクル数が多い場合は最終回答の生成を強く促す
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
    const toolDescriptions = availableTools
      .map(tool => `${tool.name}: ${tool.description}\nパラメータ: ${JSON.stringify(tool.parameters)}`)
      .join('\n\n');
    
    // 履歴の最適化
    const historyText = this.optimizeHistory(history, cycleCount);
    
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
      
      次に何をすべきか考えてください。以下の形式で回答してください：
      
      <Thought>
      現在の状況を分析し、次に何をすべきか考えます。
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
      return this.enhancePromptForHighCycleCount(basePrompt, cycleCount);
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
      
      Think about what to do next. Please respond in the following format:
      
      <Thought>
      Analyze the current situation and consider what to do next.
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
      return this.enhancePromptForHighCycleCount(basePrompt, cycleCount);
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

  /**
   * Tree of Thinking (ToT)を使用して複数の仮説を生成するためのプロンプトを作成する
   * @param errorDescription 障害の説明
   * @param kbSearchResults Knowledge Base検索結果
   * @param maxHypotheses 生成する最大仮説数
   * @returns ToT用のプロンプト
   */
  public createToTPrompt(
    errorDescription: string,
    kbSearchResults: string,
    maxHypotheses: number = 5
  ): string {
    if (this.language === "ja") {
      return `あなたは、AWS上で稼働するワークロードを監視・運用するエージェントです。
      ${this.architectureDescription}
      
      現在、以下の障害が報告されています：
      ${errorDescription}
      
      <KnowledgeBaseResults>
      ${kbSearchResults}
      </KnowledgeBaseResults>
      
      あなたの役割は、Tree of Thinking（ToT）アプローチを使用して、この障害の考えられる原因について複数の仮説を生成することです。
      
      以下のステップに従って、最大${maxHypotheses}個の仮説を生成してください：
      
      1. 障害の説明を注意深く分析し、主要な症状、影響を受けるコンポーネント、タイミングなどの重要な情報を特定します。
      2. Knowledge Baseの結果を確認し、類似の障害パターンや関連する情報を探します。
      3. AWS環境の一般的な障害パターンと、提供されたアーキテクチャ情報に基づいて考えられる原因を検討します。
      4. 各仮説について、その説明、信頼度、根拠を詳細に記述します。
      5. 仮説は具体的で検証可能なものにしてください。
      
      各仮説は以下の形式で提示してください：
      
      <Hypothesis 1>
      説明: [障害の原因と影響の簡潔な説明]
      信頼度: [高/中/低] (0.0〜1.0のスケールで数値も含める)
      根拠: [この仮説を支持する理由、観察された症状との関連性]
      情報源: [Knowledge Base / LLMの知識 / アーキテクチャ分析]
      </Hypothesis 1>
      
      <Hypothesis 2>
      ...
      </Hypothesis 2>
      
      (最大${maxHypotheses}個の仮説まで続ける)
      
      最後に、生成した仮説の概要と、それらを検証するために収集すべき追加情報について簡潔に説明してください。`;
    } else {
      return `You are an agent that monitors and operates workloads running on AWS.
      ${this.architectureDescription}
      
      Currently, the following issue has been reported:
      ${errorDescription}
      
      <KnowledgeBaseResults>
      ${kbSearchResults}
      </KnowledgeBaseResults>
      
      Your role is to generate multiple hypotheses about the possible causes of this issue using a Tree of Thinking (ToT) approach.
      
      Follow these steps to generate up to ${maxHypotheses} hypotheses:
      
      1. Carefully analyze the issue description to identify key symptoms, affected components, timing, and other critical information.
      2. Review the Knowledge Base results to find similar issue patterns or relevant information.
      3. Consider possible causes based on common failure patterns in AWS environments and the provided architecture information.
      4. For each hypothesis, provide a detailed description, confidence level, and reasoning.
      5. Make sure each hypothesis is specific and verifiable.
      
      Present each hypothesis in the following format:
      
      <Hypothesis 1>
      Description: [Concise explanation of the cause and impact of the issue]
      Confidence: [High/Medium/Low] (also include a numerical value on a scale of 0.0 to 1.0)
      Reasoning: [Why this hypothesis is supported, how it relates to the observed symptoms]
      Source: [Knowledge Base / LLM knowledge / Architecture analysis]
      </Hypothesis 1>
      
      <Hypothesis 2>
      ...
      </Hypothesis 2>
      
      (continue up to ${maxHypotheses} hypotheses)
      
      Finally, provide a brief summary of the generated hypotheses and additional information that should be collected to verify them.`;
    }
  }

  /**
   * 仮説を評価するためのプロンプトを作成する
   * @param hypothesis 評価対象の仮説
   * @param context 障害の説明
   * @param history ReActエージェントの履歴
   * @returns 評価用のプロンプト
   */
  public createEvaluationPrompt(
    hypothesis: { id: string; description: string; confidence: number; reasoning: string; },
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
      
      <Hypothesis>
      ID: ${hypothesis.id}
      説明: ${hypothesis.description}
      信頼度: ${hypothesis.confidence}
      根拠: ${hypothesis.reasoning}
      </Hypothesis>
      
      <AnalysisHistory>
      ${historyText}
      </AnalysisHistory>
      
      あなたの役割は、上記の仮説が収集されたデータと一致するかどうかを評価することです。
      
      以下のステップに従って評価を行ってください：
      
      1. 仮説の内容を注意深く分析します。
      2. 分析履歴を確認し、収集されたデータ（メトリクス、ログ、変更履歴など）を評価します。
      3. 仮説が収集されたデータと一致するかどうかを判断します。
      4. 評価結果に基づいて、仮説の状態（確定/棄却/保留）を決定します。
      
      評価結果は以下の形式で提示してください：
      
      <Evaluation>
      状態: [確定/棄却/保留]
      信頼度: [0.0〜1.0のスケール]
      根拠: [この評価を支持する理由、収集されたデータとの関連性]
      </Evaluation>
      
      状態の定義：
      - 確定: 仮説が収集されたデータと一致し、障害の原因として確定できる
      - 棄却: 仮説が収集されたデータと矛盾し、障害の原因として棄却できる
      - 保留: 仮説を確定または棄却するための十分なデータがない`;
    } else {
      return `You are an agent that monitors and operates workloads running on AWS.
      ${this.architectureDescription}
      
      Currently, the following issue has been reported:
      ${context}
      
      <Hypothesis>
      ID: ${hypothesis.id}
      Description: ${hypothesis.description}
      Confidence: ${hypothesis.confidence}
      Reasoning: ${hypothesis.reasoning}
      </Hypothesis>
      
      <AnalysisHistory>
      ${historyText}
      </AnalysisHistory>
      
      Your role is to evaluate whether the above hypothesis matches the collected data.
      
      Follow these steps to perform the evaluation:
      
      1. Carefully analyze the content of the hypothesis.
      2. Review the analysis history and evaluate the collected data (metrics, logs, change history, etc.).
      3. Determine whether the hypothesis matches the collected data.
      4. Based on the evaluation results, decide the status of the hypothesis (confirmed/rejected/inconclusive).
      
      Present your evaluation in the following format:
      
      <Evaluation>
      Status: [Confirmed/Rejected/Inconclusive]
      Confidence: [Scale of 0.0 to 1.0]
      Reasoning: [Why this evaluation is supported, how it relates to the collected data]
      </Evaluation>
      
      Status definitions:
      - Confirmed: The hypothesis matches the collected data and can be confirmed as the cause of the issue
      - Rejected: The hypothesis contradicts the collected data and can be rejected as the cause of the issue
      - Inconclusive: There is insufficient data to confirm or reject the hypothesis`;
    }
  }
}
