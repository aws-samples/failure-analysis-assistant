import { Handler } from "aws-lambda";
import { getSecret } from "@aws-lambda-powertools/parameters/secrets";
import { v4 as uuidv4 } from "uuid";
import { Prompt } from "../../lib/prompt.js";
import { MessageClient } from "../../lib/messaging/message-client.js";
import { Language } from "../../../parameter.js";
import { logger } from "../../lib/logger.js"; 
import { Orchestrator } from "../../lib/orchestrator.js";
import { ToolRegistry } from "../../lib/tools-registry.js";
import { registerAllTools } from "../tool-executors/index.js";
import { getSessionState, saveSessionState, completeSession } from "../../lib/session-manager.js";
import { AWSServiceFactory } from "../../lib/aws/aws-service-factory.js";
import { I18nProvider } from "../../lib/messaging/providers/i18n-provider.js";
import { OrchestratorState, OrchestratorStepResult } from "../../lib/orchestrator.js";

const slackAppTokenKey = process.env.SLACK_APP_TOKEN_KEY!;
const token = await getSecret(slackAppTokenKey);

/**
 * 進捗状況メッセージを構築する関数
 * @param i18n I18nProviderのインスタンス
 * @param stepResult Orchestratorの実行結果
 * @param currentState Orchestratorの現在の状態
 * @returns 構築されたメッセージ文字列
 */
function buildProgressMessage(
  i18n: I18nProvider,
  stepResult: OrchestratorStepResult,
  currentState: OrchestratorState
): string {
  // 基本的なステータスメッセージ
  let progressMessage = `${i18n.translate("analysisStepMessage")} - ${stepResult.nextAction?.toUpperCase() || "PROCESSING"}`;
  
  // 仮説の生成が終わったタイミングで仮説一覧を送信
  if (stepResult.nextAction === 'select_next_hypothesis' && 
      currentState.hypotheses.length > 0 && 
      currentState.currentHypothesisIndex === -1) {
    
    // 仮説一覧のメッセージを構築
    progressMessage += `\n\n**${i18n.translate("generatedHypothesesTitle")}**:\n`;
    
    // 仮説を信頼度の高い順にソート
    const sortedHypotheses = [...currentState.hypotheses].sort((a, b) => b.confidence - a.confidence);
    
    // 各仮説の情報を追加
    sortedHypotheses.forEach((hypothesis, index) => {
      const confidencePercent = Math.round(hypothesis.confidence * 100);
      progressMessage += `\n${index + 1}. [${i18n.translate("confidenceLabel")}: ${confidencePercent}%] ${hypothesis.description}`;
      if (hypothesis.reasoning) {
        progressMessage += `\n   ${i18n.translate("reasoningLabel")}: ${hypothesis.reasoning}`;
      }
    });
    
    // 仮説検証を開始することを通知
    progressMessage += `\n\n${i18n.translate("startingHypothesisVerification")}`;
  }
  // 仮説検証中の場合、ReActAgentの状態に関する情報を送信
  else if (stepResult.nextAction === 'verify_hypothesis' && currentState.reactSessionState) {
    const reactState = currentState.reactSessionState;
    const currentHypothesis = currentState.hypotheses[currentState.currentHypothesisIndex];
    
    if (currentHypothesis) {
      // 現在検証中の仮説の説明を追加
      progressMessage += `\n\n${i18n.translate("verifyingHypothesis")}: "${currentHypothesis.description}"`;
      
      // ReActAgentの状態に応じたメッセージを追加
      switch (reactState.state) {
        case 'thinking':
          progressMessage += `\n${i18n.translate("thinkingStateMessage")}`;
          // 最新の思考内容があれば追加
          if (reactState.history.length > 0) {
            const latestThinking = reactState.history[reactState.history.length - 1].thinking;
            if (latestThinking) {
              // <Thought>タグ内のテキストを抽出
              const thoughtMatch = latestThinking.match(/<Thought>([\s\S]*?)<\/Thought>/);
              if (thoughtMatch) {
                const thoughtContent = thoughtMatch[1].trim();
                // 思考内容を表示
                progressMessage += `\n${thoughtContent}`;
              }
            }
          }
          break;
        case 'acting':
          progressMessage += `\n${i18n.translate("actingStateMessage")}`;
          // 最新のアクション情報があれば追加
          if (reactState.lastAction) {
            progressMessage += `\n${i18n.translate("executingTool")}: "${reactState.lastAction.tool}"`;
          }
          break;
        case 'observing':
          progressMessage += `\n${i18n.translate("observingStateMessage")}`;
          // 最新の観察結果があれば追加
          if (reactState.lastObservation) {
            const observation = reactState.lastObservation;
            progressMessage += `\n${observation}`;
          }
          break;
        default:
          // その他の状態の場合はデフォルトメッセージ
          break;
      }
    }
  }
  
  return progressMessage;
}

