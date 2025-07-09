import { Prompt } from "./prompt.js";
import { ToolRegistry } from "./tools-registry.js";
import { logger } from "./logger.js";
import { AWSServiceFactory } from "./aws/aws-service-factory.js";
import { BedrockService } from "./aws/services/bedrock-service.js";
import { BedrockThrottlingError } from "./aws/errors/aws-error.js";

export interface HistoryItem {
  thinking: string;
  action: string;
  observation: string;
  timestamp: number;
}

export enum ReactionState {
  THINKING = 'thinking',
  ACTING = 'acting',
  OBSERVING = 'observing',
  COMPLETING = 'completing',
  COMPLETED = 'completed'
}

export interface ToolAction {
  tool: string;
  parameters: Record<string, unknown>;
}

export interface SessionState {
  context: string;
  history: HistoryItem[];
  finalAnswer: string | null;
  state: ReactionState;
  cycleCount: number;
  dataCollectionStatus: {
    metrics: boolean;
    logs: boolean;
    changeHistory: boolean;
    xray: boolean;
    knowledgeBase: boolean;
  };
  lastThinking?: string;
  lastAction?: ToolAction;
  lastObservation?: string;
  missingData?: string[];
  forcedCompletion?: boolean; // 強制完了フラグ
}

export interface StepResult {
  isDone: boolean;
  finalAnswer?: string;
  currentState?: SessionState;
}

export class ReActAgent {
  private sessionId: string;
  private sessionState: SessionState;
  private toolRegistry: ToolRegistry;
  private prompt: Prompt;
  private bedrockService: BedrockService;
  private maxAgentCycles: number;
  
  constructor(
    sessionId: string, 
    initialContext: string, 
    toolRegistry: ToolRegistry, 
    prompt: Prompt,
    options?: { maxAgentCycles?: number }
  ) {
    this.sessionId = sessionId;
    this.sessionState = {
      context: initialContext,
      history: [],
      finalAnswer: null,
      state: ReactionState.THINKING,
      cycleCount: 0,
      dataCollectionStatus: {
        metrics: false,
        logs: false,
        changeHistory: false,
        xray: false,
        knowledgeBase: false
      },
      missingData: []
    };
    this.toolRegistry = toolRegistry;
    this.prompt = prompt;
    this.bedrockService = AWSServiceFactory.getBedrockService();
    
    // Default value is 5, can be overridden with options
    this.maxAgentCycles = options?.maxAgentCycles ?? 5;
  }
  
  // initializeWithThinking関数は削除
  
  /**
   * Set session state
   */
  setSessionState(state: SessionState): void {
    this.sessionState = state;
  }
  
  async executeStep(): Promise<StepResult> {
    logger.info("Start executing step", { 
      sessionId: this.sessionId, 
      historyLength: this.sessionState.history.length,
      currentState: this.sessionState.state,
      cycleCount: this.sessionState.cycleCount
    });
    
    // Branch processing according to current state
    switch (this.sessionState.state) {
      case ReactionState.THINKING:
        return await this.executeThinkingStep();
      case ReactionState.ACTING:
        return await this.executeActingStep();
      case ReactionState.OBSERVING:
        return await this.executeObservingStep();
      case ReactionState.COMPLETING:
        return await this.executeCompletingStep();
      case ReactionState.COMPLETED:
        return {
          isDone: true,
          finalAnswer: this.sessionState.finalAnswer || "分析が完了しましたが、結果を生成できませんでした。"
        };
      default:
        logger.error("Unknown state", { state: this.sessionState.state });
        this.sessionState.state = ReactionState.THINKING;
        return await this.executeThinkingStep();
    }
  }
  
