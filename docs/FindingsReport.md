# Findings レポート

Findingsレポートは、AWS Security Hub とAmazon GuardDutyから検出結果（Findings）を収集し、生成 AI が解説するレポートを作成する機能を追加しました。こちらの機能はオプションとなりますので、有効にする場合は、パラメータ設定や[オプション]Findings レポート機能のための Slack App の設定をご確認ください。

## 主な特徴

1. **複数のセキュリティソースの統合**
   - AWS Security Hubの検出結果を収集・分析
   - Amazon GuardDutyの検出結果を収集・分析

2. **包括的なセキュリティ分析**
   - 収集した検出結果を統合的に分析
   - 重要度や影響度に基づいて問題を優先順位付け
   - 関連する検出結果をグループ化して根本的な問題を特定

3. **詳細なレポート生成**
   - 分析結果をPDF形式のレポートとして生成
   - 検出された問題の概要と詳細な説明
   - 推奨される対応策と修正手順

## 使用方法

Slack のチャット欄に、`/findings-report` と入力、送信すると、リクエストを受け付けたメッセージが表示されます。
1-2分ほどで、 Findings のレポートの PDF がアップロードされます。

![findings-report](./docs/images/ja/fa2-findings-report.png)

## 技術的な仕組み

1. AWS Security Hubと Amazon GuardDutyのAPIを使用して最新の検出結果を取得
2. 取得した検出結果をJSON形式で整理
3. Amazon BedrockのLLMを使用して検出結果を分析し、包括的なレポートを生成
4. 生成されたMarkdownコンテンツをPDFに変換
5. PDFファイルをSlackチャンネルに送信

## 設定方法

Findingsレポート機能を有効にするには、`parameter.ts`ファイルで以下の設定を行います：

```typescript
export const devParameter: AppParameter = {
  // 他の設定...
  slashCommands: {
    findingsReport: true,  // Findingsレポートを有効化
    // 他の設定...
  },
  // 他の設定...
};
```

### [オプション] Findingsレポート機能のための Slack App の設定

1. 左メニューの[Slash Commands]をクリックし、[Create New Command]をクリックします
2. 以下の表のように値を入力し、すべて入力したら、[Save]をクリックします

   | 項目名 | 値 |
   | ------ | -- |
   | Command | /findings-report |
   | Request URL | Request URL と同じ URL |
   | Short Description | Create report about findings of Security Hub and GuardDuty |

3. **注意**: メトリクス分析支援機能を有効にしている場合、以下の手順は実施不要です
4. 左メニューの [App Home] をクリックし、[Message Tab] にある [Allow users to send Slash commands and messages from the messages tab] にチェックを入れます
5. 左メニューの [OAuth & Permissions] をクリックし、[Scopes]で、`commands` を追加します

## 実装詳細

Findingsレポート機能は主に以下のコンポーネントで構成されています：

1. **Lambda関数**: `lambda/functions/findings-report/main.mts`
   - Security HubとGuardDutyからの検出結果を取得
   - BedrockサービスとPDF変換機能を連携させて動作

2. **セキュリティサービス連携**:
   - `lambda/lib/aws/services/Security Hub-service.ts`: Security Hubからの検出結果取得
   - `lambda/lib/aws/services/guardduty-service.ts`: GuardDutyからの検出結果取得

3. **PDF変換機能**: `lambda/lib/puppeteer.ts`
   - Markdownコンテンツを高品質なPDFに変換
   - 日本語フォントのサポートを含む

4. **プロンプト生成**: `lambda/lib/prompt.ts`
   - LLMに送信するプロンプトを生成
   - セキュリティ検出結果の分析と報告書作成のための専用プロンプトを提供