export const handler: Handler = async (event: {
  errorDescription: string;
  startDate: string;
  endDate: string;
  channelId?: string;
  threadTs?: string;
  sessionId?: string; 
}) => {
  // Event parameters
  logger.info("Request started", event);
  const {
    errorDescription,
    startDate,
    endDate,
    channelId,
    threadTs,
    sessionId: eventSessionId
  } = event;

  const modelId = process.env.MODEL_ID;
  const lang: Language = process.env.LANG
    ? (process.env.LANG as Language)
    : "en";
  const i18n = new I18nProvider(lang)
  const architectureDescription = process.env.ARCHITECTURE_DESCRIPTION!;
  const cwLogsQuery = process.env.CW_LOGS_INSIGHT_QUERY!;
  const logGroups = (
    JSON.parse(process.env.CW_LOGS_LOGGROUPS!) as { loggroups: string[] }
  ).loggroups;
  const region = process.env.AWS_REGION;
  const maxHypotheses = process.env.MAX_HYPOTHESES 
    ? parseInt(process.env.MAX_HYPOTHESES, 10) 
    : 5;

  const messageClient = new MessageClient(token!.toString(), lang);
  const prompt = new Prompt(lang, architectureDescription);

  if (!modelId || !cwLogsQuery || !logGroups || !region || !channelId || !threadTs) {
    logger.error(`Not found any environment variables. Please check.`, {environments: {modelId, cwLogsQuery, logGroups, region, channelId, threadTs}});
    if (channelId && threadTs) {
      messageClient.sendMessage(
        i18n.translate("analysisErrorMessage"),
        channelId, 
        threadTs
      );
    }
    return;
  }

  try {
    // セッションIDの生成または取得
    const sessionId = eventSessionId || uuidv4();
    
    // ツールレジストリの初期化
    const toolRegistry = new ToolRegistry();
    registerAllTools(toolRegistry, {
      startDate,
      endDate
    });
    
    // Orchestratorの初期化
    const orchestrator = new Orchestrator(
      sessionId,
      toolRegistry,
      prompt,
      maxHypotheses
    );
    
    // セッション状態の取得（新規セッションの場合はnull）
    const sessionState = await getSessionState(sessionId);
    
    // 新規セッションの場合
    if (!sessionState) {
      // 進捗状況をSlackに送信
      await messageClient.sendMessage(
        messageClient.createMessageBlock(
          i18n.translate("analysisStartMessage"),
        ),
        channelId, 
        threadTs
      );
    } else {
      // 既存のセッション状態をOrchestratorに設定
      orchestrator.setState(sessionState);
    }
    
    // 1ステップ実行（Lambda実行時間を考慮）
    const stepResult = await orchestrator.executeStep(errorDescription);
    
    // セッション状態の保存
    await saveSessionState(sessionId, orchestrator.getState());
    
    if (stepResult.isDone) {
      // 最終回答をSlackに送信
      await messageClient.sendMessage(
        messageClient.createMessageBlock(stepResult.finalAnswer || "分析が完了しましたが、結果を生成できませんでした。"),
        channelId!,
        threadTs
      );
      
      // セッション完了の処理
      await completeSession(sessionId);
      
      // 分析完了メッセージ
      await messageClient.sendMessage(
        messageClient.createMessageBlock(
          i18n.translate("analysisCompleteMessage"),
        ),
        channelId!, 
        threadTs
      );
    } else {
      // 次のステップを実行するためにLambdaを再度呼び出し
      const lambdaFunctionName = process.env.AWS_LAMBDA_FUNCTION_NAME!;
      const payload = JSON.stringify({
        errorDescription,
        startDate,
        endDate,
        channelId,
        threadTs,
        sessionId
      });
      
      // 非同期でLambdaを呼び出し
      const lambdaService = AWSServiceFactory.getLambdaService();
      lambdaService.invokeAsyncLambdaFunc(payload, lambdaFunctionName);
      
      // 進捗状況をSlackに送信
      // 現在のOrchestratorの状態を取得
      const currentState = orchestrator.getState();
      
      // 次のアクションに応じて異なるメッセージを構築
      const progressMessage = buildProgressMessage(i18n, stepResult, currentState);
      
      await messageClient.sendMessage(
        messageClient.createMessageBlock(progressMessage),
        channelId!,
        threadTs
      );
    }
  } catch (error) {
    logger.error("Something happened", error as Error);
    // エラー時のフォームを送信
    if(channelId && threadTs){
      await messageClient.sendMessage(
        messageClient.createErrorMessageBlock(),
        channelId, 
        threadTs
      );
      await messageClient.sendMessage( 
        messageClient.createMessageBlock(
          i18n.translate("analysisErrorMessage")
        ),
        channelId, 
        threadTs
      );
    }
  }
  return;
};
