import { Handler } from "aws-lambda";
import { getSecret } from "@aws-lambda-powertools/parameters/secrets";
import { Language } from "../../../parameter.js";
import { logger } from "../../lib/logger.js"; 
import { SlackMessageClient } from "../../lib/messaging/platforms/slack/slack-message-client.js";
import { SlackDestination } from "../../lib/messaging/platforms/slack/slack-destination.js";
import { I18nProvider } from "../../lib/messaging/providers/i18n-provider.js";
import { ConfigProvider } from "../../lib/messaging/providers/config-provider.js";
import { AWSServiceFactory } from "../../lib/aws/aws-service-factory.js";
import { MetricDataQuery } from "@aws-sdk/client-cloudwatch";
import { Prompt } from "../../lib/prompt.js";

/**
 * Function to infer AWS namespaces from a query
 * @param query User's query
 * @param bedrockService BedrockService
 * @param prompt Prompt instance
 * @returns Array of inferred namespaces
 */
async function inferNamespacesFromQuery(
  query: string, 
  bedrockService: { converse: (prompt: string) => Promise<string> }, 
  prompt: Prompt
): Promise<string[]> {
  // Default namespaces
  const defaultNamespaces = ["AWS/EC2", "AWS/ECS", "AWS/RDS", "AWS/Lambda", "AWS/ApplicationELB"];
  
  try {
    // Infer namespaces using BedrockService
    const promptText = prompt.createNamespaceInferencePrompt(query);
    const response = await bedrockService.converse(promptText);
    
    // Parse response as JSON
    try {
      const namespaces = JSON.parse(response);
      
      // Verify it's an array
      if (Array.isArray(namespaces) && namespaces.length > 0) {
        logger.info("Inferred namespaces from query", { namespaces });
        return namespaces;
      }
    } catch (parseError) {
      logger.error("Failed to parse namespace inference response", { error: parseError, response });
    }
  } catch (error) {
    logger.error("Error inferring namespaces from query", { error });
  }
  
  // Return default namespaces if an error occurs or the response is invalid
  logger.info("Using default namespaces", { defaultNamespaces });
  return defaultNamespaces;
}

export const handler: Handler = async (event: {
  query: string;
  startDate: string;
  endDate: string;
  channelId?: string;
}) => {
  // Event parameters
  logger.info("Request started", event);
  const {
    query,
    startDate,
    endDate,
    channelId
  } = event;

  // Environment variables
  const modelId = process.env.MODEL_ID;
  const lang: Language = process.env.LANG
    ? (process.env.LANG as Language)
    : "en";
  const slackAppTokenKey = process.env.SLACK_APP_TOKEN_KEY!;
  const region = process.env.AWS_REGION;
  const token = await getSecret(slackAppTokenKey);
  const i18n = new I18nProvider(lang);
  const config = new ConfigProvider();
  const messageClient = new SlackMessageClient(token!.toString(), i18n, logger, config);
  const destination = channelId ? new SlackDestination(channelId) : undefined;
  const prompt = new Prompt(lang, "AWS CloudWatch Metrics Analysis");

  // Check required variables.
  if (!modelId || !region || !channelId ) {
    logger.error(`Not found any environment variables. Please check them.`, {environments: {modelId, region, channelId}});
    if (channelId && destination) {
      messageClient.sendMessage(
        i18n.translate("errorMessage"),
        destination,
      );
    }
    return;
  }

  try {
    // Initialize services
    const cloudWatchService = AWSServiceFactory.getCloudWatchService();
    const bedrockService = AWSServiceFactory.getBedrockService();
    
    // Infer namespaces from query
    const namespaces = await inferNamespacesFromQuery(query, bedrockService, prompt);
    
    // Get metrics from inferred namespaces
    const allMetrics = [];
    for (const namespace of namespaces) {
      try {
        const nsMetrics = await cloudWatchService.listMetrics(namespace);
        allMetrics.push(...nsMetrics);
        logger.info(`Retrieved ${nsMetrics.length} metrics from namespace ${namespace}`);
      } catch (error) {
        logger.warn(`Failed to retrieve metrics from namespace ${namespace}`, { error });
      }
    }
    
    // Fallback if no metrics were retrieved
    if (allMetrics.length === 0) {
      const fallbackNamespaces = ["AWS/EC2", "AWS/ECS", "AWS/RDS", "AWS/Lambda"];
      logger.info("No metrics found, trying fallback namespaces", { fallbackNamespaces });
      
      for (const namespace of fallbackNamespaces) {
        try {
          const nsMetrics = await cloudWatchService.listMetrics(namespace);
          allMetrics.push(...nsMetrics);
          logger.info(`Retrieved ${nsMetrics.length} metrics from fallback namespace ${namespace}`);
        } catch (error) {
          logger.warn(`Failed to retrieve metrics from fallback namespace ${namespace}`, { error });
        }
      }
    }
    
    // Create prompt for metric selection
    const durationInDays = ((new Date(endDate)).getTime() - (new Date(startDate)).getTime()) / (1000 * 60 * 60 * 24);
    const metricSelectionPromptText = prompt.createMetricSelectionPrompt(query, JSON.stringify(allMetrics), durationInDays);
    
    // Generate metric data query
    logger.info("Generating metric data query");
    const metricDataQueryResponse = await bedrockService.converse(metricSelectionPromptText);
    
    // Extract JSON from <Query> tag
    let metricDataQuery: MetricDataQuery[];
    try {
      // Extract content within <Query> tag
      const queryTagRegex = /<Query>([\s\S]*?)<\/Query>/;
      const match = metricDataQueryResponse.match(queryTagRegex);
      
      if (!match || !match[1]) {
        logger.error("Failed to extract query from response", { response: metricDataQueryResponse });
        throw new Error("Query tag not found in response");
      }
      
      // Parse the extracted JSON
      const jsonContent = match[1].trim();
      metricDataQuery = JSON.parse(jsonContent);
      logger.info("Generated metric data query", { metricDataQuery });
    } catch (error) {
      logger.error("Failed to parse metric data query response", { error, response: metricDataQueryResponse });
      throw new Error("Invalid metric data query format");
    }
    
    // Get CloudWatch metrics
    logger.info("Querying CloudWatch metrics", { startDate, endDate });
    const results = await cloudWatchService.queryMetrics(startDate, endDate, metricDataQuery, "CWMetrics");
    
    // Create prompt for generating insights
    const metricsInsightPromptText = prompt.createMetricsInsightPrompt(query, JSON.stringify(results));
    logger.info("Created metrics insight prompt");
    
    // Generate insights
    const answer = await bedrockService.converse(metricsInsightPromptText);
    if(!answer) throw new Error("No response from LLM");

    logger.info("Answer", answer);

    if (destination) {
      // Always send as a markdown file
      await messageClient.sendMarkdownContent("metrics-insight.md", answer, destination);
    }
  } catch (error) {
    logger.error("Something happened", error as Error);
    // Send the form to retry when an error has occurred.
    if(channelId && destination){
      await messageClient.sendMessage(
        messageClient.createErrorMessageBlock(),
        destination
      );
    }
  }
  
  return;
}
