/**
 * Type definition for supported languages
 */
export type Language = "en" | "ja";

/**
 * Type definition for translation keys
 */
export type TranslationKey =
  | "errorMessage"
  | "uploadedFile"
  | "defaultMessageText"
  | "howToGetLogsTitle"
  | "formTitle"
  | "submitLabel"
  | "alarmDescription"
  | "errorDescriptionLabel"
  | "errorDescriptionPlaceholder"
  | "startDateLabel"
  | "startTimeLabel"
  | "endDateLabel"
  | "endTimeLabel"
  | "submitButtonText"
  | "retrievedDocumentsTitle"
  | "analysisCompleteMessage"
  | "analysisStartMessage"
  | "analysisStepMessage"
  | "analysisErrorMessage"
  | "thinkingStateMessage"
  | "actingStateMessage"
  | "observingStateMessage"
  | "executingTool"
  | "withParameters"
  | "completingStateMessage"
  | "maxCyclesReachedMessage"
  | "insightQueryLabel"
  | "insightQueryPlaceholder"
  | "insightDurationLabel"
  | "insightDurationPlaceholder"
  | "insightCommandTitle"
  | "executedToolLabel"
  | "parametersLabel"
  | "finalAnalysisLabel"
  | "auditLogTableNotConfigured"
  | "auditLogQueryError"
  | "auditLogNoResults"
  | "auditLogNoLogsFound"
  | "auditLogAnalysisTitle"
  | "auditLogTotalFound"
  | "auditLogServiceCountTitle"
  | "auditLogServiceCount"
  | "auditLogErrorsTitle"
  | "auditLogErrorDetail"
  | "auditLogImportantTitle"
  | "auditLogImportantDetail"
  | "auditLogTimelineTitle"
  | "auditLogFirstLog"
  | "auditLogLastLog"
  | "albLogTableNotConfigured"
  | "albLogQueryError"
  | "albLogNoResults"
  | "albLogNoLogsFound"
  | "albLogAnalysisTitle"
  | "albLogTotalFound"
  | "albLogStatusCodeTitle"
  | "albLogStatusCodeCount"
  | "albLogErrorsTitle"
  | "albLogErrorDetail"
  | "albLogPopularPathsTitle"
  | "albLogPathCount"
  | "albLogResponseTimeTitle"
  | "albLogAvgResponseTime"
  | "albLogMaxResponseTime"
  | "albLogMinResponseTime"
  | "albLogTimelineTitle"
  | "albLogFirstRequest"
  | "albLogLastRequest"
  | "kbDisabled"
  | "kbIdNotConfigured"
  | "kbNotFound"
  | "kbAccessDenied"
  | "kbNoMatchingDocuments"
  | "kbQueryError"
  | "kbNoResults"
  | "kbResultsTitle"
  | "kbTotalFound"
  | "kbDocumentTitle"
  | "kbDocumentScore"
  | "kbDocumentSource"
  | "kbNoText"
  | "logsGroupsNotConfigured"
  | "logsFixedFilterNote"
  | "logsInvalidFilterPattern"
  | "logsQueryError"
  | "logsNoResults"
  | "logsResultsTitle"
  | "logsTotalFound"
  | "logsErrorLogsTitle"
  | "logsMoreErrorLogs"
  | "logsTimelineTitle"
  | "logsFirstLog"
  | "logsLastLog"
  | "logsDuration"
  | "logsDurationNotCalculable"
  | "logsSamplesTitle"
  | "metricsNoResults"
  | "metricsResultsTitle"
  | "metricsGenericLabel"
  | "metricsNoDataPoints"
  | "metricsDataPointCount"
  | "metricsMinValue"
  | "metricsMaxValue"
  | "metricsAvgValue"
  | "metricsAnomalyDetection"
  | "xrayDisabled"
  | "xrayNoTraces"
  | "xrayQueryError"
  | "xrayNoResults"
  | "xrayResultsTitle"
  | "xrayTotalFound"
  | "xrayErrorTracesTitle"
  | "xrayTraceId"
  | "xrayStartTime"
  | "xrayResponseTime"
  | "xrayStatus"
  | "xrayErrorCauses"
  | "xrayUnknown"
  | "xrayUnknownError"
  | "xrayMoreErrorTraces"
  | "xraySlowestTracesTitle"
  | "xrayTraceIdLine"
  | "xrayResponseTimeLine"
  | "xrayStartTimeLine"
  | "xrayUrlLine"
  | "xrayMethodLine"
  | "xrayServiceStatsTitle"
  | "xrayRequestCount"
  | "xrayErrorCount"
  | "xrayAvgResponseTime"
  | "requestAccepted"
  | "requestParameters"
  | "dmNotAllowed"
  | "channelIdNotFound"
  | "insightConfirmation"
  | "findingsReportConfirmation";