  private async executeThinkingStep(): Promise<StepResult> {
    logger.info("Executing thinking step", { sessionId: this.sessionId });
    // 1. Thinking step - Send current state to LLM and decide next action
    const thinking = await this.think();
    logger.info("Thinking completed", { thinking });
    
    // Determine whether to forcibly generate a final answer after a certain number of cycles
    const shouldForceCompletion = this.shouldForceCompletion();
  
    // Check if final answer is included
    const finalAnswerMatch = thinking.match(/<FinalAnswer>([\s\S]*?)<\/FinalAnswer>/);
    if (finalAnswerMatch || shouldForceCompletion) {
      logger.info("FinalAnswer or ForceCompletion", {finalAnswer: JSON.stringify(finalAnswerMatch), forceCompletion: shouldForceCompletion})
      // If final answer is included, process it as a special action "final_answer"
      const finalAnswer = finalAnswerMatch ? finalAnswerMatch[1].trim() : "";

      // Record "final_answer" as an action
      const finalAnswerAction = {
        tool: "final_answer",
        parameters: {
          content: finalAnswer,
          dataCollectionStatus: this.sessionState.dataCollectionStatus,
          missingData: this.sessionState.missingData
        }
      };

      // 強制完了フラグを設定
      this.sessionState.forcedCompletion = shouldForceCompletion && !finalAnswerMatch;

      // Update state
      const message = shouldForceCompletion && !finalAnswerMatch 
        ? "最大分析サイクル数に達したため、現在の情報に基づいて最終回答を生成します。" 
        : "最終回答を生成します。";

      this.updateSessionState(thinking, JSON.stringify(finalAnswerAction, null, 2), message);
      this.sessionState.state = ReactionState.COMPLETING;
      this.sessionState.lastThinking = thinking; // 最終回答生成の思考を追加する

      return {
        isDone: false,
        currentState: this.sessionState
      };
    }
    
    // Decide action
    const action = this.decideAction(thinking);
    logger.info("Action decided", { action });
    
    if (!action) {
      logger.warn("No action could be extracted from thinking");
      // If action cannot be extracted, encourage thinking again
      this.updateSessionState(thinking, "NO_ACTION_EXTRACTED", "行動を正しいフォーマットで指定できませんでした。再度考えてください。");
      return {
        isDone: false,
        currentState: this.sessionState
      };
    }
    
    // Record action and update state
    this.sessionState.state = ReactionState.ACTING;
    this.sessionState.lastThinking = thinking;
    this.sessionState.lastAction = action;
    
    return {
      isDone: false,
      currentState: this.sessionState
    };
  }
  
  private async executeActingStep(): Promise<StepResult> {
    logger.info("Acting step", { sessionId: this.sessionId });
    // Execute action decided in previous step
    const action = this.sessionState.lastAction;
    
    if (!action) {
      logger.error("No action found in acting step");
      this.sessionState.state = ReactionState.THINKING;
      return {
        isDone: false,
        currentState: this.sessionState
      };
    }
    
    // Execute tool
    const observation = await this.executeAction(action);
    logger.info("Action executed", { observation });
    
    // Record observation result and update state
    this.sessionState.lastObservation = observation;
    this.sessionState.state = ReactionState.OBSERVING;
    
    return {
      isDone: false,
      currentState: this.sessionState
    };
  }
  
  private async executeObservingStep(): Promise<StepResult> {
    logger.info("Observing step", { sessionId: this.sessionId });
    // Record thinking, action, and observation from previous step
    const thinking = this.sessionState.lastThinking;
    const action = this.sessionState.lastAction;
    const observation = this.sessionState.lastObservation;
    
    // ここにデバッグログを追加
    logger.debug("executeObservingStep - データ確認", { 
      sessionId: this.sessionId,
      hasThinking: !!thinking,
      hasAction: !!action,
      hasObservation: observation !== undefined,
      actionDetails: action ? JSON.stringify(action) : "なし",
      observationPreview: observation ? observation.substring(0, 100) + "..." : "なし"
    });
    
    if (!thinking || !action || observation === undefined) {
      logger.error("Missing data in observing step");
      this.sessionState.state = ReactionState.THINKING;
      return {
        isDone: false,
        currentState: this.sessionState
      };
    }
    
    // Update session state
    this.updateSessionState(thinking, JSON.stringify(action, null, 2), observation);
    
    // ここに履歴更新後のデバッグログを追加
    logger.debug("executeObservingStep - 履歴更新後", {
      sessionId: this.sessionId,
      historyLength: this.sessionState.history.length,
      latestHistoryItem: this.sessionState.history.length > 0 ? {
        hasThinking: !!this.sessionState.history[this.sessionState.history.length - 1].thinking,
        hasAction: !!this.sessionState.history[this.sessionState.history.length - 1].action,
        hasObservation: !!this.sessionState.history[this.sessionState.history.length - 1].observation,
        observationPreview: this.sessionState.history[this.sessionState.history.length - 1].observation.substring(0, 100) + "..."
      } : "履歴なし"
    });
    
    // Increment cycle count
    this.sessionState.cycleCount++;
    
    // Go to thinking step of next cycle
    this.sessionState.state = ReactionState.THINKING;
    
    // Clear temporary data
    delete this.sessionState.lastThinking;
    delete this.sessionState.lastAction;
    // delete this.sessionState.lastObservation;
    
    return {
      isDone: false,
      currentState: this.sessionState
    };
  }
  
