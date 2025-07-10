import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseCommandInput,
  InferenceConfiguration,
} from "@aws-sdk/client-bedrock-runtime";
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
  RetrieveCommandOutput,
  SearchType
} from "@aws-sdk/client-bedrock-agent-runtime";
import { logger } from "../../logger.js";
import { AWSError, BedrockThrottlingError } from '../errors/aws-error.js';
import { retryWithExponentialBackoff, isThrottlingError } from '../common/retry-utils.js';
import { ConfigurationService } from "../../configuration-service.js";

/**
 * Type for Knowledge Base search results
 */
export interface KBResult {
  index?: number;
  text?: string;
  source?: string;
  score?: number;
}

/**
 * Wrapper class for Bedrock service
 */
export class BedrockService {
  private runtimeClient: BedrockRuntimeClient;
  private agentRuntimeClient: BedrockAgentRuntimeClient;
  private configService: ConfigurationService;
  
  // Fixed value settings
  private readonly DEFAULT_MAX_TOKENS = 8192;
  private readonly DEFAULT_TEMPERATURE = 0.1;
  private readonly DEFAULT_TOP_P = 0.97;
  private readonly DEFAULT_KB_RESULTS = 3;
  
  /**
   * Constructor
   * @param runtimeClient BedrockRuntimeClient 
   * @param agentRuntimeClient BedrockAgentRuntimeClient 
   * @param configService ConfigurationService
   */
  constructor(
    runtimeClient?: BedrockRuntimeClient,
    agentRuntimeClient?: BedrockAgentRuntimeClient,
    configService?: ConfigurationService
  ) {
    this.runtimeClient = runtimeClient || new BedrockRuntimeClient();
    this.agentRuntimeClient = agentRuntimeClient || new BedrockAgentRuntimeClient();
    this.configService = configService || ConfigurationService.getInstance();
  }
  
  /**
   * Converse with Bedrock model
   * @param prompt Prompt
   * @param modelId Model ID (uses configuration service if omitted)
   * @param inferenceConfig Inference configuration
   * @returns Response text from the model
   */
  async converse(
    prompt: string, 
    modelId?: string,
    inferenceConfig: InferenceConfiguration = {
      maxTokens: this.DEFAULT_MAX_TOKENS,
      temperature: this.DEFAULT_TEMPERATURE,
      topP: this.DEFAULT_TOP_P
    }
  ): Promise<string> {
    // Use provided model ID or get from configuration service
    const modelToUse = modelId || this.configService.getModelId();
    
    logger.info("Start", {function: "converse", input: {prompt, modelId: modelToUse, inferenceConfig}});
    
    try {
      const converseCommandInput: ConverseCommandInput = {
        modelId: modelToUse,
        messages: [
          {
            "role": "user",
            "content": [{"text": prompt}]
          }
        ],
        inferenceConfig,
      };
      
      // Retry with exponential backoff
      const converseOutput = await retryWithExponentialBackoff(
        () => this.runtimeClient.send(new ConverseCommand(converseCommandInput))
      );
      
      logger.info("End", {function: "converse", output: {converseOutput}});
      return converseOutput.output?.message?.content![0].text || "";
    } catch (error) {
      logger.error("Error in converse", {error});
      
      // Check if it's a throttling error
      if (isThrottlingError(error)) {
        throw new BedrockThrottlingError(
          'Bedrock API rate limit exceeded. Please try again later.',
          'converse',
          error as Error
        );
      } else {
        throw new AWSError(
          'Failed to converse with Bedrock model',
          'Bedrock',
          'converse',
          error as Error
        );
      }
    }
  }
  
  /**
   * Search for information from Knowledge Base
   * @param knowledgeBaseId Knowledge Base ID
   * @param retrieveQuery Search query
   * @param rerankModelId Reranking model ID
   * @returns Array of search results
   */
  async retrieve(
    knowledgeBaseId: string,
    retrieveQuery: string,
    rerankModelId?: string
  ): Promise<KBResult[]> {
    logger.info("Start", {function: "retrieve", input: {knowledgeBaseId, retrieveQuery, rerankModelId}});
    
    try {
      // Get region from configuration service
      const region = this.configService.getRegion();
      
      const retrieveCommand = rerankModelId ? 
        new RetrieveCommand({
          knowledgeBaseId: knowledgeBaseId,
          retrievalQuery: {
            text: retrieveQuery,
          },
          retrievalConfiguration: {
            vectorSearchConfiguration: {
              numberOfResults: this.DEFAULT_KB_RESULTS,
              overrideSearchType: SearchType.HYBRID,
              rerankingConfiguration: {
                type: 'BEDROCK_RERANKING_MODEL',
                bedrockRerankingConfiguration: {
                  modelConfiguration: {
                    modelArn: `arn:aws:bedrock:${region}::foundation-model/${rerankModelId}`,
                  },
                  numberOfRerankedResults: this.DEFAULT_KB_RESULTS,
                }
              }
            },
          },
        }) :
        new RetrieveCommand({
          knowledgeBaseId: knowledgeBaseId,
          retrievalQuery: {
            text: retrieveQuery,
          },
          retrievalConfiguration: {
            vectorSearchConfiguration: {
              numberOfResults: this.DEFAULT_KB_RESULTS,
              overrideSearchType: SearchType.HYBRID,
            }
          }
        });
      
      // Retry with exponential backoff
      const retrieveResponse: RetrieveCommandOutput = await retryWithExponentialBackoff(
        () => this.agentRuntimeClient.send(retrieveCommand)
      );
      
      logger.info("End", {function: "retrieve", output: {retrieveResponse}});
      
      if (!retrieveResponse.retrievalResults || retrieveResponse.retrievalResults.length === 0) {
        return [];
      }
      
      // Convert results to KBResult type
      return retrieveResponse.retrievalResults.map((result, index) => ({
        index,
        text: result.content?.text,
        source: result.location?.s3Location?.uri,
        score: result.score
      }));
    } catch (error) {
      logger.error("Error in retrieve", {error});
      
      // Check if it's a throttling error
      if (isThrottlingError(error)) {
        throw new BedrockThrottlingError(
          'Bedrock API rate limit exceeded. Please try again later.',
          'retrieve',
          error as Error
        );
      } else {
        throw new AWSError(
          'Failed to retrieve from Knowledge Base',
          'Bedrock',
          'retrieve',
          error as Error
        );
      }
    }
  }
}
