import { Handler } from "aws-lambda";
import { getSecret } from "@aws-lambda-powertools/parameters/secrets";
import { split } from "lodash";
import { Prompt } from "../../lib/prompt.js";
import { Language } from "../../../parameter.js";
import { logger } from "../../lib/logger.js"; 
import { convertMDToPDF } from "../../lib/puppeteer.js";
import { SlackMessageClient } from "../../lib/messaging/platforms/slack/slack-message-client.js";
import { SlackDestination } from "../../lib/messaging/platforms/slack/slack-destination.js";
import { I18nProvider } from "../../lib/messaging/providers/i18n-provider.js";
import { ConfigProvider } from "../../lib/messaging/providers/config-provider.js";
import { AWSServiceFactory } from "../../lib/aws/aws-service-factory.js";
import { ConfigurationService } from "../../lib/configuration-service.js";

// Initialize configuration service
const configService = ConfigurationService.getInstance();
const slackAppTokenKey = configService.getSlackAppTokenKey();
const token = await getSecret(slackAppTokenKey);

export const handler: Handler = async (event: {
  channelId: string;
}) => {
  // Event parameters
  logger.info("Request started", event);
  const { channelId } = event;
  
  // Get configuration from configuration service
  const modelId = configService.getModelId();
  const lang: Language = configService.getLanguage() as Language;
  const architectureDescription = configService.getArchitectureDescription();
  const region = configService.getRegion();
  const detectorId = configService.getDetectorId() || "";
  
  const i18n = new I18nProvider(lang);
  const config = new ConfigProvider();
  const messageClient = new SlackMessageClient(token!.toString(), i18n, logger, config);
  const prompt = new Prompt(lang, architectureDescription);
  const destination = new SlackDestination(channelId);

  // Check required variables.
  if (!modelId || !region || !channelId ) {
    logger.error(`Not found any environment variables. Please check them.`);
    if (channelId) {
      messageClient.sendMessage(
        i18n.translate("errorMessage"),
        destination,
      );
    }
    return;
  }

  try {
    // Get findings from Security Hub, GuardDuty, and AWS Health.
    const guardDutyService = AWSServiceFactory.getGuardDutyService();
    const securityHubService = AWSServiceFactory.getSecurityHubService();
    
    // Get findings sequentially
    const guardDutyResult = await guardDutyService.listFindings(detectorId);
    const securityHubResult = await securityHubService.listFindings();
    
    // Build prompt
    const findingsReportPrompt = 
        prompt.createFindingsReportPrompt(
            JSON.stringify(securityHubResult),
            JSON.stringify(guardDutyResult)
        );

    // Summarize and make report by inference
    const bedrockService = AWSServiceFactory.getBedrockService();
    const res = await bedrockService.converse(findingsReportPrompt);
    const report = split(split(res, '<outputReport>')[1], '</outputReport>')[0];
    logger.info(`report: ${report}`)
    if(!report) throw new Error("No response from LLM");

    const pdf = await convertMDToPDF(report);
    const destination = new SlackDestination(channelId);
    await messageClient.sendFile(pdf, "findings-report.pdf", destination);

  } catch (error) {
    logger.error(`${JSON.stringify(error)}`);
    // Send the form to retry when error was occured.
    await messageClient.sendMessage(
      messageClient.createErrorMessageBlock(),
      destination
    );
  }
  
  return;
}