  private async executeCompletingStep(): Promise<StepResult> {
    logger.info("Completing step", { sessionId: this.sessionId });
    // Create prompt for generating final answer
    const finalAnswerPrompt = this.prompt.createReactFinalAnswerPrompt(
      this.sessionState.context,
      this.sessionState.history
    );
    
    try {
      // Generate final answer
      const finalAnswerResponse = await this.bedrockService.converse(finalAnswerPrompt);
      const finalAnswer = finalAnswerResponse || "分析が完了しましたが、結果を生成できませんでした。";
      logger.info("Completing step - final answer", { finalAnswer: finalAnswer });
      
      // Record final answer
      this.sessionState.finalAnswer = finalAnswer;
      this.sessionState.state = ReactionState.COMPLETED;
      
      return {
        isDone: true,
        finalAnswer
      };
    } catch (error) {
      // Return error message in case of throttling error
      if (error instanceof BedrockThrottlingError) {
        logger.warn("Bedrock API throttled during completing step", { error });
        
        const throttlingMessage = "Bedrockのレート制限に達したため、最終回答の生成に失敗しました。これまでに収集した情報に基づいて、簡易的な回答を生成します。";
        
        // Generate simplified final answer
        const simpleFinalAnswer = `
## レート制限による分析中断

${throttlingMessage}

### 収集済みデータの概要
${this.generateDataSummary()}

### 推奨される対応
1. しばらく待ってから再度分析を実行してください（1-2分程度）
2. 分析対象の時間範囲を短くすることで、処理するデータ量を減らすことができます
3. 特定のサービスやリソースに絞って分析を行うことも効果的です
`;
        
        // Record final answer
        this.sessionState.finalAnswer = simpleFinalAnswer;
        this.sessionState.state = ReactionState.COMPLETED;
        
        return {
          isDone: true,
          finalAnswer: simpleFinalAnswer
        };
      }
      
      // Rethrow other errors
      throw error;
    }
  }
  
  /**
   * Generate summary of collected data
   */
  private generateDataSummary(): string {
    const { dataCollectionStatus } = this.sessionState;
    const collectedData = [];
    
    if (dataCollectionStatus.metrics) collectedData.push("メトリクスデータ");
    if (dataCollectionStatus.logs) collectedData.push("ログデータ");
    if (dataCollectionStatus.changeHistory) collectedData.push("変更履歴データ");
    if (dataCollectionStatus.xray) collectedData.push("X-Rayトレースデータ");
    if (dataCollectionStatus.knowledgeBase) collectedData.push("Knowledge Baseデータ");
    
    if (collectedData.length === 0) {
      return "データが収集されていません。";
    }
    
    return `以下のデータが収集されています：\n- ${collectedData.join('\n- ')}`;
  }
  
  /**
   * Determine whether to forcibly generate a final answer after a certain number of cycles
   */
  private shouldForceCompletion(): boolean {
    // If more than the maximum number of cycles have been executed
    if (this.sessionState.cycleCount >= this.maxAgentCycles) {
      // Check data collection status
      const dataCollectionStatus = this.sessionState.dataCollectionStatus;
      const collectedDataCount = Object.values(dataCollectionStatus).filter(Boolean).length;
      
      // Force completion if at least one data has been collected
      return collectedDataCount > 0;
    }
    
    return false;
  }
  
