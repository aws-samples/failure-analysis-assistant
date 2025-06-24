import { AWSServiceFactory } from "../../lib/aws/index.js";
import { KBResult } from "../../lib/aws/services/bedrock-service.js";
import { logger } from "../../lib/logger";

export const kbToolExecutor = async (params: {
  query: string;
  maxResults?: number;
}): Promise<string> => {
  logger.info("Executing Knowledge Base tool", { params });
  
  try {
    // Knowledge Baseが有効かどうかを確認
    const knowledgeBaseEnabled = process.env.KNOWLEDGEBASE_ENABLED === "true" || process.env.KNOWLEDGEBASE_ID !== undefined;
    
    if (!knowledgeBaseEnabled) {
      return "Knowledge Baseは現在無効になっています。parameter.tsのknowledgeBaseをtrueに設定してください。";
    }
    
    // 環境変数の取得
    const knowledgeBaseId = process.env.KNOWLEDGEBASE_ID;
    const rerankModelId = process.env.RERANK_MODEL_ID;
    
    if (!knowledgeBaseId) {
      return "Knowledge Base IDが設定されていません。KnowledgeBaseStackが正しくデプロイされているか確認してください。";
    }
    
    // Knowledge Baseからの検索
    let results;
    try {
      const bedrockService = AWSServiceFactory.getBedrockService();
      results = await bedrockService.retrieve(
        knowledgeBaseId,
        params.query,
        rerankModelId
      );
    } catch (retrieveError) {
      // Knowledge Baseが存在しない場合や、アクセス権限がない場合
      if (retrieveError instanceof Error) {
        if (retrieveError.message.includes("ResourceNotFoundException")) {
          return `指定されたKnowledge Base (${knowledgeBaseId}) が見つかりません。KnowledgeBaseStackが正しくデプロイされているか確認してください。`;
        } else if (retrieveError.message.includes("AccessDeniedException")) {
          return `Knowledge Base (${knowledgeBaseId}) へのアクセス権限がありません。IAMポリシーを確認してください。`;
        }
      }
      throw retrieveError; // その他のエラーは上位でハンドリング
    }
    
    // 結果を読みやすい形式に整形
    if (!results || results.length === 0) {
      return `"${params.query}" に一致するドキュメントが見つかりませんでした。`;
    }
    
    return formatKBResults(results);
  } catch (error) {
    logger.error("Error in Knowledge Base tool", { error });
    return `Knowledge Baseからの検索中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`;
  }
};

function formatKBResults(results: KBResult[]): string {
  if (!results || results.length === 0) {
    return "条件に一致するドキュメントが見つかりませんでした。";
  }
  
  let output = "## Knowledge Base検索結果\n\n";
  output += `合計 ${results.length} 件のドキュメントが見つかりました。\n\n`;
  
  results.forEach((result, index) => {
    output += `### ドキュメント ${index + 1}\n\n`;
    output += `- スコア: ${result.score || "不明"}\n`;
    output += `- ソース: ${result.source || "不明"}\n\n`;
    
    output += "```\n";
    output += result.text || "テキストなし";
    output += "\n```\n\n";
  });
  
  return output;
}
