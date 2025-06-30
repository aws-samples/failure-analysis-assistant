import { Prompt } from "./prompt.js";
import { ToolRegistry } from "./tools-registry.js";
import { logger } from "./logger.js";
import { ToTAgent, Hypothesis, ToTState } from "./tot-agent.js";
import { ReActAgent, ReactSessionState, BaseState } from "./react-agent.js";
import { Evaluator, EvaluationResult } from "./evaluator.js";
import { AWSServiceFactory } from "./aws/aws-service-factory.js";

/**
 * 仮説検証の状態を表すインターフェース
 */
export interface HypothesisVerificationState {
  hypothesisId: string;
  status: 'pending' | 'in_progress' | 'completed';
  evaluationResult?: EvaluationResult;
}

/**
 * Orchestratorの状態を表すインターフェース
 */
export interface OrchestratorState extends BaseState {
  totState?: ToTState;
  hypotheses: Hypothesis[];
  currentHypothesisIndex: number;
  verificationStates: HypothesisVerificationState[];
  reactSessionState?: ReactSessionState;
  finalResult?: {
    hypothesisId: string;
    status: 'confirmed' | 'best_effort';
    confidenceLevel: 'high' | 'medium' | 'low';
  };
}

/**
 * Orchestratorの実行ステップの結果を表すインターフェース
 */
export interface OrchestratorStepResult {
  isDone: boolean;
  currentState: OrchestratorState;
  nextAction?: 'generate_hypotheses' | 'verify_hypothesis' | 'evaluate_hypothesis' | 'select_next_hypothesis' | 'generate_final_answer';
  finalAnswer?: string;
}

/**
 * ToTAgentとReActAgentを連携させ、仮説の管理と検証フローを制御するクラス
 */
export class Orchestrator {
  private sessionId: string;
  private toolRegistry: ToolRegistry;
  private prompt: Prompt;
  private maxHypotheses: number;
  private state: OrchestratorState;
  private totAgent: ToTAgent;
  private reactAgent: ReActAgent | null;
  private evaluator: Evaluator;
  
  constructor(
    sessionId: string,
    toolRegistry: ToolRegistry,
    prompt: Prompt,
    maxHypotheses: number = 3
  ) {
    this.sessionId = sessionId;
    this.toolRegistry = toolRegistry;
    this.prompt = prompt;
    this.maxHypotheses = maxHypotheses;
    
    // 初期状態の設定
    this.state = {
      context: "",
      finalAnswer: null,
      toolExecutions: [],
      hypotheses: [],
      currentHypothesisIndex: -1,
      verificationStates: []
    };
    
    // 各コンポーネントの初期化
    this.totAgent = new ToTAgent(sessionId, toolRegistry, prompt, maxHypotheses);
    this.reactAgent = null;
    this.evaluator = new Evaluator(prompt);
  }
  
  /**
   * 状態を設定する
   * @param state Orchestratorの状態
   */
  public setState(state: OrchestratorState): void {
    this.state = state;
    
    // reactSessionStateが存在する場合、ReActAgentを再初期化または状態を更新
    if (state.reactSessionState) {
      if (!this.reactAgent) {
        // ReActAgentがnullの場合は新しく作成
        this.reactAgent = new ReActAgent(
          this.sessionId,
          this.state.context,
          this.toolRegistry,
          this.prompt
        );
      }
      // 状態を設定
      this.reactAgent.setSessionState(state.reactSessionState);
    }
  }
  
  /**
   * 現在の状態を取得する
   * @returns Orchestratorの状態
   */
  public getState(): OrchestratorState {
    return this.state;
  }
  