  private async think(): Promise<string> {
    let prompt: string;
    let logContext: Record<string, unknown> = {
      sessionId: this.sessionId
    };
    
    // 履歴がない場合は初期プロンプトを生成
    if (this.sessionState.history.length === 0) {
      // 初期プロンプトを生成
      prompt = this.prompt.createReactInitialPrompt(
        this.sessionState.context,
        this.toolRegistry.getToolDescriptions()
      );
      
      // ログコンテキストを設定
      logContext = {
        ...logContext,
        promptLength: prompt.length,
        promptType: "initial",
        promptPreview: prompt.substring(0, 200) + "..."
      };
      
      // デバッグログを追加
      logger.debug("think - 初期プロンプト生成", logContext);
    } else {
      // 通常の思考プロセス
      // 直前のサイクルの情報を明示的に追加
      let contextualInfo = "";
      const lastHistory = this.sessionState.history[this.sessionState.history.length - 1];
      const toolName = this.extractToolName(lastHistory.action);
      
      contextualInfo = `【直前のサイクル情報】\n実行したツール: ${toolName}\n実行結果の概要: ${lastHistory.observation.substring(0, 200)}...\n\n`;
      
      const thinkingPrompt = this.prompt.createReactThinkingPrompt(
        this.sessionState.context,
        this.sessionState.history,
        this.toolRegistry.getToolDescriptions(),
        this.sessionState.cycleCount
      );
      
      // コンテキスト情報を追加したプロンプト
      prompt = contextualInfo + thinkingPrompt;
      
      // ログコンテキストを設定
      logContext = {
        ...logContext,
        promptLength: prompt.length,
        promptType: "thinking",
        historyLength: this.sessionState.history.length,
        cycleCount: this.sessionState.cycleCount,
        promptPreview: prompt.substring(0, 200) + "..."
      };
      
      // デバッグログを追加
      logger.debug("think - 生成されたプロンプト", logContext);
    }
    
    try {
      // LLMに問い合わせ
      const response = await this.bedrockService.converse(prompt);
      
      // レスポンスのデバッグログ
      logger.debug("think - LLMからのレスポンス", {
        ...logContext,
        responseLength: response ? response.length : 0,
        responsePreview: response ? response.substring(0, 200) + "..." : "レスポンスなし"
      });
      
      return response || "";
    } catch (error) {
      // エラーハンドリング（共通化）
      if (error instanceof BedrockThrottlingError) {
        const isInitialThinking = this.sessionState.history.length === 0;
        const logLevel = "warn";
        const logMessage = isInitialThinking 
          ? "Bedrock API throttled during initial thinking step" 
          : "Bedrock API throttled during thinking step";
        
        logger[logLevel](logMessage, { error });
        
        // 初期思考か通常の思考かに応じてエラーメッセージを変更
        const thoughtContent = isInitialThinking
          ? "Bedrockのレート制限に達しました。しばらく待ってから再試行してください。"
          : "Bedrockのレート制限に達しました。しばらく待ってから再試行してください。\n現在の情報に基づいて分析を続けます。";
        
        return `<Thought>
${thoughtContent}
</Thought>

<Action>
{
  "tool": "final_answer",
  "parameters": {
    "content": "Bedrockのレート制限に達したため、分析を${isInitialThinking ? '開始' : '完了'}できませんでした。しばらく待ってから再試行してください。"
  }
}
</Action>`;
      }
      
      // その他のエラーは再スロー
      throw error;
    }
  }
  
  // ツール名を抽出するヘルパーメソッド
  private extractToolName(action: string): string {
    try {
      const actionObj = JSON.parse(action);
      return actionObj.tool || "不明なツール";
    } catch {
      // JSONパースに失敗した場合はそのまま
      return "不明なツール";
    }
  }
  
  private decideAction(thinking: string): ToolAction | null {
    // Extract action part
    const actionMatch = thinking.match(/<Action>([\s\S]*?)<\/Action>/);
    if (!actionMatch) {
      return null;
    }
    
    try {
      const actionJson = actionMatch[1].trim();
      return JSON.parse(actionJson);
    } catch (error) {
      logger.error("Failed to parse action JSON", { error, actionText: actionMatch ? actionMatch[1] : "No match" });
      return null;
    }
  }
  
  private async executeAction(action: ToolAction): Promise<string> {
    try {
      const toolName = action.tool;
      const parameters = action.parameters || {};
      
      // Execute tool
      const result = await this.toolRegistry.executeTool(toolName, parameters);
      
      // 結果にツール名を明示的に含める
      const markedResult = `【${toolName}の実行結果】\n${result}`;
      
      // Update data collection status
      this.updateDataCollectionStatus(toolName, markedResult);
      
      return markedResult;
    } catch (error) {
      logger.error("Failed to execute tool", { error, action });
      return `ツールの実行中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  
  /**
   * Update data collection status based on tool name and execution result
   */
  private updateDataCollectionStatus(toolName: string, result: string): void {
    // Update status based on tool name
    switch (toolName) {
      case 'metrics_tool':
        this.sessionState.dataCollectionStatus.metrics = !result.includes("メトリクスデータが見つかりませんでした");
        break;
      case 'logs_tool':
        this.sessionState.dataCollectionStatus.logs = !result.includes("条件に一致するログが見つかりませんでした");
        break;
      case 'change_history_tool':
      case 'audit_log_tool':
        this.sessionState.dataCollectionStatus.changeHistory = !result.includes("変更履歴が見つかりませんでした");
        break;
      case 'xray_tool':
        this.sessionState.dataCollectionStatus.xray = !result.includes("トレースが見つかりませんでした");
        break;
      case 'kb_tool':
        this.sessionState.dataCollectionStatus.knowledgeBase = !result.includes("ナレッジベースに一致する情報が見つかりませんでした");
        break;
    }
  }
  
  
  private updateSessionState(thinking: string, action: string, observation: string): void {
    this.sessionState.history.push({
      thinking,
      action,
      observation,
      timestamp: Date.now()
    });
  }
  
  getSessionState(): SessionState {
    return this.sessionState;
  }
}
