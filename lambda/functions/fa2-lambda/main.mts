import { Handler } from "aws-lambda";
import { getSecret } from "@aws-lambda-powertools/parameters/secrets";
import { v4 as uuidv4 } from "uuid";
import { Prompt } from "../../lib/prompt.js";
import { MessageClient } from "../../lib/messaging/message-client.js";
import { Language } from "../../../parameter.js";
import { logger } from "../../lib/logger.js"; 
import { ReActAgent } from "../../lib/react-agent.js";
import { ToolRegistry } from "../../lib/tools-registry.js";
import { registerAllTools } from "../../lib/tool-executors/index.js";
import { getSessionState, saveSessionState, completeSession } from "../../lib/session-manager.js";
import { AWSServiceFactory } from "../../lib/aws/aws-service-factory.js";
import { I18nProvider } from "../../lib/messaging/providers/i18n-provider.js";
import { setI18nProvider } from "../../lib/messaging/providers/i18n-factory.js";
import { GenericTemplateProvider } from "../../lib/messaging/templates/generic-template-provider.js";
import { ConfigProvider } from "../../lib/messaging/providers/config-provider.js";
import { SlackTemplateConverter } from "../../lib/messaging/platforms/slack/slack-template-converter.js";
import { ConfigurationService } from "../../lib/configuration-service.js";

// Initialize configuration service
const configService = ConfigurationService.getInstance();

// 初期化状態を確認
const { isInitialized, error } = ConfigurationService.getInitializationStatus();
if (!isInitialized) {
  logger.error("ConfigurationService initialization failed", { error });
}

// グローバル変数の初期化（条件付き）
// 初期化に成功した場合のみ、他のグローバル変数を初期化
let slackAppTokenKey: string;
let token: string | undefined;
let lang: Language;
let i18n: I18nProvider;
let messageClient: MessageClient;
let templateProvider: GenericTemplateProvider;
let templateConverter: SlackTemplateConverter;

if (isInitialized) {
  try {
    slackAppTokenKey = configService.getSlackAppTokenKey();
    token = await getSecret(slackAppTokenKey);
    lang = configService.getLanguage() as Language;
    i18n = new I18nProvider(lang);
    
    // Set i18n instance to factory for singleton usage
    setI18nProvider(i18n);
    
    messageClient = new MessageClient(token!.toString(), lang);
    templateProvider = new GenericTemplateProvider(i18n, new ConfigProvider());
    templateConverter = new SlackTemplateConverter();
  } catch (error) {
    logger.error("Failed to initialize global resources", { error });
    // ここでは例外をスローせず、ログに記録するだけ
  }
}

export const handler: Handler = async (event: {
  errorDescription: string;
  startDate: string;
  endDate: string;
  channelId?: string;
  threadTs?: string;
  sessionId?: string; 
}) => {
  // 初期化状態を確認
  if (!isInitialized) {
    logger.error("Handler execution failed due to configuration error", { error });
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal server error due to configuration issues"
      })
    };
  }
  
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

  try {
    // Generate or get session ID
    const sessionId = eventSessionId || uuidv4();
    
    // Initialize prompt
    const architectureDescription = configService.getArchitectureDescription();
    const prompt = new Prompt(lang, architectureDescription);
    
    // Initialize tool registry
    const toolRegistry = new ToolRegistry();
    registerAllTools(
      toolRegistry, 
      {
        startDate,
        endDate
      },
      i18n, // Pass i18n instance to registerAllTools
      configService // Pass configService to registerAllTools
    );
    
    // Initialize ReActAgent
    const reactAgent = new ReActAgent(
      sessionId,
      errorDescription,
      toolRegistry,
      prompt,
      { maxAgentCycles: configService.getMaxAgentCycles() }
    );
    
    // Get session state (null for new session)
    const sessionState = await getSessionState(sessionId, configService);
    
    // For new session
    if (!sessionState) {
      // Send progress to Slack
      const startBlocks = templateProvider.createMessageTemplate(
        i18n.translate("analysisStartMessage")
      ).blocks;
      
      // Convert MessageBlock[] to KnownBlock[]
      const knownBlocks = templateConverter.convertMessageTemplate({ blocks: startBlocks });
      
      await messageClient.sendMessage(
        knownBlocks,
        channelId!, 
        threadTs!
      );
    } else {
      // Set existing session state to ReActAgent
      reactAgent.setSessionState(sessionState);
    }
    
    // Execute one step (considering Lambda execution time)
    const stepResult = await reactAgent.executeStep();
    
    // Save session state
    await saveSessionState(sessionId, reactAgent.getSessionState(), configService);
    
    if (stepResult.isDone) {
      // Send final answer to Slack
      const finalAnswer = stepResult.finalAnswer || "分析が完了しましたが、結果を生成できませんでした。";
      
      // Convert markdown text to rich text
      await messageClient.sendMarkdownSnippet(
        "analysis_result.md",
        finalAnswer,
        channelId!,
        threadTs!
      );
      
      // Process session completion
      await completeSession(sessionId, configService);
      
      // Analysis complete message
      const completeBlocks = templateProvider.createMessageTemplate(
        i18n.translate("analysisCompleteMessage")
      ).blocks;
      
      // Convert MessageBlock[] to KnownBlock[]
      const knownBlocks = templateConverter.convertMessageTemplate({ blocks: completeBlocks });
      
      await messageClient.sendMessage(
        knownBlocks,
        channelId!, 
        threadTs!
      );
    } else {
      // Call Lambda again to execute next step
      const lambdaFunctionName = configService.getLambdaFunctionName()!;
      const payload = JSON.stringify({
        errorDescription,
        startDate,
        endDate,
        channelId,
        threadTs,
        sessionId
      });
      
      // Invoke Lambda asynchronously
      const lambdaService = AWSServiceFactory.getLambdaService();
      lambdaService.invokeAsyncLambdaFunc(payload, lambdaFunctionName);
      
      // Send progress to Slack
      // Get current state of ReActAgent
      const currentState = reactAgent.getSessionState();
      
      // Build different messages according to next action
      const progressBlocks = templateProvider.createProgressMessageTemplate(
        currentState.state,
        currentState
      ).blocks;
      
      // Convert MessageBlock[] to KnownBlock[]
      const knownBlocks = templateConverter.convertMessageTemplate({ blocks: progressBlocks });
      
      await messageClient.sendMessage(
        knownBlocks,
        channelId!,
        threadTs!
      );
    }
  } catch (error) {
    logger.error("Something happened", error as Error);
    // Send form on error
    if(channelId && threadTs){
      // Send error message
      await messageClient.sendMessage(
        messageClient.createErrorMessageBlock(),
        channelId, 
        threadTs
      );
      
      // Send retry guidance message
      const errorBlocks = templateProvider.createMessageTemplate(
        i18n.translate("analysisErrorMessage")
      ).blocks;
      
      // Convert MessageBlock[] to KnownBlock[]
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
