import { Handler } from "aws-lambda";
import { getSecret } from "@aws-lambda-powertools/parameters/secrets";
import { v4 as uuidv4 } from "uuid";
import { Prompt } from "../../lib/prompt.js";
import { MessageClient } from "../../lib/messaging/message-client.js";
import { Language, devParameter } from "../../../parameter.js";
import { logger } from "../../lib/logger.js"; 
import { ReActAgent, SessionState, StepResult } from "../../lib/react-agent.js";
import { ToolRegistry } from "../../lib/tools-registry.js";
import { registerAllTools } from "../../lib/tool-executors/index.js";
import { getSessionState, saveSessionState, completeSession } from "../../lib/session-manager.js";
import { AWSServiceFactory } from "../../lib/aws/aws-service-factory.js";
import { I18nProvider } from "../../lib/messaging/providers/i18n-provider.js";
import { GenericTemplateProvider } from "../../lib/messaging/templates/generic-template-provider.js";
import { ConfigProvider } from "../../lib/messaging/providers/config-provider.js";
import { MessageBlock } from "../../lib/messaging/interfaces/template-provider.interface.js";
import { SlackTemplateConverter } from "../../lib/messaging/platforms/slack/slack-template-converter.js";

const slackAppTokenKey = process.env.SLACK_APP_TOKEN_KEY!;
const token = await getSecret(slackAppTokenKey);

/**
 * 進捗状況メッセージを構築する関数
 * @param i18n I18nProviderのインスタンス
 * @param stepResult ReActAgentの実行結果
 * @param currentState ReActAgentの現在の状態
 * @returns 構築されたメッセージブロック
 */
function buildProgressMessage(
  i18n: I18nProvider,
  stepResult: StepResult,
  currentState: SessionState
): MessageBlock[] {
  const templateProvider = new GenericTemplateProvider(i18n, new ConfigProvider());
  
  // 進捗状況のメッセージを構築
  return templateProvider.createProgressMessageTemplate(
    currentState.state,
    undefined,
    currentState
  ).blocks;
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
  
  // パラメータからmaxAgentCyclesを取得（デフォルト値は5）
  const maxAgentCycles = devParameter.maxAgentCycles ?? 5;

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
    
    // ReActAgentの初期化
    const reactAgent = new ReActAgent(
      sessionId,
      errorDescription,
      toolRegistry,
      prompt,
      { maxAgentCycles }
    );
    
    // セッション状態の取得（新規セッションの場合はnull）
    const sessionState = await getSessionState(sessionId);
    
    // 新規セッションの場合
    if (!sessionState) {
      // 初期プロンプトを送信
      const initialPrompt = prompt.createReactInitialPrompt(
        errorDescription,
        toolRegistry.getToolDescriptions()
      );

      // 初期思考を取得
      const bedrockService = AWSServiceFactory.getBedrockService();
      const initialThinking = await bedrockService.converse(initialPrompt, modelId);

      // ReActAgentの初期化
      reactAgent.initializeWithThinking(initialThinking || "");
      
      // 進捗状況をSlackに送信
      const templateProvider = new GenericTemplateProvider(i18n, new ConfigProvider());
      const startBlocks = templateProvider.createMessageTemplate(
        i18n.translate("analysisStartMessage")
      ).blocks;
      
      // MessageBlock[]をKnownBlock[]に変換
      const templateConverter = new SlackTemplateConverter();
      const knownBlocks = templateConverter.convertMessageTemplate({ blocks: startBlocks });
      
      await messageClient.sendMessage(
        knownBlocks,
        channelId, 
        threadTs
      );
    } else {
      // 既存のセッション状態をReActAgentに設定
      reactAgent.setSessionState(sessionState);
    }
    
    // 1ステップ実行（Lambda実行時間を考慮）
    const stepResult = await reactAgent.executeStep();
    
    // セッション状態の保存
    await saveSessionState(sessionId, reactAgent.getSessionState());
    
    if (stepResult.isDone) {
      // 最終回答をSlackに送信
      const finalAnswer = stepResult.finalAnswer || "分析が完了しましたが、結果を生成できませんでした。";
      
      // マークダウン形式のテキストをリッチテキストに変換
      await messageClient.sendMarkdownSnippet(
        "analysis_result.md",
        finalAnswer,
        channelId!,
        threadTs
      );
      
      // セッション完了の処理
      await completeSession(sessionId);
      
      // 分析完了メッセージ
      const templateProvider = new GenericTemplateProvider(i18n, new ConfigProvider());
      const completeBlocks = templateProvider.createMessageTemplate(
        i18n.translate("analysisCompleteMessage")
      ).blocks;
      
      // MessageBlock[]をKnownBlock[]に変換
      const templateConverter = new SlackTemplateConverter();
      const knownBlocks = templateConverter.convertMessageTemplate({ blocks: completeBlocks });
      
      await messageClient.sendMessage(
        knownBlocks,
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
      // 現在のReActAgentの状態を取得
      const currentState = reactAgent.getSessionState();
      
      // 次のアクションに応じて異なるメッセージを構築
      const progressBlocks = buildProgressMessage(i18n, stepResult, currentState);
      
      // MessageBlock[]をKnownBlock[]に変換
      const templateConverter = new SlackTemplateConverter();
      const knownBlocks = templateConverter.convertMessageTemplate({ blocks: progressBlocks });
      
      await messageClient.sendMessage(
        knownBlocks,
        channelId!,
        threadTs
      );
    }
  } catch (error) {
    logger.error("Something happened", error as Error);
    // エラー時のフォームを送信
    if(channelId && threadTs){
      // エラーメッセージを送信
      await messageClient.sendMessage(
        messageClient.createErrorMessageBlock(),
        channelId, 
        threadTs
      );
      
      // リトライ案内メッセージを送信
      const templateProvider = new GenericTemplateProvider(i18n, new ConfigProvider());
      const errorBlocks = templateProvider.createMessageTemplate(
        i18n.translate("analysisErrorMessage")
      ).blocks;
      
      // MessageBlock[]をKnownBlock[]に変換
      const templateConverter = new SlackTemplateConverter();
      const knownBlocks = templateConverter.convertMessageTemplate({ blocks: errorBlocks });
      
      await messageClient.sendMessage(
        knownBlocks,
        channelId, 
        threadTs
      );
    }
  }
  return;
};
