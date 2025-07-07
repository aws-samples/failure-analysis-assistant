import { AWSServiceFactory } from "../../lib/aws/index.js";
import { KBResult } from "../../lib/aws/services/bedrock-service.js";
import { logger } from "../logger.js";
import { I18nProvider } from "../messaging/providers/i18n-provider.js";
import { getI18nProvider } from "../messaging/providers/i18n-factory.js";

export class KbTool {
  private i18n: I18nProvider;
  
  constructor(i18n?: I18nProvider) {
    // Use provided i18n instance or get from factory
    this.i18n = i18n || getI18nProvider();
  }
  
  async execute(params: {
    query: string;
    maxResults?: number;
    i18n?: I18nProvider;
  }): Promise<string> {
    // Update i18n if provided in params
    if (params.i18n) {
      this.i18n = params.i18n;
    }
    logger.info("Executing Knowledge Base tool", { params });
    
    try {
      // Check if Knowledge Base is enabled
      const knowledgeBaseEnabled = process.env.KNOWLEDGEBASE_ENABLED === "true" || process.env.KNOWLEDGEBASE_ID !== undefined;
      
      if (!knowledgeBaseEnabled) {
        return this.i18n.translate("kbDisabled");
      }
      
      // Get environment variables
      const knowledgeBaseId = process.env.KNOWLEDGEBASE_ID;
      const rerankModelId = process.env.RERANK_MODEL_ID;
      
      if (!knowledgeBaseId) {
        return this.i18n.translate("kbIdNotConfigured");
      }
      
      // Search from Knowledge Base
      let results;
      try {
        const bedrockService = AWSServiceFactory.getBedrockService();
        results = await bedrockService.retrieve(
          knowledgeBaseId,
          params.query,
          rerankModelId
        );
      } catch (retrieveError) {
        // If Knowledge Base doesn't exist or there's no access permission
        if (retrieveError instanceof Error) {
          if (retrieveError.message.includes("ResourceNotFoundException")) {
            return this.i18n.formatTranslation("kbNotFound", knowledgeBaseId);
          } else if (retrieveError.message.includes("AccessDeniedException")) {
            return this.i18n.formatTranslation("kbAccessDenied", knowledgeBaseId);
          }
        }
        throw retrieveError; // Handle other errors at a higher level
      }
      
      // Format results in a readable format
      if (!results || results.length === 0) {
        return this.i18n.formatTranslation("kbNoMatchingDocuments", params.query);
      }
      
      return this.formatKBResults(results);
    } catch (error) {
      logger.error("Error in Knowledge Base tool", { error });
      return this.i18n.formatTranslation("kbQueryError", error instanceof Error ? error.message : String(error));
    }
  }
  
  private formatKBResults(results: KBResult[]): string {
    if (!results || results.length === 0) {
      return this.i18n.translate("kbNoResults");
    }
    
    let output = this.i18n.translate("kbResultsTitle");
    output += this.i18n.formatTranslation("kbTotalFound", results.length);
    
    results.forEach((result, index) => {
      output += this.i18n.formatTranslation("kbDocumentTitle", index + 1);
      output += this.i18n.formatTranslation("kbDocumentScore", result.score || this.i18n.translate("kbNoText"));
      output += this.i18n.formatTranslation("kbDocumentSource", result.source || this.i18n.translate("kbNoText"));
      
      output += "```\n";
      output += result.text || this.i18n.translate("kbNoText");
      output += "\n```\n\n";
    });
    
    return output;
  }
}

// Create tool executor instance
const kbTool = new KbTool();

// Function that can be called externally
export const kbToolExecutor = async (params: {
  query: string;
  maxResults?: number;
  i18n?: I18nProvider;
}): Promise<string> => {
  return await kbTool.execute(params);
};
