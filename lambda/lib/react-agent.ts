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

/**
 * 基本セッション状態を表すインターフェース
 */
export interface BaseState {
  context: string;
  finalAnswer: string | null;
  toolExecutions: ToolExecutionRecord[];
}

/**
 * ReActエージェントのセッション状態
 */
export interface ReactSessionState extends BaseState {
  history: HistoryItem[];
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
}

// 後方互換性のために残す
export type SessionState = ReactSessionState;

export interface StepResult {
  isDone: boolean;
  finalAnswer?: string;
  currentState?: SessionState;
}

export class ReActAgent {
  private sessionId: string;
  private sessionState: ReactSessionState;
  private toolRegistry: ToolRegistry;
  private prompt: Prompt;
  private bedrockService: BedrockService;
  
  constructor(sessionId: string, initialContext: string, toolRegistry: ToolRegistry, prompt: Prompt) {
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
  }
  
  /**
   * 初期思考を設定する
   */
  initializeWithThinking(initialThinking: string): void {
    logger.info("Initializing with thinking", { sessionId: this.sessionId });
    
    // 行動部分を抽出
    const actionMatch = initialThinking.match(/<Action>([\s\S]*?)<\/Action>/);
    
    if (actionMatch) {
      try {
        const actionJson = actionMatch[1].trim();
        const action = JSON.parse(actionJson);
        
        // 初期状態に思考を追加
        this.sessionState.history.push({
          thinking: initialThinking,
          action: JSON.stringify(action, null, 2),
          observation: "初期分析を開始します。",
          timestamp: Date.now()
        });
      } catch (error) {
        logger.error("Failed to parse initial action JSON", { error, initialThinking });
        
        // エラーの場合でも思考は記録
        this.sessionState.history.push({
          thinking: initialThinking,
          action: "INITIAL_THINKING_ERROR",
          observation: `初期思考の解析中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: Date.now()
        });
      }
    } else {
      // 行動が見つからない場合も思考は記録
      this.sessionState.history.push({
        thinking: initialThinking,
        action: "NO_INITIAL_ACTION",
        observation: "初期思考から行動を抽出できませんでした。",
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * セッション状態を設定する
   */
  setSessionState(state: ReactSessionState): void {
    this.sessionState = state;
  }
  
  async executeStep(): Promise<StepResult> {
    logger.info("Start executing step", { 
      sessionId: this.sessionId, 
      historyLength: this.sessionState.history.length,
      currentState: this.sessionState.state,
      cycleCount: this.sessionState.cycleCount
    });
    
    // 現在の状態に応じて処理を分岐
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
    // 1. 思考ステップ - LLMに現在の状態を送信し、次のアクションを決定
    const thinking = await this.think();
    logger.info("Thinking completed", { thinking });
    
    // 一定回数のサイクル後に最終回答を強制的に生成するかどうかを判断
    const shouldForceCompletion = this.shouldForceCompletion();
    
    // 最終回答が含まれているか確認
    const finalAnswerMatch = thinking.match(/<FinalAnswer>([\s\S]*?)<\/FinalAnswer>/);
    if (finalAnswerMatch || shouldForceCompletion) {
      logger.info("FinalAnswer or ForceCompletion", {finalAnswer: JSON.stringify(finalAnswerMatch), forceCompletiong: shouldForceCompletion})
      // 最終回答が含まれている場合は、特別なアクション「final_answer」として処理
      const finalAnswer = finalAnswerMatch ? finalAnswerMatch[1].trim() : "";
      
      // 行動として「final_answer」を記録
      const finalAnswerAction = {
        tool: "final_answer",
        parameters: {
          content: finalAnswer,
          dataCollectionStatus: this.sessionState.dataCollectionStatus,
          missingData: this.sessionState.missingData
        }
      };
      
      // 状態を更新
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
    
    // 行動を決定
    const action = this.decideAction(thinking);
    logger.info("Action decided", { action });
    
    if (!action) {
      logger.warn("No action could be extracted from thinking");
      // 行動が抽出できない場合は、再度思考を促す
      this.updateSessionState(thinking, "NO_ACTION_EXTRACTED", "行動を正しいフォーマットで指定できませんでした。再度考えてください。");
      return {
        isDone: false,
        currentState: this.sessionState
      };
    }
    
    // 行動を記録し、状態を更新
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
    // 前のステップで決定されたアクションを実行
    const action = this.sessionState.lastAction;
    
    if (!action) {
      logger.error("No action found in acting step");
      this.sessionState.state = ReactionState.THINKING;
      return {
        isDone: false,
        currentState: this.sessionState
      };
    }
    
    // ツールを実行
    const observation = await this.executeAction(action);
    logger.info("Action executed", { observation });
    
    // 観察結果を記録し、状態を更新
    this.sessionState.lastObservation = observation;
    this.sessionState.state = ReactionState.OBSERVING;
    
    return {
      isDone: false,
      currentState: this.sessionState
    };
  }
  
  private async executeObservingStep(): Promise<StepResult> {
    logger.info("Observing step", { sessionId: this.sessionId });
    // 前のステップの思考、行動、観察を記録
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
    
    // セッション状態を更新
    this.updateSessionState(thinking, JSON.stringify(action, null, 2), observation);
    
    // サイクルカウントを増やす
    this.sessionState.cycleCount++;
    
    // 次のサイクルの思考ステップへ
    this.sessionState.state = ReactionState.THINKING;
    
    // 一時データをクリア
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
    // 最終回答を生成するためのプロンプトを作成
    const finalAnswerPrompt = this.prompt.createReactFinalAnswerPrompt(
      this.sessionState.context,
      this.sessionState.history
    );
    
    try {
      // 最終回答を生成
      const finalAnswerResponse = await this.bedrockService.converse(finalAnswerPrompt);
      const finalAnswer = finalAnswerResponse || "分析が完了しましたが、結果を生成できませんでした。";
      logger.info("Completing step - final answer", { finalAnswer: finalAnswer });
      
      // 最終回答を記録
      this.sessionState.finalAnswer = finalAnswer;
      this.sessionState.state = ReactionState.COMPLETED;
      
      return {
        isDone: true,
        finalAnswer
      };
    } catch (error) {
      // スロットリングエラーの場合は、エラーメッセージを返す
      if (error instanceof BedrockThrottlingError) {
        logger.warn("Bedrock API throttled during completing step", { error });
        
        const throttlingMessage = "Bedrockのレート制限に達したため、最終回答の生成に失敗しました。これまでに収集した情報に基づいて、簡易的な回答を生成します。";
        
        // 簡易的な最終回答を生成
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
        
        // 最終回答を記録
        this.sessionState.finalAnswer = simpleFinalAnswer;
        this.sessionState.state = ReactionState.COMPLETED;
        
        return {
          isDone: true,
          finalAnswer: simpleFinalAnswer
        };
      }
      
      // その他のエラーの場合は再スロー
      throw error;
    }
  }
  
  /**
   * 収集済みデータの概要を生成する
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
   * 一定回数のサイクル後に最終回答を強制的に生成するかどうかを判断する
   */
  private shouldForceCompletion(): boolean {
    // 5回以上のサイクルを実行した場合
    if (this.sessionState.cycleCount >= 5) {
      // データ収集状況を確認
      const dataCollectionStatus = this.sessionState.dataCollectionStatus;
      const collectedDataCount = Object.values(dataCollectionStatus).filter(Boolean).length;
      
      // 少なくとも1つのデータが収集されている場合は強制的に完了
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
      // スロットリングエラーの場合は、エラーメッセージを返す
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
      
      // その他のエラーの場合は再スロー
      throw error;
    }
  }
  
  private decideAction(thinking: string): ToolAction | null {
    // 行動部分を抽出
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
      
      // ツールを実行
      const result = await this.toolRegistry.executeTool(toolName, parameters);
      
      // データ収集状況を更新
      this.updateDataCollectionStatus(toolName, result);
      
      // ツール実行記録を追加
      this.recordToolExecution(toolName, parameters, result);
      
      return result;
    } catch (error) {
      logger.error("Failed to execute tool", { error, action });
      return `ツールの実行中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  
  /**
   * ツール名と実行結果に基づいてデータ収集状況を更新する
   */
  private updateDataCollectionStatus(toolName: string, result: string): void {
    // ツール名に基づいてステータスを更新
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
   * ツール実行記録を追加する
   */
  private recordToolExecution(toolName: string, parameters: Record<string, unknown>, result: string): void {
    // ツール実行記録を作成
    const toolExecution: ToolExecutionRecord = {
      toolName,
      parameters,
      result,
      timestamp: Date.now(),
      dataAvailable: this.checkDataAvailability(toolName, result)
    };
    
    // 記録を追加
    this.sessionState.toolExecutions.push(toolExecution);
  }
  
  /**
   * ツール名と実行結果に基づいてデータの有無を判定する
   */
  private checkDataAvailability(toolName: string, result: string): boolean {
    // ツール名に基づいてデータの有無を判定
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
  
  getSessionState(): ReactSessionState {
    return this.sessionState;
  }
}