  /**
   * 障害分析のフローを実行する
   * @param errorDescription 障害の説明
   * @returns 実行結果
   */
  public async executeStep(errorDescription?: string): Promise<OrchestratorStepResult> {
    logger.info("Executing orchestrator step", { 
      sessionId: this.sessionId,
      currentHypothesisIndex: this.state.currentHypothesisIndex,
      hypothesesCount: this.state.hypotheses.length
    });
    
    // 初回実行時は障害の説明を設定
    if (errorDescription && this.state.context === "") {
      this.state.context = errorDescription;
    }
    
    // 仮説がまだ生成されていない場合
    if (this.state.hypotheses.length === 0) {
      return await this.generateHypotheses();
    }
    
    // 現在の仮説が選択されていない場合
    if (this.state.currentHypothesisIndex === -1) {
      return await this.selectNextHypothesis();
    }
    
    // 現在の仮説の検証状態を取得
    const currentHypothesis = this.state.hypotheses[this.state.currentHypothesisIndex];
    const verificationState = this.getVerificationState(currentHypothesis.id);
    
    // 検証状態に応じて処理を分岐
    switch (verificationState.status) {
      case 'pending':
        return await this.startHypothesisVerification();
      case 'in_progress':
        return await this.continueHypothesisVerification();
      case 'completed':
        return await this.processVerificationResult();
      default:
        logger.error("Unknown verification state", { verificationState });
        return {
          isDone: false,
          currentState: this.state,
          nextAction: 'select_next_hypothesis'
        };
    }
  }
  
  /**
   * 仮説を生成する
   * @returns 実行結果
   */
  private async generateHypotheses(): Promise<OrchestratorStepResult> {
    logger.info("Generating hypotheses", { sessionId: this.sessionId });
    
    try {
      // ToTAgentを使用して仮説を生成
      const totState = await this.totAgent.generateHypotheses(this.state.context);
      
      // 状態を更新
      this.state.totState = totState;
      this.state.hypotheses = totState.hypotheses;
      
      // 検証状態を初期化
      this.state.verificationStates = totState.hypotheses.map(hypothesis => ({
        hypothesisId: hypothesis.id,
        status: 'pending'
      }));
      
      return {
        isDone: false,
        currentState: this.state,
        nextAction: 'select_next_hypothesis'
      };
    } catch (error) {
      logger.error("Failed to generate hypotheses", { error });
      
      // エラー時のフォールバック
      const fallbackHypothesis: Hypothesis = {
        id: "fallback-1",
        description: "障害の原因として考えられるのは、システムリソースの不足、設定ミス、または外部依存関係の問題です。",
        confidenceLevel: 'low',
        reasoning: "仮説生成中にエラーが発生しました。一般的な障害パターンに基づく仮説です。",
        source: "llm"
      };
      
      this.state.hypotheses = [fallbackHypothesis];
      this.state.verificationStates = [{
        hypothesisId: fallbackHypothesis.id,
        status: 'pending'
      }];
      
      return {
        isDone: false,
        currentState: this.state,
        nextAction: 'select_next_hypothesis'
      };
    }
  }
  
  /**
   * 次の仮説を選択する
   * @returns 実行結果
   */
  private async selectNextHypothesis(): Promise<OrchestratorStepResult> {
    logger.info("Selecting next hypothesis", { 
      sessionId: this.sessionId,
      currentIndex: this.state.currentHypothesisIndex,
      totalHypotheses: this.state.hypotheses.length
    });
    
    // 未検証の仮説を探す
    const pendingIndex = this.state.verificationStates.findIndex(vs => vs.status === 'pending');
    
    if (pendingIndex >= 0) {
      // 未検証の仮説がある場合
      this.state.currentHypothesisIndex = pendingIndex;
      return {
        isDone: false,
        currentState: this.state,
        nextAction: 'verify_hypothesis'
      };
    } else {
      // すべての仮説が検証済みの場合
      return await this.generateFinalAnswer();
    }
  }
  
