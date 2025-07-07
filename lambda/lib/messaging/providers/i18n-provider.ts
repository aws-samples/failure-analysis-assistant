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
  | "maxCyclesReachedMessage";

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
        maxCyclesReachedMessage: "Maximum analysis cycles reached. Generating final answer based on current information."
      },
      ja: {
        errorMessage: "エラーが発生しました。システム管理者にご連絡ください。",
        uploadedFile: "ファイルをアップロードしました",
        defaultMessageText: "FA2からのメッセージ",
        howToGetLogsTitle: "ログやメトリクス、トレースの取得手順",
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
        maxCyclesReachedMessage: "最大分析サイクル数に達しました。現在の情報に基づいて最終回答を生成します。"
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
