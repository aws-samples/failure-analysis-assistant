# メトリクス分析支援

メトリクス分析支援は、Amazon CloudWatch の Metrics を活用して、システムの状態や問題を分析するための機能です。この機能を使用することで、ユーザーはクエリを自然言語で入力するだけで、関連するメトリクスを自動的に特定し、分析結果を取得できます。

## 主な特徴

1. **自然言語クエリ処理**
   - ユーザーが自然言語でクエリを入力すると、システムはそれを解析して関連するAWS名前空間を推測します
   - 例: 「EC2インスタンスのCPU使用率が高い原因を調査して」というクエリから、AWS/EC2名前空間を自動的に特定

2. **インテリジェントなメトリクス選択**
   - クエリの内容に基づいて、最も関連性の高いメトリクスを自動的に選択
   - 複数の名前空間（EC2、ECS、RDS、Lambdaなど）から適切なメトリクスを特定

3. **高度な分析と洞察**
   - 選択されたメトリクスのデータを取得し、統計的分析を実行
   - 異常値の検出や傾向分析を行い、問題の根本原因を特定するための洞察を提供

4. **わかりやすいレポート生成**
   - 分析結果をMarkdown形式で整形し、Slackに送信
   - グラフや統計情報を含む包括的なレポートを提供

## 使用方法

Slack のチャット欄に、`/insight` と入力、送信すると、モーダルが表示されます。
モーダルのフォームに、[メトリクスを元に回答してほしい質問]と[メトリクスを取得したい期間]を入力してください。
1-2分ほどで、回答が得られます。
次の例では、Amazon ECSのパフォーマンスに対して、質問を送っています。

![insight-form](./docs/images/ja/fa2-insight-form.png)

![query-about-ecs-performance](./docs/images/ja/fa2-query-about-ecs-performance.png)

![メトリクス分析フォーム](./docs/images/ja/fa2-insight-form.png)

## 技術的な仕組み

1. ユーザーのクエリから関連するAWS名前空間を推測（Amazon BedrockのLLMを使用）
2. 推測された名前空間からメトリクスのリストを取得
3. クエリとメトリクスリストを基に、最適なMetricDataQueryを生成（Amazon BedrockのLLMを使用）
4. CloudWatch APIを使用して実際のメトリクスデータを取得
5. 取得したデータを分析し、洞察を生成（Amazon BedrockのLLMを使用）
6. 結果をMarkdown形式でフォーマットしてSlackに送信

## 設定方法

メトリクス分析支援機能を有効にするには、`parameter.ts`ファイルで以下の設定を行います：

```typescript
export const devParameter: AppParameter = {
  // 他の設定...
  slashCommands: {
    insight: true,  // メトリクス分析支援を有効化
    // 他の設定...
  },
  // 他の設定...
};
```

### [オプション] メトリクス分析支援機能のための Slack App の設定

1. 左メニューの[Slash Commands]をクリックし、[Create New Command]をクリックします
2. 以下の表のように値を入力し、すべて入力したら、[Save]をクリックします

   | 項目名 | 値 |
   | ------ | -- |
   | Command | /insight |
   | Request URL | Request URL と同じ URL |
   | Short Description | Get insight for your workload |

3. 左メニューの [App Home] をクリックし、[Message Tab] にある [Allow users to send Slash commands and messages from the messages tab] にチェックを入れます
   - これで、Slack App の DM 欄でメトリクス分析支援の実行・結果受領がしやすくなります
4. 左メニューの [OAuth & Permissions] をクリックし、[Scopes]で、`commands` を追加します

## 実装詳細

メトリクス分析支援機能は主に以下のコンポーネントで構成されています：

1. **Lambda関数**: `lambda/functions/metrics-insight/main.mts`
   - ユーザーのクエリを処理し、関連するメトリクスを特定して分析を実行
   - BedrockサービスとCloudWatchサービスを連携させて動作

2. **メトリクスツール**: `lambda/lib/tool-executors/metrics-tool.ts`
   - CloudWatchメトリクスを取得・分析するためのツール
   - 基本的な統計情報の計算や異常値の検出を実行

3. **プロンプト生成**: `lambda/lib/prompt.ts`
   - LLMに送信するプロンプトを生成
   - 名前空間推論、メトリクス選択、洞察生成のための専用プロンプトを提供
