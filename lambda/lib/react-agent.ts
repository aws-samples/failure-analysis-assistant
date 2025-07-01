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

export interface ToolExecutionRecord {
  toolName: string;
  parameters: Record<string, unknown>;
  result: string;
  timestamp: number;
  dataAvailable: boolean;
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
  toolExecutions: ToolExecutionRecord[];
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
      missingData: [],
      toolExecutions: []
    };
    this.toolRegistry = toolRegistry;
    this.prompt = prompt;
    this.bedrockService = AWSServiceFactory.getBedrockService();
    
    // Default value is 5, can be overridden with options
    this.maxAgentCycles = options?.maxAgentCycles ?? 5;
  }
  
  /**
   * Set initial thinking
   */
  initializeWithThinking(initialThinking: string): void {
    logger.info("Initializing with thinking", { sessionId: this.sessionId });
    
    // Extract action part
    const actionMatch = initialThinking.match(/<Action>([\s\S]*?)<\/Action>/);
    
    if (actionMatch) {
      try {
        const actionJson = actionMatch[1].trim();
        const action = JSON.parse(actionJson);
        
        // Add thinking to initial state
        this.sessionState.history.push({
          thinking: initialThinking,
          action: JSON.stringify(action, null, 2),
          observation: "初期分析を開始します。",
          timestamp: Date.now()
        });
      } catch (error) {
        logger.error("Failed to parse initial action JSON", { error, initialThinking });
        
        // Record thinking even in case of error
        this.sessionState.history.push({
          thinking: initialThinking,
          action: "INITIAL_THINKING_ERROR",
          observation: `初期思考の解析中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: Date.now()
        });
      }
    } else {
      // Record thinking even if no action is found
      this.sessionState.history.push({
        thinking: initialThinking,
        action: "NO_INITIAL_ACTION",
        observation: "初期思考から行動を抽出できませんでした。",
        timestamp: Date.now()
      });
    }
  }
  
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
      logger.info("FinalAnswer or ForceCompletion", {finalAnswer: JSON.stringify(finalAnswerMatch), forceCompletiong: shouldForceCompletion})
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
      
      // Update state
      const message = shouldForceCompletion && !finalAnswerMatch 
        ? "十分なデータが集まらないため、現在の情報に基づいて最終回答を生成します。" 
        : "最終回答を生成します。";
      
      this.updateSessionState(thinking, JSON.stringify(finalAnswerAction, null, 2), message);
      this.sessionState.state = ReactionState.COMPLETING;
      
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
    
    // Increment cycle count
    this.sessionState.cycleCount++;
    
    // Go to thinking step of next cycle
    this.sessionState.state = ReactionState.THINKING;
    
    // Clear temporary data
    delete this.sessionState.lastThinking;
    delete this.sessionState.lastAction;
    delete this.sessionState.lastObservation;
    
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
    const thinkingPrompt = this.prompt.createReactThinkingPrompt(
      this.sessionState.context,
      this.sessionState.history,
      this.toolRegistry.getToolDescriptions(),
      this.sessionState.cycleCount // サイクル数を渡す
    );
    
    try {
      const response = await this.bedrockService.converse(thinkingPrompt);
      return response || "";
    } catch (error) {
      // Return error message in case of throttling error
      if (error instanceof BedrockThrottlingError) {
        logger.warn("Bedrock API throttled during thinking step", { error });
        return `<Thought>
Bedrockのレート制限に達しました。しばらく待ってから再試行してください。
現在の情報に基づいて分析を続けます。
</Thought>

<Action>
{
  "tool": "final_answer",
  "parameters": {
    "content": "Bedrockのレート制限に達したため、分析を完了できませんでした。しばらく待ってから再試行してください。"
  }
}
</Action>`;
      }
      
      // Rethrow other errors
      throw error;
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
      
      // Update data collection status
      this.updateDataCollectionStatus(toolName, result);
      
      // Add tool execution record
      this.recordToolExecution(toolName, parameters, result);
      
      return result;
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
  
  /**
   * Add tool execution record
   */
  private recordToolExecution(toolName: string, parameters: Record<string, unknown>, result: string): void {
    // Create tool execution record
    const toolExecution: ToolExecutionRecord = {
      toolName,
      parameters,
      result,
      timestamp: Date.now(),
      dataAvailable: this.checkDataAvailability(toolName, result)
    };
    
    // Add record
    this.sessionState.toolExecutions.push(toolExecution);
  }
  
  /**
   * Determine data availability based on tool name and execution result
   */
  private checkDataAvailability(toolName: string, result: string): boolean {
    // Determine data availability based on tool name
    switch (toolName) {
      case 'metrics_tool':
        return !result.includes("メトリクスデータが見つかりませんでした");
      case 'logs_tool':
        return !result.includes("条件に一致するログが見つかりませんでした");
      case 'change_history_tool':
      case 'audit_log_tool':
        return !result.includes("変更履歴が見つかりませんでした");
      case 'xray_tool':
        return !result.includes("トレースが見つかりませんでした");
      case 'kb_tool':
        return !result.includes("ナレッジベースに一致する情報が見つかりませんでした");
      default:
        return true;
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
