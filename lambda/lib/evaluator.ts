import { Prompt } from "./prompt.js";
import { logger } from "./logger.js";
import { AWSServiceFactory } from "./aws/aws-service-factory.js";
import { BedrockService } from "./aws/services/bedrock-service.js";
import { BedrockThrottlingError } from "./aws/errors/aws-error.js";
import { Hypothesis } from "./tot-agent.js";
import { HistoryItem } from "./react-agent.js";

/**
 * 仮説評価の結果を表すインターフェース
 */
export interface EvaluationResult {
  hypothesisId: string;
  status: 'confirmed' | 'rejected' | 'inconclusive';
  confidenceLevel: 'high' | 'medium' | 'low';
  reasoning: string;
}

/**
 * 仮説評価を行うクラス
 */
export class Evaluator {
  private prompt: Prompt;
  private bedrockService: BedrockService;
  
  constructor(prompt: Prompt) {
    this.prompt = prompt;
    this.bedrockService = AWSServiceFactory.getBedrockService();
  }
  
  /**
   * ReActエージェントの結果に基づいて仮説を評価する
   * @param hypothesis 評価対象の仮説
   * @param context 障害の説明
   * @param history ReActエージェントの履歴
   * @returns 評価結果
   */
  public async evaluateHypothesis(
    hypothesis: Hypothesis,
    context: string,
    history: HistoryItem[]
  ): Promise<EvaluationResult> {
    logger.info("Evaluating hypothesis", { 
      hypothesisId: hypothesis.id,
      description: hypothesis.description
    });
    
    try {
      // 評価用のプロンプトを作成
      // 注: createEvaluationPromptメソッドはPromptクラスに追加する必要があります
      const evaluationPrompt = this.prompt.createEvaluationPrompt(
        hypothesis,
        context,
        history
      );
      
      // LLMに問い合わせ
      const response = await this.bedrockService.converse(evaluationPrompt);
      
      // レスポンスから評価結果を抽出
      return this.extractEvaluationFromResponse(response || "", hypothesis);
    } catch (error) {
      if (error instanceof BedrockThrottlingError) {
        logger.warn("Bedrock API throttled during evaluation", { error });
        
        // スロットリングエラーの場合は、保留状態を返す
        return {
          hypothesisId: hypothesis.id,
          status: 'inconclusive',
          confidenceLevel: 'low',
          reasoning: "Bedrockのレート制限に達したため、評価を完了できませんでした。現在の情報では結論を出せません。"
        };
      }
      
      // その他のエラーの場合
      logger.error("Error evaluating hypothesis", { error });
      return {
        hypothesisId: hypothesis.id,
        status: 'inconclusive',
        confidenceLevel: 'low',
        reasoning: `評価中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  /**
   * LLMのレスポンスから評価結果を抽出する
   * @param response LLMのレスポンス
   * @param hypothesis 評価対象の仮説
   * @returns 評価結果
   */
  private extractEvaluationFromResponse(
    response: string,
    hypothesis: Hypothesis
  ): EvaluationResult {
    logger.info("Extracting evaluation from response");
    
    try {
      // <Evaluation>タグで囲まれた部分を抽出
      const evaluationMatch = response.match(/<Evaluation>([\s\S]*?)<\/Evaluation>/);
      const evaluationContent = evaluationMatch ? evaluationMatch[1].trim() : response;
      
      // 評価内容から状態、信頼度、根拠を抽出
      const statusStr = this.extractField(evaluationContent, "状態", "Status");
      const confidenceStr = this.extractField(evaluationContent, "信頼度", "Confidence");
      const reasoning = this.extractField(evaluationContent, "根拠", "Reasoning");
      
      // 状態を判定
      let status: 'confirmed' | 'rejected' | 'inconclusive' = 'inconclusive';
      if (statusStr) {
        if (
          statusStr.toLowerCase().includes("確定") || 
          statusStr.toLowerCase().includes("confirmed") ||
          statusStr.toLowerCase().includes("valid") ||
          statusStr.toLowerCase().includes("correct")
        ) {
          status = 'confirmed';
        } else if (
          statusStr.toLowerCase().includes("棄却") || 
          statusStr.toLowerCase().includes("rejected") ||
          statusStr.toLowerCase().includes("invalid") ||
          statusStr.toLowerCase().includes("incorrect")
        ) {
          status = 'rejected';
        }
      }
      
      // 信頼度を「高/中/低」に変換
      let confidenceLevel: 'high' | 'medium' | 'low' = 'medium'; // デフォルト値
      if (confidenceStr) {
        if (confidenceStr.toLowerCase().includes('高') || 
            confidenceStr.toLowerCase().includes('high')) {
          confidenceLevel = 'high';
        } else if (confidenceStr.toLowerCase().includes('低') || 
                   confidenceStr.toLowerCase().includes('low')) {
          confidenceLevel = 'low';
        }
      }
      
      // 評価結果オブジェクトを作成
      return {
        hypothesisId: hypothesis.id,
        status,
        confidenceLevel,
        reasoning: reasoning || evaluationContent
      };
    } catch (error) {
      logger.error("Error extracting evaluation", { error });
      
      // エラー時のフォールバック
      return {
        hypothesisId: hypothesis.id,
        status: 'inconclusive',
        confidenceLevel: 'low',
        reasoning: "評価結果の抽出中にエラーが発生しました。現在の情報では結論を出せません。"
      };
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