  /**
   * 仮説の検証を開始する
   * @returns 実行結果
   */
  private async startHypothesisVerification(): Promise<OrchestratorStepResult> {
    const currentHypothesis = this.state.hypotheses[this.state.currentHypothesisIndex];
    logger.info("Starting hypothesis verification", { 
      sessionId: this.sessionId,
      hypothesisId: currentHypothesis.id
    });
    
    // 検証状態を更新
    this.updateVerificationState(currentHypothesis.id, 'in_progress');
    
    // ReActAgentを初期化
    this.reactAgent = new ReActAgent(
      this.sessionId,
      `${this.state.context}\n\n検証する仮説: ${currentHypothesis.description}`,
      this.toolRegistry,
      this.prompt
    );
    
    // 初期思考を設定
    const initialThinking = `<Thought>
この仮説「${currentHypothesis.description}」を検証するために、関連するデータを収集します。
まず、この仮説に関連するメトリクスやログを確認し、障害の兆候を探します。
</Thought>

<Action>
{
  "tool": "metrics_tool",
  "parameters": {}
}
</Action>`;
    
    this.reactAgent.initializeWithThinking(initialThinking);
    
    // 状態を更新
    this.state.reactSessionState = this.reactAgent.getSessionState();
    
    return {
      isDone: false,
      currentState: this.state,
      nextAction: 'verify_hypothesis'
    };
  }
  
  /**
   * 仮説の検証を続行する
   * @returns 実行結果
   */
  private async continueHypothesisVerification(): Promise<OrchestratorStepResult> {
    if (!this.reactAgent || !this.state.reactSessionState) {
      logger.error("ReActAgent not initialized", { sessionId: this.sessionId });
      return await this.selectNextHypothesis();
    }
    
    // ReActAgentのステップを実行
    const stepResult = await this.reactAgent.executeStep();
    
    // 状態を更新
    this.state.reactSessionState = this.reactAgent.getSessionState();
    
    if (stepResult.isDone) {
      // ReActAgentの実行が完了した場合
      return await this.evaluateHypothesis();
    } else {
      // ReActAgentの実行が継続中の場合
      return {
        isDone: false,
        currentState: this.state,
        nextAction: 'verify_hypothesis'
      };
    }
  }
  
  /**
   * 仮説を評価する
   * @returns 実行結果
   */
  private async evaluateHypothesis(): Promise<OrchestratorStepResult> {
    const currentHypothesis = this.state.hypotheses[this.state.currentHypothesisIndex];
    logger.info("Evaluating hypothesis", { 
      sessionId: this.sessionId,
      hypothesisId: currentHypothesis.id
    });
    
    if (!this.state.reactSessionState) {
      logger.error("ReActAgent session state not available", { sessionId: this.sessionId });
      return await this.selectNextHypothesis();
    }
    
    try {
      // Evaluatorを使用して仮説を評価
      const evaluationResult = await this.evaluator.evaluateHypothesis(
        currentHypothesis,
        this.state.context,
        this.state.reactSessionState.history
      );
      
      // 検証状態を更新
      this.updateVerificationState(currentHypothesis.id, 'completed', evaluationResult);
      
      // 仮説が確定した場合は最終結果を設定
      if (evaluationResult.status === 'confirmed' && evaluationResult.confidenceLevel === 'high') {
        this.state.finalResult = {
          hypothesisId: currentHypothesis.id,
          status: 'confirmed',
          confidenceLevel: evaluationResult.confidenceLevel
        };
        
        return await this.generateFinalAnswer();
      }
      
      // 次の仮説を選択
      return await this.selectNextHypothesis();
    } catch (error) {
      logger.error("Failed to evaluate hypothesis", { error });
      
      // エラー時は次の仮説を選択
      this.updateVerificationState(currentHypothesis.id, 'completed', {
        hypothesisId: currentHypothesis.id,
        status: 'inconclusive',
        confidenceLevel: 'low',
        reasoning: `評価中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`
      });
      
      return await this.selectNextHypothesis();
    }
  }
  
  /**
   * 検証結果を処理する
   * @returns 実行結果
   */
  private async processVerificationResult(): Promise<OrchestratorStepResult> {
    // 次の仮説を選択
    return await this.selectNextHypothesis();
  }
  
