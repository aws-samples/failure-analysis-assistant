import { AWSServiceFactory } from "../../lib/aws/index.js";
import { KBResult } from "../../lib/aws/services/bedrock-service.js";
import { logger } from "../logger.js";
import { I18nProvider } from "../messaging/providers/i18n-provider.js";
import { getI18nProvider } from "../messaging/providers/i18n-factory.js";
import { ConfigurationService } from "../configuration-service.js";

export class KbTool {
  private i18n: I18nProvider;
  private configService: ConfigurationService;
  
  constructor(i18n?: I18nProvider, configService?: ConfigurationService) {
    // Use provided i18n instance or get from factory
    this.i18n = i18n || getI18nProvider();
    // Use provided configuration service or get from singleton
    this.configService = configService || ConfigurationService.getInstance();
  }
  
  async execute(params: {
    query: string;
    maxResults?: number;
    i18n?: I18nProvider;
    configService?: ConfigurationService;
  }): Promise<string> {
    // Update i18n if provided in params
    if (params.i18n) {
      this.i18n = params.i18n;
    }
    
    // Update configuration service if provided in params
    if (params.configService) {
      this.configService = params.configService;
    }
    
    logger.info("Executing Knowledge Base tool", { params });
    
    try {
      // Check if Knowledge Base is enabled using configuration service
      const knowledgeBaseEnabled = this.configService.isKnowledgeBaseEnabled();
      
      if (!knowledgeBaseEnabled) {
        return this.i18n.translate("kbDisabled");
      }
      
      // Get configuration from configuration service
      const knowledgeBaseId = this.configService.getKnowledgeBaseId();
      const rerankModelId = this.configService.getRerankModelId();
      
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
          rerankModelId || undefined
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

// Function that can be called externally
export const kbToolExecutor = async (params: {
  query: string;
  maxResults?: number;
  i18n?: I18nProvider;
  configService?: ConfigurationService;
}): Promise<string> => {
  const kbTool = new KbTool(params.i18n, params.configService);
  return await kbTool.execute(params);
};
