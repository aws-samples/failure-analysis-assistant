import { Language } from "../../parameter.js";
import { logger } from "./logger.js";

export class Prompt {
  language: Language;
  architectureDescription: string;

  constructor(
    language: Language = "en",
    architectureDescription: string,
  ){
    this.language = language;
    this.architectureDescription = architectureDescription;
  }

  /**
   * Create findings report prompt
   * @param securityHubFindings Security Hub findings
   * @param guardDutyFindings GuardDuty findings
   * @returns Prompt for findings report
   */
  createFindingsReportPrompt(
    securityHubFindings: string,
    guardDutyFindings: string
  ): string {
    logger.info("Creating findings report prompt", {
      securityHubFindingsLength: securityHubFindings?.length || 0,
      guardDutyFindingsLength: guardDutyFindings?.length || 0
    });
    
    if (this.language === "ja") {
      return `あなたはAWSのセキュリティ専門家です。以下のSecurityHubとGuardDutyの検出結果を分析し、重要な問題点と推奨される対応策をまとめたレポートを作成してください。

## SecurityHub検出結果
${securityHubFindings || "検出結果はありません。"}

## GuardDuty検出結果
${guardDutyFindings || "検出結果はありません。"}

レポートは以下の形式でMarkdown形式で作成してください：

<outputReport>
# AWS セキュリティ検出結果レポート

## 概要
（検出された主要な問題の簡潔な概要）

## 重大度の高い問題
（重大度の高い問題の詳細な説明と潜在的な影響）

## 推奨される対応策
（問題を解決するための具体的な手順）

## 詳細な検出結果
（検出結果の詳細なリスト、重大度別に整理）

## 次のステップ
（長期的なセキュリティ体制を強化するための推奨事項）
</outputReport>`;
    } else {
      return `You are an AWS security expert. Analyze the following SecurityHub and GuardDuty findings and create a report summarizing the key issues and recommended actions.

## SecurityHub Findings
${securityHubFindings || "No findings available."}

## GuardDuty Findings
${guardDutyFindings || "No findings available."}

Please create the report in Markdown format using the following structure:

<outputReport>
# AWS Security Findings Report

## Overview
(Brief summary of the main issues detected)

## High Severity Issues
(Detailed explanation of high severity issues and their potential impact)

## Recommended Actions
(Specific steps to address the issues)

## Detailed Findings
(Detailed list of findings, organized by severity)

## Next Steps
(Recommendations for strengthening security posture long-term)
</outputReport>`;
    }
  }

  /**
   * Get string value from query result
   * @param results Query results
   * @param queryName Query name
   * @returns String value from query result
   */
  static getStringValueFromQueryResult(results: any[], queryName: string): string {
    logger.info("Getting string value from query result", {queryName});
    
    try {
      const result = results.find(r => r && r.queryName === queryName);
      if (!result) {
        logger.warn(`Query result not found for ${queryName}`);
        return "";
      }
      
      if (result.error) {
        logger.error(`Error in query result for ${queryName}`, {error: result.error});
        return `Error: ${result.error}`;
      }
      
      if (!result.data || result.data.length === 0) {
        logger.info(`No data in query result for ${queryName}`);
        return "";
      }
      
      return JSON.stringify(result.data, null, 2);
    } catch (error) {
      logger.error(`Error processing query result for ${queryName}`, {error});
      return `Error processing results: ${error}`;
    }
  }
}
