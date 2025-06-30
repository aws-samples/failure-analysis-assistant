import { Prompt } from "./prompt.js";
import { ToolRegistry } from "./tools-registry.js";
import { logger } from "./logger.js";
import { AWSServiceFactory } from "./aws/aws-service-factory.js";
import { BedrockService } from "./aws/services/bedrock-service.js";
import { BedrockThrottlingError } from "./aws/errors/aws-error.js";

/**
 * 仮説の構造を定義するインターフェース
 */
export interface Hypothesis {
  id: string;
  description: string;
  confidence: number;
  reasoning: string;
  source: 'knowledge_base' | 'llm';
}

/**
 * ToTAgentの状態を表すインターフェース
 */
export interface ToTState {
  context: string;
  hypotheses: Hypothesis[];
  kbSearchResults?: string;
}

/**
 * Tree of Thinking (ToT)を使用して複数の仮説を生成するエージェント
 */
export class ToTAgent {
  private sessionId: string;
  private toolRegistry: ToolRegistry;
  private prompt: Prompt;
  private bedrockService: BedrockService;
  private maxHypotheses: number;
  
  constructor(
    sessionId: string, 
    toolRegistry: ToolRegistry, 
    prompt: Prompt,
    maxHypotheses: number = 5
  ) {
    this.sessionId = sessionId;
    this.toolRegistry = toolRegistry;
    this.prompt = prompt;
    this.bedrockService = AWSServiceFactory.getBedrockService();
    this.maxHypotheses = maxHypotheses;
  }
  
  /**
   * 障害の説明から複数の仮説を生成する
   * @param errorDescription 障害の説明
   * @returns 生成された仮説のリスト
   */
  public async generateHypotheses(errorDescription: string): Promise<ToTState> {
    logger.info("Generating hypotheses using ToT", { 
      sessionId: this.sessionId,
      maxHypotheses: this.maxHypotheses
    });
    
    // Knowledge Baseから関連情報を検索
    const kbSearchResults = await this.searchKnowledgeBase(errorDescription);
    
    // Tree of Thinkingを使用して仮説を生成
    const hypotheses = await this.performTreeOfThinking(errorDescription, kbSearchResults);
    
    return {
      context: errorDescription,
      hypotheses,
      kbSearchResults
    };
  }
  
  /**
   * Knowledge Baseから関連情報を検索する
   * @param query 検索クエリ
   * @returns 検索結果
   */
  private async searchKnowledgeBase(query: string): Promise<string> {
    try {
      logger.info("Searching Knowledge Base", { query });
      
      // kb_toolを使用してKnowledge Baseを検索
      const result = await this.toolRegistry.executeTool("kb_tool", {
        query,
        maxResults: 3
      });
      
      return result;
    } catch (error) {
      logger.warn("Failed to search Knowledge Base", { error });
      return "Knowledge Baseの検索中にエラーが発生しました。LLMの知識のみを使用して仮説を生成します。";
    }
  }
  
  /**
   * Tree of Thinkingを使用して仮説を生成する
   * @param errorDescription 障害の説明
   * @param kbSearchResults Knowledge Base検索結果
   * @returns 生成された仮説のリスト
   */
  private async performTreeOfThinking(
    errorDescription: string,
    kbSearchResults: string
  ): Promise<Hypothesis[]> {
    try {
      // ToT用のプロンプトを作成
      const totPrompt = this.prompt.createToTPrompt(
        errorDescription,
        kbSearchResults,
        this.maxHypotheses
      );
      
      // LLMに問い合わせ
      const response = await this.bedrockService.converse(totPrompt);
      
      // レスポンスから仮説を抽出
      return this.extractHypothesesFromResponse(response || "", kbSearchResults);
    } catch (error) {
      if (error instanceof BedrockThrottlingError) {
        logger.warn("Bedrock API throttled during ToT", { error });
        
        // スロットリングエラーの場合は、シンプルな仮説を1つ返す
        return [{
          id: "fallback-1",
          description: "APIレート制限により仮説生成が制限されました。一般的な障害原因として考えられるのは、リソース不足、設定ミス、外部依存関係の問題です。",
          confidence: 0.5,
          reasoning: "Bedrockのレート制限に達したため、詳細な分析ができませんでした。一般的な障害パターンに基づく仮説です。",
          source: "llm"
        }];
      }
      
      // その他のエラーの場合は再スロー
      throw error;
    }
  }
  
