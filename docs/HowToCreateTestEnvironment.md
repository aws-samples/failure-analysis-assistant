# FA２のお試し環境の作り方

FA2 を試してみたいが、既存環境に FA2 を導入するには開発環境であっても難しい、という方向けに、
お試しで FA2 を動かすためのワークロードをデプロイする方法として、[BaseLine Environment on AWS (BLEA)](https://github.com/aws-samples/baseline-environment-on-aws/tree/main) のリポジトリにある、 Amazon ECS や Amazon RDS で構成されるゲストアプリサンプルを利用した構築方法を記載します。

このゲストアプリサンプルでは、AWS Chatbot を利用したアラートの Slack 通知や、CloudWatch Syntheticsを利用した外形監視が実装されており、FA2 を利用するために必要な環境が揃います。

1. [BLEA](https://github.com/aws-samples/baseline-environment-on-aws/tree/main) を Clone する
2. Cloneしたリポジトリ内の、`baseline-environment-on-aws/usecases/blea-guest-ecs-app-sample/parameter.ts` を以下のように更新する

   ```
   export const devParameter: AppParameter = {
     env: {
       // account: '111111111111',
       region: 'ap-northeast-1', //  FA2をデプロイするリージョンに合わせてください
     },
     envName: 'Development',
     monitoringNotifyEmail: 'notify-security@example.com', // ご自身のメールアドレスなど、通知のメールが届いても良いメールアドレスを設定する
     monitoringSlackWorkspaceId: 'TXXXXXXXXXX', // ご自身のSlackのワークスペースIDを設定する
     monitoringSlackChannelId: 'CYYYYYYYYYY', // ご自身のSlackのワークスペースにある、通知を飛ばしたいチャンネルのチャンネルIDを設定する
     vpcCidr: '10.100.0.0/16', // 変更したい場合のみ、変更してください
     dashboardName: 'BLEA-ECS-App-Sample', // 変更したい場合のみ、変更してください

     // カスタムドメインは利用しないため、そのままで問題ありません
     // -- Sample to use custom domain on CloudFront
     // hostedZoneId: 'Z00000000000000000000',
     // domainName: 'example.com',
     // cloudFrontHostName: 'www',
   };
   ```

3. `baseline-environment-on-aws/usecases/blea-guest-ecs-app-sample/lib/constructs/canary.ts` の`CanaryFailedAlarm`の`datapointsToAlarm`の値を`1`に更新する
   1. この変更により、ECS タスクを強制終了させた時に、アラーム状態に移行しやすくなります
4. CDK のデプロイを行う
   1. `$ cd baseline-environment-on-aws/usecases/blea-guest-ecs-app-sample`
   2. `$ npm install`
   3. `$ npx cdk bootstrap --profile {profile_name}`
   4. `$ npx cdk deploy --all --profile {profile_name}`
5. 稼働している ECS タスクを全て強制的に終了し、Slack にアラートが来るか確認します。アラートが来れば設定完了です
6. FA2 をデプロイした後に再度アラートを発生させ、FA2 による障害分析をお試しください。

## 注意事項

デプロイ時に `Invalid request provided: Deprecated runtime version specified` というエラーが表示された場合、`Canary` で利用している `puppeteer` のランタイムのバージョンが古いです。
`baseline-environment-on-aws/usecases/blea-guest-ecs-app-sample/lib/constructs/canary.ts` の `runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_6_0,` を利用可能なバージョンに変更してください。
利用可能なバージョンの情報は、[Node.js と Puppeteer を使用するランタイムバージョン](https://docs.aws.amazon.com/ja_jp/AmazonCloudWatch/latest/monitoring/CloudWatch_Synthetics_Library_nodejs_puppeteer.html) を参照ください。