import { Handler } from "aws-lambda";
import { getSecret } from "@aws-lambda-powertools/parameters/secrets";
import { v4 as uuidv4 } from "uuid";
import { Prompt } from "../../lib/prompt.js";
import { MessageClient } from "../../lib/messaging/message-client.js";
import { Language, devParameter } from "../../../parameter.js";
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

const slackAppTokenKey = process.env.SLACK_APP_TOKEN_KEY!;
const token = await getSecret(slackAppTokenKey);
const lang: Language = process.env.LANG
  ? (process.env.LANG as Language)
  : "en";
const i18n = new I18nProvider(lang);

// Set i18n instance to factory for singleton usage
setI18nProvider(i18n);

const messageClient = new MessageClient(token!.toString(), lang);
const templateProvider = new GenericTemplateProvider(i18n, new ConfigProvider());
const templateConverter = new SlackTemplateConverter();

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

  const architectureDescription = process.env.ARCHITECTURE_DESCRIPTION!;
  const cwLogsQuery = process.env.CW_LOGS_INSIGHT_QUERY!;
  const logGroups = (
    JSON.parse(process.env.CW_LOGS_LOGGROUPS!) as { loggroups: string[] }
  ).loggroups;
  const region = process.env.AWS_REGION;
  
  // Get maxAgentCycles from parameters (default value is 5)
  const maxAgentCycles = devParameter.maxAgentCycles ?? 5;
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
    // Generate or get session ID
    const sessionId = eventSessionId || uuidv4();
    
    // Initialize tool registry
    const toolRegistry = new ToolRegistry();
    registerAllTools(
      toolRegistry, 
      {
        startDate,
        endDate
      },
      i18n // Pass i18n instance to registerAllTools
    );
    
    // Initialize ReActAgent
    const reactAgent = new ReActAgent(
      sessionId,
      errorDescription,
      toolRegistry,
      prompt,
      { maxAgentCycles }
    );
    
    // Get session state (null for new session)
    const sessionState = await getSessionState(sessionId);
    
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
        channelId, 
        threadTs
      );
    } else {
      // Set existing session state to ReActAgent
      reactAgent.setSessionState(sessionState);
    }
    
    // Execute one step (considering Lambda execution time)
    const stepResult = await reactAgent.executeStep();
    
    // Save session state
    await saveSessionState(sessionId, reactAgent.getSessionState());
    
    if (stepResult.isDone) {
      // Send final answer to Slack
      const finalAnswer = stepResult.finalAnswer || "分析が完了しましたが、結果を生成できませんでした。";
      
      // Convert markdown text to rich text
      await messageClient.sendMarkdownSnippet(
        "analysis_result.md",
        finalAnswer,
        channelId!,
        threadTs
      );
      
      // Process session completion
      await completeSession(sessionId);
      
      // Analysis complete message
      const completeBlocks = templateProvider.createMessageTemplate(
        i18n.translate("analysisCompleteMessage")
      ).blocks;
      
      // Convert MessageBlock[] to KnownBlock[]
      const knownBlocks = templateConverter.convertMessageTemplate({ blocks: completeBlocks });
      
      await messageClient.sendMessage(
        knownBlocks,
        channelId!, 
        threadTs
      );
    } else {
      // Call Lambda again to execute next step
      const lambdaFunctionName = process.env.AWS_LAMBDA_FUNCTION_NAME!;
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
        threadTs
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