  /**
   * 最終回答を生成する
   * @returns 実行結果
   */
  private async generateFinalAnswer(): Promise<OrchestratorStepResult> {
    logger.info("Generating final answer", { sessionId: this.sessionId });
    
    // 確定された仮説があるか確認
    const confirmedVerification = this.state.verificationStates.find(vs => 
      vs.evaluationResult?.status === 'confirmed' && 
      vs.evaluationResult.confidenceLevel === 'high'
    );
    
    if (confirmedVerification) {
      // 確定された仮説がある場合
      const confirmedHypothesis = this.state.hypotheses.find(h => h.id === confirmedVerification.hypothesisId);
      
      if (confirmedHypothesis) {
        this.state.finalResult = {
          hypothesisId: confirmedHypothesis.id,
          status: 'confirmed',
          confidenceLevel: confirmedVerification.evaluationResult!.confidenceLevel
        };
        
        const finalAnswer = await this.createFinalAnswer(confirmedHypothesis, confirmedVerification.evaluationResult!);
        
        return {
          isDone: true,
          currentState: this.state,
          finalAnswer
        };
      }
    }
    
    // 確定された仮説がない場合は、最初の仮説を選択（LLMが重要度順に並べているため）
    const bestVerification = this.state.verificationStates
      .filter(vs => vs.evaluationResult)[0];
    
    if (bestVerification && bestVerification.evaluationResult) {
      const bestHypothesis = this.state.hypotheses.find(h => h.id === bestVerification.hypothesisId);
      
      if (bestHypothesis) {
        this.state.finalResult = {
          hypothesisId: bestHypothesis.id,
          status: 'best_effort',
          confidenceLevel: bestVerification.evaluationResult.confidenceLevel
        };
        
        const finalAnswer = await this.createFinalAnswer(bestHypothesis, bestVerification.evaluationResult, true);
        
        return {
          isDone: true,
          currentState: this.state,
          finalAnswer
        };
      }
    }
    
    // 仮説が見つからない場合のフォールバック
    const fallbackAnswer = `
## 障害分析結果

### 分析概要
障害の原因を特定するための十分なデータを収集できませんでした。収集されたデータからは明確な結論を導き出せません。

### 考えられる原因
以下の可能性が考えられますが、確定的な結論ではありません：

1. システムリソースの不足（CPU、メモリ、ディスク容量など）
2. ネットワーク接続の問題
3. 設定ミスまたは互換性の問題
4. 外部依存関係の障害

### 推奨される対応策
1. より詳細なログとメトリクスを収集する
2. システムリソースの使用状況を確認する
3. 最近の設定変更をレビューする
4. 外部依存関係の状態を確認する

### 注意事項
この分析は限られたデータに基づいており、確信度は低いです。より詳細な調査が必要です。
`;
    
    return {
      isDone: true,
      currentState: this.state,
      finalAnswer: fallbackAnswer
    };
  }
  
