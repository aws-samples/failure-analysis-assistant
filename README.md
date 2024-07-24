# Failure Analysis Assistant (FA2) AWS Chatbot Custom Action 版

[View this page in English](./README_en.md)

AWS Chatbot が Slack に送ったアラームに反応し、エラーの根本原因を分析を支援するサンプル実装です。
あらかじめ定義されたログの保管先から、ユーザが指定した時間範囲でログを取得し、そのログを LLM で情報抽出や要約を行い、障害分析を助ける情報を Slack に返します。

本 README では、**AWS Chatbot の Custom Action を利用した実装を紹介しています。**
AWS Summit Japan 2024 のブースで展示していた Slack App の実装を確認したい方は、[Failure Analysis Assistant (FA2) Slack App 版](https://github.com/aws-samples/failure-analysis-assistant)を参照ください。

## Architecture & Workflow

既存ワークロードの範囲は、既に実装されているという前提です。
本サンプルは、CloudWatch Logs にログが出力されていれば、お試しいただけます。

![chatbo-architecture](./docs/images/ja/fa2-architecture-chatbot.png)

1. 対象システムで、メトリクスなどに設定したアラームが発火し、Amazon SNS と AWS Chatbot を通じ Slack に通知が届きます
2. FA2 をターゲットに設定した Custom Action を実行し、`ログの取得時間範囲`と`アラームからわかるイベント情報`を入力し、リクエストします
3. FA2 は Lambda 上で実行され、リクエストに含まれたログの取得時間範囲から、定義されたログ検索対象にアクセスし、情報を収集します
   1. 以降で設定するパラメータによって、検索対象が決まります。CloudWatch Logs のロググループが必須で、Amazon Athena や AWS X-Ray はオプションとなります
   2. 検索対象を増やすことで、より精度の高い回答を得られる可能性があります
4. FA2 に含まれるプロンプトテンプレートに、収集した情報をコンテキストとして加え、プロンプトを作成します。そのプロンプトを Amazon Bedrock に送り、イベントに関連した情報の要約やイベントの原因分析に必要な情報抽出を行います
5. LLM から得られた回答を返すため、SNS トピックに回答内容を送信し、AWS Chatbot を通じ、Slack に送ります

## 前提条件

- AWS Cloud Development Kit (CDK) が利用できること
  - 本サンプルは CDK で実装されています
- 分析したいログが含まれている、CloudWatch Logs のロググループがあること
  - Amazon Athena や AWS X-Ray は任意の設定項目となります
  - AWS CloudTrail、Application Load Balancer (ALB) のアクセスログを利用する場合、Amazon Athena のデータベースが作成されていること
  - AWS X-Ray のトレース情報も利用する場合、該当システムの AWS X-Ray トレースが取得できていること
- Amazon Bedrock でモデルアクセスから、Claude v3 Sonnet のアクセス許可をしていること
- 既存ワークロードで設定した AWS Chatbot から Slack にアラームの通知が来ることを確認していること
  - FA2 のテスト利用のための既存ワークロードがない、もしくは利用できない場合、[FA２のお試し環境の作り方](./docs/HowToCreateTestEnvironment.md)を参考に、環境を作ることもできます

## How to Deploy

### パラメータ設定

次の記載を参考に、`parameter_template.ts`をコピーし、`parameter.ts` を作成した上で、それぞれの値を変更してください。

```
// 例: AWS Chatbot 版で、 Claude 3 Sonnet を利用し、CloudWatch Logs、Athena、X-Ray、を検索対象とした場合の設定
export const devParameter: AppParameter = {
  env: {
    account: "123456789012",
    region: "us-east-1",
  },
  language: "ja",
  envName: "Development",
  modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
  cwLogsLogGroups: [
    "ApiLogGroup", "/aws/ecs/containerinsights/EcsAppCluster/performance"
  ],
  cwLogsInsightQuery: "fields @message | limit 100",
  databaseName: "athenadatacatalog",
  albAccessLogTableName: "alb_access_logs",
  cloudTrailLogTableName: "cloud_trail_logs",
  xrayTrace: true,
  topicArn:
    "arn:aws:sns:us-east-1:123456789012:ExampleTopic",
};
```

#### パラメータの説明

| パラメータ               | 値の例                                                                    | 概要                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env.account`            | `"123456789012"`                                                          | デプロイ先 AWS アカウントのアカウント ID                                                                                                                                   |
| `env.region`             | `"us-east-1"`                                                             | デプロイ先リージョン                                                                                                                                                       |
| `language`               | `"ja"`                                                                    | プロンプトや UI の言語設定。`en` または `ja` のどちらかを指定します                                                                                                        |
| `envName`                | `"Development"`                                                           | 環境名。`Development` や `Staging` など                                                                                                                                    |
| `modelId`                | `"anthropic.claude-3-sonnet-20240229-v1:0"`                               | Amazon Bedrock で定義されたモデル ID を指定します。モデルアクセスで許可しているものを指定してください                                                                      |
| `cwLogsLogGroups`        | `["ApiLogGroup", "/aws/ecs/containerinsights/EcsAppCluster/performance"]` | ログを取得したい Amazon CloudWatch Logs のロググループを指定します。最大 50 個まで指定可能です                                                                             |
| `cwLogsInsightQuery`     | `"fields @message \| limit 100"`                                          | CloudWatch Logs Insight で利用したいクエリを指定します。コンテキストウィンドウとの兼ね合いから、デフォルトでは、100 件に制限する（実際のプロンプトに応じて、調整ください） |
| `databaseName`           | `"athenadatacatalog"`                                                     | Amazon Athena のデータベース名。Athena を使ってログ検索を行いたい場合は必須です                                                                                            |
| `albAccessLogTableName`  | `"alb_access_logs"`                                                       | ALB のアクセスログのテーブル名。今回のサンプルでは、Athena で ALB のアクセスログのログ検索を実装したため、利用する場合 ALB のアクセスログテーブル名を指定します            |
| `cloudTrailLogTableName` | `"cloud_trail_logs"`                                                      | AWS CloudTrail のログのテーブル名。今回のサンプルでは、Athena で CloudTrail の監査ログのログ検索を実装したため、利用する場合 CloudTrail のログテーブル名を指定します       |
| `xrayTrace`              | `true`                                                                    | 分析対象に AWS X-Ray のトレース情報を含めるかどうか決めるためのパラメータ                                                                                                  |
| `topicArn`               | `"arn:aws:sns:us-east-1:123456789012:ExampleTopic"`                       | AWS Chatbot にイベントを渡している Amazon SNS の Topic の ARN。ClientType が `AWSCHATBOT` の場合必須です                                                                   |

### CDK デプロイ

通常の CDK のデプロイと同じようにデプロイする

```
$ npm install
$ npx cdk bootstrap --profile {your_profile}
$ npx cdk deploy --all --profile {your_profile} --require-approval never
```

### Custom Action の設定

1. CDK デプロイ後に、デプロイした Lambda 関数の名前を確認してください
2. AWS Chatbot の通知にある、３点リーダをクリックします

   ![fa2-customaction-start](./docs/images/ja/fa2-customaction-start.png)

3. [Create a new custom action button] の [Create] をクリックします

   ![fa2-customaction-create](./docs/images/ja/fa2-customaction-create.png)

4. [Custom action name] に [FA2] 、 [Custom action button text] と [FA2] とそれぞれ入力し、 [Custom action type] では [CLI action] を選択し [Next] をクリックします

   ![fa2-customaction-step1](./docs/images/ja/fa2-customaction-step1.png)

5. [Define CLI command] に以下のスクリプトの Lambda 関数名とリージョンをデプロイしたものに書き換えた上で、コピー＆ペーストします
   ```
   lambda invoke --function-name {デプロイしたLambda関数の名前} --payload {
     "startDate" : "$startDate",
     "endDate": "$endDate",
     "errorDescription": "$errorDescription",
     "alarmName": "$MetricAlarmName",
     "alarmTimestamp": "$Timestamp"
   } --region {デプロイ先リージョン} --invocation-type Event
   ```
   ![fa2-customaction-step2](./docs/images/ja/fa2-customaction-step2.png)
6. [Display criteria] は変更せず、そのまま [Save] をクリックします
   ![fa2-customaction-step3](./docs/images/ja/fa2-customaction-step3.png)
7. **AWS Chatbot が次から送信する通知**には、作成した [FA2] の Custom Action がボタンとして表示されます
   ![fa2-customaction-button](./docs/images/ja/fa2-customaction-button.png)

## テスト

1. 表示されたアラームの中にある [FA2] ボタンをクリックします
2. フォームが表示されるので、次の画像のように入力します

   1. `startDate`, `endDate`はそれぞれ`ISO 8601`の形式で`UTC`で入力します (`ISO 8601` 形式: yyyy-mm-ddThh:mm:ssZ)
   2. `errorDescription` は、アラームの概要を入力します
   3. `alarmName`と`alarmTimestamp`はそのままで、[Next]をクリックします

      ![fa2-customaction-input](./docs/images/ja/fa2-customaction-input.png)

3. 入力内容の確認がされるので、[Run]をクリックします

   ![fa2-customaction-confirm](./docs/images/ja/fa2-customaction-confirm.png)

4. リクエストが受け付けられると、スレッドに次のような返信が返ります

   ![fa2-customaction-ack](./docs/images/ja/fa2-customaction-ack.png)

5. 少し時間が経つと、Slack へ回答が返ります

   ![fa2-customaction-answer](./docs/images/ja/fa2-customaction-answer.png)

## リソースの削除

以下のコマンドを実行し、デプロイしたリソースを削除してください。

```
$ npx cdk destroy --profile {your_profile}
```


## Amazon Bedrock 利用に向けた検討事項

Amazon Bedrock では、モデルへのアクセスのログを取得することができます。
ログを取得したい場合、[モデル呼び出しのログ記録](https://docs.aws.amazon.com/ja_jp/bedrock/latest/userguide/model-invocation-logging.html)を参考に、ログの設定を行ってください。

また、Amazon Bedrock のモデルの入出力をフィルタリングすることも可能です。
ログに機密情報が含まれる場合、[Amazon Bedrock のガードレール](https://docs.aws.amazon.com/ja_jp/bedrock/latest/userguide/guardrails.html)を用いて、モデルへの入出力をフィルタリングできますので、合わせてご検討ください。

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.