  /**
   * LLMのレスポンスから仮説を抽出する
   * @param response LLMのレスポンス
   * @param kbSearchResults Knowledge Base検索結果
   * @returns 抽出された仮説のリスト
   */
  private extractHypothesesFromResponse(
    response: string,
    kbSearchResults: string
  ): Hypothesis[] {
    logger.info("Extracting hypotheses from response");
    
    const hypotheses: Hypothesis[] = [];
    
    try {
      // <Hypothesis>タグで囲まれた部分を抽出
      const regex = /<Hypothesis\s*(\d+)>\s*([\s\S]*?)<\/Hypothesis\s*\1>/g;
      let match;
      let index = 0;
      
      while ((match = regex.exec(response)) !== null && index < this.maxHypotheses) {
        const hypothesisNumber = match[1];
        const hypothesisContent = match[2].trim();
        
        // 仮説の内容から説明、信頼度、根拠を抽出
        const description = this.extractField(hypothesisContent, "説明", "Description");
        const confidenceStr = this.extractField(hypothesisContent, "信頼度", "Confidence");
        const reasoning = this.extractField(hypothesisContent, "根拠", "Reasoning");
        const sourceStr = this.extractField(hypothesisContent, "情報源", "Source");
        
        // 信頼度を数値に変換（0.0〜1.0）
        let confidence = 0.5; // デフォルト値
        if (confidenceStr) {
          // 数値のみを抽出
          const confidenceMatch = confidenceStr.match(/(\d+(\.\d+)?)/);
          if (confidenceMatch) {
            const parsedConfidence = parseFloat(confidenceMatch[1]);
            // 0-100のスケールの場合は0-1に変換
            confidence = parsedConfidence > 1 ? parsedConfidence / 100 : parsedConfidence;
            // 範囲を0-1に制限
            confidence = Math.max(0, Math.min(1, confidence));
          }
        }
        
        // 情報源を判定
        let source: 'knowledge_base' | 'llm' = 'llm';
        
        // 明示的に情報源が指定されている場合
        if (sourceStr && 
            (sourceStr.toLowerCase().includes("knowledge base") || 
             sourceStr.toLowerCase().includes("ナレッジベース"))) {
          source = 'knowledge_base';
        } 
        // 内容がKnowledge Base検索結果と一致する場合
        else if (kbSearchResults && 
                (description || hypothesisContent).toLowerCase().includes(kbSearchResults.toLowerCase().substring(0, 50))) {
          source = 'knowledge_base';
        }
        
        // 仮説オブジェクトを作成
        hypotheses.push({
          id: `hypothesis-${hypothesisNumber}`,
          description: description || hypothesisContent,
          confidence,
          reasoning: reasoning || "",
          source
        });
        
        index++;
      }
      
      // 仮説が見つからない場合のフォールバック
      if (hypotheses.length === 0) {
        logger.warn("No hypotheses found in response, using fallback");
        
        // レスポンス全体から仮説を作成
        hypotheses.push({
          id: "fallback-1",
          description: "レスポンスから仮説を抽出できませんでした。障害の原因として考えられるのは、システムリソースの不足、設定ミス、または外部依存関係の問題です。",
          confidence: 0.5,
          reasoning: "LLMのレスポンスから構造化された仮説を抽出できませんでした。一般的な障害パターンに基づく仮説です。",
          source: "llm"
        });
      }
      
      // 信頼度の高い順にソート
      return hypotheses.sort((a, b) => b.confidence - a.confidence);
      
    } catch (error) {
      logger.error("Error extracting hypotheses", { error });
      
      // エラー時のフォールバック
      return [{
        id: "error-1",
        description: "仮説の抽出中にエラーが発生しました。一般的な障害原因として、システムリソースの不足、設定ミス、外部依存関係の問題が考えられます。",
        confidence: 0.5,
        reasoning: "仮説抽出処理でエラーが発生しました。一般的な障害パターンに基づく仮説です。",
        source: "llm"
      }];
    }
  }
  
  /**
   * 指定されたフィールドの値を抽出する
   * @param content 抽出対象のコンテンツ
   * @param jaLabel 日本語のラベル
   * @param enLabel 英語のラベル
   * @returns 抽出された値
   */
  private extractField(content: string, jaLabel: string, enLabel: string): string {
    // 日本語または英語のラベルで検索
    const regex = new RegExp(`(${jaLabel}|${enLabel})\\s*[:：]\\s*([\\s\\S]*?)(?=(\\n\\s*[A-Za-z一-龠ぁ-ゔァ-ヴー]+\\s*[:：])|$)`, 'i');
    const match = content.match(regex);
    return match ? match[2].trim() : "";
  }
}