  /**
   * 最終回答を作成する
   * @param hypothesis 仮説
   * @param evaluation 評価結果
   * @param isBestEffort ベストエフォートかどうか
   * @returns 最終回答
   */
  private async createFinalAnswer(
    hypothesis: Hypothesis,
    evaluation: EvaluationResult,
    isBestEffort: boolean = false
  ): Promise<string> {
    // 信頼度レベルを日本語に変換
    const confidenceLevelJa = evaluation.confidenceLevel === 'high' ? "高" : 
                              evaluation.confidenceLevel === 'medium' ? "中" : "低";
    const statusPrefix = isBestEffort ? "## 注意: この分析は最も可能性の高い仮説に基づいていますが、確定的ではありません\n\n" : "";
    
    // 生成AIを使用して対応策と再発防止策を生成
    const { actions, preventions } = await this.generateRecommendationsWithLLM(
      hypothesis,
      this.state.context
    );
    
    return `${statusPrefix}
## 障害分析結果

### 障害概要
${this.state.context}

### 根本原因
${hypothesis.description}

- 重要度: 中～高
- 確信度: ${confidenceLevelJa}

### 根拠
${hypothesis.reasoning}

${evaluation.reasoning ? `### 評価結果\n${evaluation.reasoning}\n` : ""}

### 推奨される対応策
${actions || "対応策を特定できませんでした。"}

### 再発防止策
${preventions || "再発防止策を特定できませんでした。"}
`;
  }
  
  /**
   * 検証状態を取得する
   * @param hypothesisId 仮説ID
   * @returns 検証状態
   */
  private getVerificationState(hypothesisId: string): HypothesisVerificationState {
    const state = this.state.verificationStates.find(vs => vs.hypothesisId === hypothesisId);
    
    if (!state) {
      // 検証状態が見つからない場合は新規作成
      const newState: HypothesisVerificationState = {
        hypothesisId,
        status: 'pending'
      };
      
      this.state.verificationStates.push(newState);
      return newState;
    }
    
    return state;
  }
  
  /**
   * 検証状態を更新する
   * @param hypothesisId 仮説ID
   * @param status 状態
   * @param evaluationResult 評価結果
   */
  private updateVerificationState(
    hypothesisId: string,
    status: 'pending' | 'in_progress' | 'completed',
    evaluationResult?: EvaluationResult
  ): void {
    const stateIndex = this.state.verificationStates.findIndex(vs => vs.hypothesisId === hypothesisId);
    
    if (stateIndex >= 0) {
      // 既存の状態を更新
      this.state.verificationStates[stateIndex] = {
        hypothesisId,
        status,
        evaluationResult
      };
    } else {
      // 新規作成
      this.state.verificationStates.push({
        hypothesisId,
        status,
        evaluationResult
      });
    }
  }
  
  /**
   * 生成AIを使用して対応策と再発防止策を生成する
   * @param hypothesis 仮説
   * @param context 障害の説明
   * @returns 対応策と再発防止策
   */
  private async generateRecommendationsWithLLM(
    hypothesis: Hypothesis,
    context: string
  ): Promise<{ actions: string, preventions: string }> {
    try {
      // BedrockServiceのインスタンスを取得
      const bedrockService = AWSServiceFactory.getBedrockService();
      
      // プロンプトを作成
      const prompt = this.prompt.createRecommendationPrompt(hypothesis, context);
      
      // LLMに問い合わせ
      const response = await bedrockService.converse(prompt);
      
      // レスポンスから対応策と再発防止策を抽出
      return this.extractRecommendationsFromResponse(response || "");
    } catch (error) {
      logger.error("Failed to generate recommendations with LLM", { error });
      
      // エラー時のフォールバック
      return {
        actions: "1. システムの状態を詳細に確認し、問題の影響範囲を特定する\n2. 一時的な回避策を実施して、サービスの可用性を回復する\n3. 根本原因に対する恒久的な修正を計画する",
        preventions: "1. 監視とアラートの強化\n2. 定期的なシステムレビューの実施\n3. 障害対応プロセスの改善"
      };
    }
  }
  
  
  /**
   * LLMのレスポンスから対応策と再発防止策を抽出する
   * @param response LLMのレスポンス
   * @returns 対応策と再発防止策
   */
  private extractRecommendationsFromResponse(response: string): { actions: string, preventions: string } {
    try {
      // <Recommendations>タグで囲まれた部分を抽出
      const recommendationsMatch = response.match(/<Recommendations>([\s\S]*?)<\/Recommendations>/);
      const recommendationsContent = recommendationsMatch ? recommendationsMatch[1].trim() : response;
      
      // 対応策と再発防止策を抽出
      const actionsMatch = recommendationsContent.match(/##\s*推奨される対応策|##\s*Recommended Actions([\s\S]*?)(?=##|$)/i);
      const preventionsMatch = recommendationsContent.match(/##\s*再発防止策|##\s*Prevention Measures([\s\S]*?)(?=##|$)/i);
      
      const actions = actionsMatch ? actionsMatch[1].trim() : "";
      const preventions = preventionsMatch ? preventionsMatch[1].trim() : "";
      
      return { actions, preventions };
    } catch (error) {
      logger.error("Error extracting recommendations", { error });
      
      // エラー時のフォールバック
      return {
        actions: "1. システムの状態を詳細に確認し、問題の影響範囲を特定する\n2. 一時的な回避策を実施して、サービスの可用性を回復する",
        preventions: "1. 監視とアラートの強化\n2. 定期的なシステムレビューの実施"
      };
    }
  }
}
