import { Handler } from "aws-lambda";
import { getSecret } from "@aws-lambda-powertools/parameters/secrets";
import { v4 as uuidv4 } from "uuid";
import { Prompt } from "../../lib/prompt.js";
import { MessageClient } from "../../lib/messaging/message-client.js";
import { Language } from "../../../parameter.js";
import { logger } from "../../lib/logger.js"; 
import { ReactEngine, ReactionState } from "../../lib/react-engine.js";
import { ToolRegistry } from "../../lib/tools-registry.js";
import { registerAllTools } from "../tool-executors/index.js";
import { getSessionState, saveSessionState, completeSession } from "../../lib/session-manager.js";
import { AWSServiceFactory } from "../../lib/aws/aws-service-factory.js";
import { I18nProvider } from "../../lib/messaging/providers/i18n-provider.js";


export const handler: Handler = async (event: {
  errorDescription: string;
  startDate: string;
  endDate: string;
  channelId?: string;
  threadTs?: string;
  sessionId?: string; // 新規: セッションID
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

  // 環境変数
  const modelId = process.env.MODEL_ID;
  const lang: Language = process.env.LANG
    ? (process.env.LANG as Language)
    : "en";
  const i18n = new I18nProvider(lang)
  const slackAppTokenKey = process.env.SLACK_APP_TOKEN_KEY!;
  const architectureDescription = process.env.ARCHITECTURE_DESCRIPTION!;
  const cwLogsQuery = process.env.CW_LOGS_INSIGHT_QUERY!;
  const logGroups = (
    JSON.parse(process.env.CW_LOGS_LOGGROUPS!) as { loggroups: string[] }
  ).loggroups;
  const region = process.env.AWS_REGION;

  const token = await getSecret(slackAppTokenKey);
  const messageClient = new MessageClient(token!.toString(), lang);
  const reactPrompt = new Prompt(lang, architectureDescription);

  // 必須パラメータのチェック
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
    
    // ReACTエンジンの初期化
    const reactEngine = new ReactEngine(
      sessionId,
      errorDescription,
      toolRegistry,
      reactPrompt
    );
    
    // セッション状態の取得（新規セッションの場合は初期状態）
    const sessionState = await getSessionState(sessionId);
    
    // 新規セッションの場合
    if (!sessionState) {
      // 初期プロンプトを送信
      const initialPrompt = reactPrompt.createReactInitialPrompt(
        errorDescription,
        toolRegistry.getToolDescriptions()
      );
      
      // 初期思考を取得
      const bedrockService = AWSServiceFactory.getBedrockService();
      const initialThinking = await bedrockService.converse(initialPrompt, modelId);
      
      // ReACTエンジンの初期化
      reactEngine.initializeWithThinking(initialThinking || "");
      
      // セッション状態の保存
      await saveSessionState(sessionId, reactEngine.getSessionState());
      
      // 進捗状況をSlackに送信
      await messageClient.sendMessage(
        messageClient.createMessageBlock(
          i18n.translate("analysisStartMessage"),
        ),
        channelId, 
        threadTs
      );
    } else {
      // 既存のセッション状態をReACTエンジンに設定
      reactEngine.setSessionState(sessionState);
    }
    
    // 1ステップ実行（Lambda実行時間を考慮）
    const stepResult = await reactEngine.executeStep();
    
    // セッション状態の保存
    await saveSessionState(sessionId, reactEngine.getSessionState());
    
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
      await messageClient.sendMessage(
        messageClient.createMessageBlock(
          `${stepResult.currentState?.state ===  ReactionState.ACTING ? stepResult.currentState?.lastThinking!.match(/<Thought>([\s\S]*?)<\/Thought>/)![1] : ""}
${i18n.translate("analysisStepMessage")} ${stepResult.currentState?.history.length} - ${stepResult.currentState?.state.toUpperCase()})
          ` 
        ),
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