/**
 * Internationalization (i18n) provider class
 * Provides translations according to language settings
 */
export class I18nProvider {
  /** Current language setting */
  private readonly language: Language;
  
  /** Translation data */
  private readonly translations: Record<Language, Record<TranslationKey, string>>;
  
  /**
   * Constructor
   * @param language Language setting (default is English)
   */
  constructor(language: Language = "en") {
    this.language = language;
    this.translations = {
      en: {
        errorMessage: "Error: Please contact your system admin.",
        uploadedFile: "Uploaded a file.",
        defaultMessageText: "Message from FA2",
        howToGetLogsTitle: "How to Get..",
        albLogTableNotConfigured: "ALB log table is not configured. Please check albLogTableName in parameter.ts.",
        albLogQueryError: "Error occurred while retrieving ALB logs: ",
        albLogNoResults: "No ALB logs matching the criteria were found.",
        albLogNoLogsFound: "No ALB logs were found.",
        albLogAnalysisTitle: "## ALB Access Log Analysis Results\n\n",
        albLogTotalFound: "Total of {0} ALB logs found.\n\n",
        albLogStatusCodeTitle: "### Status Code Distribution\n\n",
        albLogStatusCodeCount: "- Status {0}: {1} requests\n",
        albLogErrorsTitle: "### Error Requests ({0})\n\n",
        albLogErrorDetail: "- **{0}**: {1} {2} - Status: {3}, Target Status: {4}\n  Client IP: {5}\n\n",
        albLogPopularPathsTitle: "### Popular Request Paths\n\n",
        albLogPathCount: "- {0}: {1} requests\n",
        albLogResponseTimeTitle: "### Response Time Analysis\n\n",
        albLogAvgResponseTime: "- Average response time: {0}s\n",
        albLogMaxResponseTime: "- Maximum response time: {0}s\n",
        albLogMinResponseTime: "- Minimum response time: {0}s\n\n",
        albLogTimelineTitle: "### Timeline Distribution\n\n",
        albLogFirstRequest: "- First request: {0} ({1} {2})\n",
        albLogLastRequest: "- Last request: {0} ({1} {2})\n",
        requestAccepted: "Received your request. Please wait...",
        requestParameters: "Input parameters: ",
        dmNotAllowed: "This command cannot be executed in DMs. Please run it in a channel.",
        channelIdNotFound: "Error: Channel ID not found. Please run the /insight-dev command in a channel.",
        insightConfirmation: "FA2 received your question: {0} with the metric data of {1} days. Please wait for its answer..",
        findingsReportConfirmation: "FA2 received your request to create a report of findings. Please wait for its answer..",
        formTitle: "Error Analysis",
        submitLabel: "Submit",
        alarmDescription: "Please put time range to get the logs that may includes root cause.",
        errorDescriptionLabel: "The description of the error notification (alarm)",
        errorDescriptionPlaceholder: "Ex: It is an monitoring alarm, and the number of errors has exceeded the specified number.",
        startDateLabel: "Start date to get the logs",
        startTimeLabel: "Start time to get the logs",
        endDateLabel: "End date to get the logs",
        endTimeLabel: "End time to get the logs",
        submitButtonText: "SUBMIT",
        retrievedDocumentsTitle: "The following documents are retrieved:",
        analysisCompleteMessage: "Failure analysis completed",
        analysisStartMessage: "Starting failure analysis.",
        analysisStepMessage: "Analyzing... (Step ",
        analysisErrorMessage: "If you want to retry it, you send same request again from below form.",
        thinkingStateMessage: "Thinking about next steps...",
        actingStateMessage: "Executing a tool to gather evidence...",
        observingStateMessage: "Analyzing the results...",
        executingTool: "Executing tool",
        withParameters: "Tool parameters: ",
        completingStateMessage: "Generating final analysis...",
        maxCyclesReachedMessage: "Maximum analysis cycles reached. Generating final answer based on current information.",
        insightQueryLabel: "What do you want to know based on metrics?",
        insightQueryPlaceholder: "Ex. Are ECS resources enough? Please let me know if the tuning is required for this workload.",
        insightDurationLabel: "Duration of getting metric data",
        insightDurationPlaceholder: "Please select days to get metric data",
        insightCommandTitle: "Invoke insight command",
        executedToolLabel: "\nExecuted tool: ",
        parametersLabel: "\nParameters: ",
        finalAnalysisLabel: "\nFinal analysis:\n",
        auditLogTableNotConfigured: "CloudTrail log table is not configured. Please check cloudTrailLogTableName in parameter.ts.",
        auditLogQueryError: "Error occurred while retrieving change history: ",
        auditLogNoResults: "No audit logs matching the criteria were found.",
        auditLogNoLogsFound: "No audit logs were found.",
        auditLogAnalysisTitle: "## Audit Log Analysis Results\n\n",
        auditLogTotalFound: "Total of {0} audit logs found.\n\n",
        auditLogServiceCountTitle: "### Audit Logs by Service\n\n",
        auditLogServiceCount: "- {0}: {1} logs\n",
        auditLogErrorsTitle: "### Audit Logs with Errors ({0})\n\n",
        auditLogErrorDetail: "- **{0}**: {1} - {2}\n  Error: {3} - {4}\n\n",
        auditLogImportantTitle: "### Important Audit Logs\n\n",
        auditLogImportantDetail: "- **{0}**: {1} - {2}\n  Region: {3}, Source IP: {4}\n\n",
        auditLogTimelineTitle: "### Timeline Distribution\n\n",
        auditLogFirstLog: "- First audit log: {0} ({1} - {2})\n",
        auditLogLastLog: "- Last audit log: {0} ({1} - {2})\n",
        kbDisabled: "Knowledge Base is currently disabled. Please set knowledgeBase to true in parameter.ts.",
        kbIdNotConfigured: "Knowledge Base ID is not configured. Please check if KnowledgeBaseStack is deployed correctly.",
        kbNotFound: "The specified Knowledge Base ({0}) was not found. Please check if KnowledgeBaseStack is deployed correctly.",
        kbAccessDenied: "Access denied to Knowledge Base ({0}). Please check your IAM policy.",
        kbNoMatchingDocuments: "No documents matching \"{0}\" were found.",
        kbQueryError: "Error occurred while searching from Knowledge Base: {0}",
        kbNoResults: "No documents matching the criteria were found.",
        kbResultsTitle: "## Knowledge Base Search Results\n\n",
        kbTotalFound: "Total of {0} documents found.\n\n",
        kbDocumentTitle: "### Document {0}\n\n",
        kbDocumentScore: "- Score: {0}\n",
        kbDocumentSource: "- Source: {0}\n\n",
        kbNoText: "No text",
        logsGroupsNotConfigured: "Log groups are not configured. Please check cwLogsLogGroups in parameter.ts.",
        logsFixedFilterNote: "\n\n**Note: The original filter pattern had issues and was fixed. Fixed pattern: `{0}`**",
        logsInvalidFilterPattern: "Invalid filter pattern syntax: {0}\n\nExamples of valid filter pattern syntax:\n- `@message like 'error'`\n- `@message like /Exception/`\n- `@message like 'error' and @timestamp > '2023-01-01'`\n\nFor more details, see the CloudWatch Logs Insights query syntax documentation: https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html",
        logsQueryError: "Error occurred while retrieving logs: {0}",
        logsNoResults: "No logs matching the criteria were found.",
        logsResultsTitle: "## Log Analysis Results\n\n",
        logsTotalFound: "Total of {0} logs found.\n\n",
        logsErrorLogsTitle: "### Error Logs ({0})\n\n",
        logsMoreErrorLogs: "_There are {0} more error logs._\n\n",
        logsTimelineTitle: "### Timeline Distribution\n\n",
        logsFirstLog: "- First log: {0}\n",
        logsLastLog: "- Last log: {0}\n",
        logsDuration: "- Duration: {0} milliseconds\n\n",
        logsDurationNotCalculable: "- Duration: Not calculable\n\n",
        logsSamplesTitle: "### Representative Log Samples\n\n",
        metricsNoResults: "No metrics data found.",
        metricsResultsTitle: "## Metrics Analysis Results\n\n",
        metricsGenericLabel: "Metric {0}",
        metricsNoDataPoints: "No data points available.\n\n",
        metricsDataPointCount: "- Data points: {0}\n",
        metricsMinValue: "- Minimum: {0}\n",
        metricsMaxValue: "- Maximum: {0}\n",
        metricsAvgValue: "- Average: {0}\n",
        metricsAnomalyDetection: "\n**Anomaly Detection** (values deviating more than 2 standard deviations):\n",
        xrayDisabled: "X-Ray trace is currently disabled. Please set xrayTrace to true in parameter.ts.",
        xrayNoTraces: "No X-Ray traces found for the specified period.",
        xrayQueryError: "Error occurred while retrieving X-Ray traces: {0}",
        xrayNoResults: "No X-Ray traces matching the criteria were found.",
        xrayResultsTitle: "## X-Ray Analysis Results\n\n",
        xrayTotalFound: "Total of {0} traces found.\n\n",
        xrayErrorTracesTitle: "### Traces with Errors ({0})\n\n",
        xrayTraceId: "#### Trace ID: {0}\n",
        xrayStartTime: "- Start time: {0}\n",
        xrayResponseTime: "- Response time: {0}ms\n",
        xrayStatus: "- Status: {0}\n",
        xrayErrorCauses: "- Error causes:\n",
        xrayUnknown: "Unknown",
        xrayUnknownError: "Unknown error",
        xrayMoreErrorTraces: "_There are {0} more error traces._\n\n",
        xraySlowestTracesTitle: "### Slowest Traces\n\n",
        xrayTraceIdLine: "- Trace ID: {0}\n",
        xrayResponseTimeLine: "  - Response time: {0}ms\n",
        xrayStartTimeLine: "  - Start time: {0}\n",
        xrayUrlLine: "  - URL: {0}\n",
        xrayMethodLine: "  - Method: {0}\n\n",
        xrayServiceStatsTitle: "### Service Statistics\n\n",
        xrayRequestCount: "- Request count: {0}\n",
        xrayErrorCount: "- Error count: {0} ({1}%)\n",
        xrayAvgResponseTime: "- Average response time: {0}ms\n\n"
      },
      ja: {
        errorMessage: "エラーが発生しました。システム管理者にご連絡ください。",
        uploadedFile: "ファイルをアップロードしました",
        defaultMessageText: "FA2からのメッセージ",
        howToGetLogsTitle: "ログやメトリクス、トレースの取得手順",
        albLogTableNotConfigured: "ALBログテーブルが設定されていません。parameter.tsのalbLogTableNameを確認してください。",
        albLogQueryError: "ALBログの取得中にエラーが発生しました: ",
        albLogNoResults: "条件に一致するALBログが見つかりませんでした。",
        albLogNoLogsFound: "ALBログが見つかりませんでした。",
        albLogAnalysisTitle: "## ALBアクセスログ分析結果\n\n",
        albLogTotalFound: "合計 {0} 件のALBログが見つかりました。\n\n",
        albLogStatusCodeTitle: "### ステータスコード別分布\n\n",
        albLogStatusCodeCount: "- ステータス {0}: {1}件\n",
        albLogErrorsTitle: "### エラーリクエスト ({0}件)\n\n",
        albLogErrorDetail: "- **{0}**: {1} {2} - ステータス: {3}, ターゲットステータス: {4}\n  クライアントIP: {5}\n\n",
        albLogPopularPathsTitle: "### 人気のリクエストパス\n\n",
        albLogPathCount: "- {0}: {1}件\n",
        albLogResponseTimeTitle: "### レスポンスタイム分析\n\n",
        albLogAvgResponseTime: "- 平均レスポンスタイム: {0}秒\n",
        albLogMaxResponseTime: "- 最大レスポンスタイム: {0}秒\n",
        albLogMinResponseTime: "- 最小レスポンスタイム: {0}秒\n\n",
        albLogTimelineTitle: "### 時系列分布\n\n",
        albLogFirstRequest: "- 最初のリクエスト: {0} ({1} {2})\n",
        albLogLastRequest: "- 最後のリクエスト: {0} ({1} {2})\n",
        requestAccepted: "リクエストを受け付けました。分析完了までお待ちください。",
        requestParameters: "リクエスト内容: ",
        dmNotAllowed: "このコマンドはDMでは実行できません。チャンネル内で実行してください。",
        channelIdNotFound: "エラー: チャンネルIDが取得できませんでした。チャンネル内で/insight-devコマンドを実行してください。",
        insightConfirmation: "質問：{0}を、{1}日分のメトリクスで確認します。FA2の回答をお待ちください。",
        findingsReportConfirmation: "Findingsのレポート作成依頼を受け付けました。FA2の回答をお待ちください。",
        formTitle: "エラー分析",
        submitLabel: "送信",
        alarmDescription: "ログ検索を行う時刻の範囲を以下のフォームから入力してください。アラームのDatapointを参考に入力いただくと、比較的良い結果が得られやすいです。",
        errorDescriptionLabel: "エラーの通知（アラーム）の内容",
        errorDescriptionPlaceholder: "例：外形監視のアラームで、エラー回数が規定以上になっています。",
        startDateLabel: "ログ取得の開始日",
        startTimeLabel: "ログ取得の開始時刻",
        endDateLabel: "ログ取得の終了日",
        endTimeLabel: "ログ取得の終了時刻",
        submitButtonText: "根本源因の分析を行う",
        retrievedDocumentsTitle: "以下のドキュメントを参照しました:",
        analysisCompleteMessage: "障害分析が完了しました",
        analysisStartMessage: "障害分析を開始しました。",
        analysisStepMessage: "# 分析中... (ステップ ",
        analysisErrorMessage: "リトライしたい場合は、以下のフォームからもう一度同じ内容のリクエストを送ってください。",
        thinkingStateMessage: "次のステップを考えています...",
        actingStateMessage: "証拠を収集するためにツールを実行しています...",
        observingStateMessage: "結果を分析しています...",
        executingTool: "実行中のツール",
        withParameters: "ツールのパラメータ: ",
        completingStateMessage: "最終分析を生成しています...",
        maxCyclesReachedMessage: "最大分析サイクル数に達しました。現在の情報に基づいて最終回答を生成します。",
        insightQueryLabel: "メトリクスからどのようなことを知りたいですか?",
        insightQueryPlaceholder: "例：ECSのリソースは十分ですか？チューニングの必要があるか教えてください",
        insightDurationLabel: "メトリクスを取得する期間",
        insightDurationPlaceholder: "期間を日単位で選択してください",
        insightCommandTitle: "insightコマンドの実行",
        executedToolLabel: "\n実行したツール: ",
        parametersLabel: "\nパラメータ: ",
        finalAnalysisLabel: "\n最終的な分析:\n",
        auditLogTableNotConfigured: "CloudTrailログテーブルが設定されていません。parameter.tsのcloudTrailLogTableNameを確認してください。",
        auditLogQueryError: "変更履歴の取得中にエラーが発生しました: ",
        auditLogNoResults: "条件に一致する監査ログが見つかりませんでした。",
        auditLogNoLogsFound: "監査ログが見つかりませんでした。",
        auditLogAnalysisTitle: "## 監査ログ分析結果\n\n",
        auditLogTotalFound: "合計 {0} 件の監査ログが見つかりました。\n\n",
        auditLogServiceCountTitle: "### サービス別監査ログ数\n\n",
        auditLogServiceCount: "- {0}: {1}件\n",
        auditLogErrorsTitle: "### エラーのあった監査ログ ({0}件)\n\n",
        auditLogErrorDetail: "- **{0}**: {1} - {2}\n  エラー: {3} - {4}\n\n",
        auditLogImportantTitle: "### 重要な監査ログ\n\n",
        auditLogImportantDetail: "- **{0}**: {1} - {2}\n  リージョン: {3}, ソースIP: {4}\n\n",
        auditLogTimelineTitle: "### 時系列分布\n\n",
        auditLogFirstLog: "- 最初の監査ログ: {0} ({1} - {2})\n",
        auditLogLastLog: "- 最後の監査ログ: {0} ({1} - {2})\n",
        kbDisabled: "Knowledge Baseは現在無効になっています。parameter.tsのknowledgeBaseをtrueに設定してください。",
        kbIdNotConfigured: "Knowledge Base IDが設定されていません。KnowledgeBaseStackが正しくデプロイされているか確認してください。",
        kbNotFound: "指定されたKnowledge Base ({0}) が見つかりません。KnowledgeBaseStackが正しくデプロイされているか確認してください。",
        kbAccessDenied: "Knowledge Base ({0}) へのアクセス権限がありません。IAMポリシーを確認してください。",
        kbNoMatchingDocuments: "\"{0}\" に一致するドキュメントが見つかりませんでした。",
        kbQueryError: "Knowledge Baseからの検索中にエラーが発生しました: {0}",
        kbNoResults: "条件に一致するドキュメントが見つかりませんでした。",
        kbResultsTitle: "## Knowledge Base検索結果\n\n",
        kbTotalFound: "合計 {0} 件のドキュメントが見つかりました。\n\n",
        kbDocumentTitle: "### ドキュメント {0}\n\n",
        kbDocumentScore: "- スコア: {0}\n",
        kbDocumentSource: "- ソース: {0}\n\n",
        kbNoText: "テキストなし",
        logsGroupsNotConfigured: "ロググループが設定されていません。parameter.tsのcwLogsLogGroupsを確認してください。",
        logsFixedFilterNote: "\n\n**注: 元のフィルターパターンに問題があったため、修正して実行しました。修正後のパターン: `{0}`**",
        logsInvalidFilterPattern: "フィルターパターンの構文が無効です: {0}\n\n有効なフィルターパターン構文の例:\n- `@message like 'error'`\n- `@message like /Exception/`\n- `@message like 'error' and @timestamp > '2023-01-01'`\n\n詳細はCloudWatch Logs Insightsクエリ構文のドキュメントを参照してください: https://docs.aws.amazon.com/ja_jp/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html",
        logsQueryError: "ログの取得中にエラーが発生しました: {0}",
        logsNoResults: "条件に一致するログが見つかりませんでした。",
        logsResultsTitle: "## ログ分析結果\n\n",
        logsTotalFound: "合計 {0} 件のログが見つかりました。\n\n",
        logsErrorLogsTitle: "### エラーログ ({0} 件)\n\n",
        logsMoreErrorLogs: "_他 {0} 件のエラーログがあります。_\n\n",
        logsTimelineTitle: "### 時系列分布\n\n",
        logsFirstLog: "- 最初のログ: {0}\n",
        logsLastLog: "- 最後のログ: {0}\n",
        logsDuration: "- 期間: {0}ミリ秒\n\n",
        logsDurationNotCalculable: "- 期間: 計算できません\n\n",
        logsSamplesTitle: "### 代表的なログサンプル\n\n",
        metricsNoResults: "メトリクスデータが見つかりませんでした。",
        metricsResultsTitle: "## メトリクス分析結果\n\n",
        metricsGenericLabel: "メトリクス {0}",
        metricsNoDataPoints: "データポイントがありません。\n\n",
        metricsDataPointCount: "- データポイント数: {0}\n",
        metricsMinValue: "- 最小値: {0}\n",
        metricsMaxValue: "- 最大値: {0}\n",
        metricsAvgValue: "- 平均値: {0}\n",
        metricsAnomalyDetection: "\n**異常値検出** (標準偏差の2倍以上外れた値):\n",
        xrayDisabled: "X-Rayトレースは現在無効になっています。parameter.tsのxrayTraceをtrueに設定してください。",
        xrayNoTraces: "指定された期間にX-Rayトレースが見つかりませんでした。",
        xrayQueryError: "X-Rayトレースの取得中にエラーが発生しました: {0}",
        xrayNoResults: "条件に一致するX-Rayトレースが見つかりませんでした。",
        xrayResultsTitle: "## X-Ray分析結果\n\n",
        xrayTotalFound: "合計 {0} 件のトレースが見つかりました。\n\n",
        xrayErrorTracesTitle: "### エラーのあるトレース ({0}件)\n\n",
        xrayTraceId: "#### トレースID: {0}\n",
        xrayStartTime: "- 開始時刻: {0}\n",
        xrayResponseTime: "- 応答時間: {0}ms\n",
        xrayStatus: "- ステータス: {0}\n",
        xrayErrorCauses: "- エラー原因:\n",
        xrayUnknown: "不明",
        xrayUnknownError: "不明なエラー",
        xrayMoreErrorTraces: "_他 {0} 件のエラートレースがあります。_\n\n",
        xraySlowestTracesTitle: "### 最も遅いトレース\n\n",
        xrayTraceIdLine: "- トレースID: {0}\n",
        xrayResponseTimeLine: "  - 応答時間: {0}ms\n",
        xrayStartTimeLine: "  - 開始時刻: {0}\n",
        xrayUrlLine: "  - URL: {0}\n",
        xrayMethodLine: "  - メソッド: {0}\n\n",
        xrayServiceStatsTitle: "### サービス別統計\n\n",
        xrayRequestCount: "- リクエスト数: {0}\n",
        xrayErrorCount: "- エラー数: {0} ({1}%)\n",
        xrayAvgResponseTime: "- 平均応答時間: {0}ms\n\n"
      }
    };
  }
  
  /**
   * Get translation for the specified key
   * @param key Translation key
   * @returns Translated text
   */
  translate(key: TranslationKey): string {
    return this.translations[this.language][key] || this.translations["en"][key] || key;
  }
  
  /**
   * Format translation with parameters
   * @param key Translation key
   * @param args Arguments to replace placeholders in the translation
   * @returns Formatted translation text
   */
  formatTranslation(key: TranslationKey, ...args: (string | number | boolean)[]): string {
    const template = this.translate(key);
    return template.replace(/{(\d+)}/g, (match, index) => {
      return args[index] !== undefined ? String(args[index]) : match;
    });
  }
  
  /**
   * Get current language setting
   * @returns Language setting
   */
  getLanguage(): Language {
    return this.language;
  }
  
  /**
   * Conditional branching based on language
   * @param jaValue Value for Japanese
   * @param enValue Value for English
   * @returns Value according to current language
   */
  ifJaElseEn<T>(jaValue: T, enValue: T): T {
    return this.language === "ja" ? jaValue : enValue;
  }
}
