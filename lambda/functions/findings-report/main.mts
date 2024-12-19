import { Handler } from "aws-lambda";
import pLimit from "p-limit";
import { split, random } from "lodash";
import { converse, uploadFileAndGetUrl, listGuardDutyFindings, listSecurityHubFindings } from "../../lib/aws-modules.js";
import { Prompt } from "../../lib/prompts.js";
import { MessageClient } from "../../lib/message-client.js";
import { Language } from "../../../parameter.js";
import logger from "../../lib/logger.js"; 
import { convertMDToPDF } from "../../lib/puppeteer.js";

export const handler: Handler = async () => {
  // Event parameters
  logger.info("Request started");

  // Environment variables
  const modelId = process.env.MODEL_ID;
  const lang: Language = process.env.LANG
    ? (process.env.LANG as Language)
    : "en";
  const architectureDescription = process.env.ARCHITECTURE_DESCRIPTION!;
  const region = process.env.AWS_REGION;
  const detectorId = process.env.DETECTOR_ID;
  const topicArn = process.env.TOPIC_ARN;
  const outputBucket = process.env.OUTPUT_BUCKET;

  const messageClient = new MessageClient(topicArn!.toString(), lang);
  const prompt = new Prompt(lang, architectureDescription);

  // Check required variables.
  if (!modelId || !region || !detectorId || !outputBucket) {
    logger.error(`Not found any environment variables. Please check them.`);
    await messageClient.sendMessage(messageClient.createErrorMessage());
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
    const signedUrl = await uploadFileAndGetUrl(outputBucket, `findings-reports/report-${(new Date()).toISOString()}-${random(10000000, 99999999)}.pdf`, pdf)
    
    await messageClient.sendMessage(messageClient.createFindingsReportMessage(signedUrl));

  } catch (error) {
    logger.error("Something happened", error as Error);
    // Send the form to retry when error was occured.
    await messageClient.sendMessage(messageClient.createErrorMessage());
  }
  
  return;
}