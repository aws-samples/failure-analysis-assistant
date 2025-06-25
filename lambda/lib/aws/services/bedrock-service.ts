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

/**
 * Knowledge Base検索結果の型
 */
export interface KBResult {
  index?: number;
  text?: string;
  source?: string;
  score?: number;
}

/**
 * Bedrockサービスのラッパークラス
 */
export class BedrockService {
  private runtimeClient: BedrockRuntimeClient;
  private agentRuntimeClient: BedrockAgentRuntimeClient;
  
  // 固定値の設定
  private readonly DEFAULT_MAX_TOKENS = 8192;
  private readonly DEFAULT_TEMPERATURE = 0.1;
  private readonly DEFAULT_TOP_P = 0.97;
  private readonly DEFAULT_KB_RESULTS = 3;
  
  /**
   * コンストラクタ
   * @param runtimeClient BedrockRuntimeClient（テスト用にモックを注入可能）
   * @param agentRuntimeClient BedrockAgentRuntimeClient（テスト用にモックを注入可能）
   */
  constructor(
    runtimeClient?: BedrockRuntimeClient,
    agentRuntimeClient?: BedrockAgentRuntimeClient
  ) {
    this.runtimeClient = runtimeClient || new BedrockRuntimeClient();
    this.agentRuntimeClient = agentRuntimeClient || new BedrockAgentRuntimeClient();
  }
  
  /**
   * Bedrockモデルと会話する
   * @param prompt プロンプト
   * @param modelId モデルID（省略時は環境変数から取得）
   * @param inferenceConfig 推論設定
   * @returns モデルからの応答テキスト
   */
  async converse(
    prompt: string, 
    modelId: string = process.env.MODEL_ID!,
    inferenceConfig: InferenceConfiguration = {
      maxTokens: this.DEFAULT_MAX_TOKENS,
      temperature: this.DEFAULT_TEMPERATURE,
      topP: this.DEFAULT_TOP_P
    }
  ): Promise<string> {
    logger.info("Start", {function: "converse", input: {prompt, modelId, inferenceConfig}});
    
    try {
      const converseCommandInput: ConverseCommandInput = {
        modelId,
        messages: [
          {
            "role": "user",
            "content": [{"text": prompt}]
          }
        ],
        inferenceConfig,
      };
      
      // エクスポネンシャルバックオフでリトライ
      const converseOutput = await retryWithExponentialBackoff(
        () => this.runtimeClient.send(new ConverseCommand(converseCommandInput))
      );
      
      logger.info("End", {function: "converse", output: {converseOutput}});
      return converseOutput.output?.message?.content![0].text || "";
    } catch (error) {
      logger.error("Error in converse", {error});
      
      // スロットリングエラーかどうかを確認
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
   * Knowledge Baseから情報を検索する
   * @param knowledgeBaseId Knowledge Base ID
   * @param retrieveQuery 検索クエリ
   * @param rerankModelId 再ランク付けモデルID
   * @returns 検索結果の配列
   */
  async retrieve(
    knowledgeBaseId: string,
    retrieveQuery: string,
    rerankModelId?: string
  ): Promise<KBResult[]> {
    logger.info("Start", {function: "retrieve", input: {knowledgeBaseId, retrieveQuery, rerankModelId}});
    
    try {
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
                    modelArn: `arn:aws:bedrock:${process.env.AWS_REGION}::foundation-model/${rerankModelId}`,
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
      
      // エクスポネンシャルバックオフでリトライ
      const retrieveResponse: RetrieveCommandOutput = await retryWithExponentialBackoff(
        () => this.agentRuntimeClient.send(retrieveCommand)
      );
      
      logger.info("End", {function: "retrieve", output: {retrieveResponse}});
      
      if (!retrieveResponse.retrievalResults || retrieveResponse.retrievalResults.length === 0) {
        return [];
      }
      
      // 結果をKBResult型に変換
      return retrieveResponse.retrievalResults.map((result, index) => ({
        index,
        text: result.content?.text,
        source: result.location?.s3Location?.uri,
        score: result.score
      }));
    } catch (error) {
      logger.error("Error in retrieve", {error});
      
      // スロットリングエラーかどうかを確認
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
