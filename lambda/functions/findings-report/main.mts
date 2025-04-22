import { Handler } from "aws-lambda";
import { getSecret } from "@aws-lambda-powertools/parameters/secrets";
import pLimit from "p-limit";
import { split } from "lodash";
import { converse, listGuardDutyFindings, listSecurityHubFindings } from "../../lib/aws-modules.js";
import { Prompt } from "../../lib/prompts.js";
import { MessageClient } from "../../lib/message-client.js";
import { Language } from "../../../parameter.js";
import logger from "../../lib/logger.js"; 
import { convertMDToPDF } from "../../lib/puppeteer.js";

export const handler: Handler = async (event: {
  channelId: string;
}) => {
  // Event parameters
  logger.info("Request started", event);
  const { channelId } = event;

  // Environment variables
  const modelId = process.env.QUALITY_MODEL_ID;
  const lang: Language = process.env.LANG
    ? (process.env.LANG as Language)
    : "en";
  const slackAppTokenKey = process.env.SLACK_APP_TOKEN_KEY!;
  const architectureDescription = process.env.ARCHITECTURE_DESCRIPTION!;
  const region = process.env.AWS_REGION;
  const detectorId = process.env.DETECTOR_ID!;
  const token = await getSecret(slackAppTokenKey);
  const messageClient = new MessageClient(token!.toString(), lang);
  const prompt = new Prompt(lang, architectureDescription);

  // Check required variables.
  if (!modelId || !region || !channelId ) {
    logger.error(`Not found any environment variables. Please check them.`);
    if (channelId) {
      messageClient.sendMessage(
        lang && lang === "ja"
          ? "エラーが発生しました: 環境変数が設定されていない、または渡されていない可能性があります。"
          : "Error: Not found any environment variables.",
        channelId,
      );
    }
    return;
  }

  try {
    // Get findings from Security Hub, GuardDuty, and AWS Health.
    const limit = pLimit(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const input: Promise<any>[] = [
        limit(() => listGuardDutyFindings(detectorId, "GuardDutyFindings")),
        limit(() => listSecurityHubFindings("SecHubFindings"))
    ]
    const results = await Promise.all(input);
    
    // Build prompt
    const findingsReportPrompt = 
        prompt.createFindingsReportPrompt(
            Prompt.getStringValueFromQueryResult(results, "SecHubFindings"),
            Prompt.getStringValueFromQueryResult(results, "GuardDutyFindings")
        );

    // Summarize and make report by inference
    const res = await converse(findingsReportPrompt);
    const report = split(split(res, '<outputReport>')[1], '</outputReport>')[0];
    logger.info(`report: ${report}`)
    if(!report) throw new Error("No response from LLM");

    const pdf = await convertMDToPDF(report);
    await messageClient.sendFile(pdf, "findings-report.pdf", channelId)
  } catch (error) {
    logger.error(`${JSON.stringify(error)}`);
    // Send the form to retry when error was occured.
    if(channelId){
      await messageClient.sendMessage(
        messageClient.createErrorMessageBlock(),
        channelId
      );
    }
  }
  
  return;
}