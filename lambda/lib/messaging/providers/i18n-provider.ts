/**
 * サポートされている言語の型定義
 */
export type Language = "en" | "ja";

/**
 * 翻訳キーの型定義
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
  | "generatedHypothesesTitle"
  | "confidenceLabel"
  | "reasoningLabel"
  | "startingHypothesisVerification"
  | "verifyingHypothesis"
  | "thinkingStateMessage"
  | "actingStateMessage"
  | "observingStateMessage"
  | "executingTool";

/**
 * 国際化（i18n）プロバイダークラス
 * 言語に応じた翻訳を提供する
 */
export class I18nProvider {
  /** 現在の言語設定 */
  private readonly language: Language;
  
  /** 翻訳データ */
  private readonly translations: Record<Language, Record<TranslationKey, string>>;
  
  /**
   * コンストラクタ
   * @param language 言語設定（デフォルトは英語）
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
        generatedHypothesesTitle: "Generated Hypotheses",
        confidenceLabel: "Confidence",
        reasoningLabel: "Reasoning",
        startingHypothesisVerification: "Starting hypothesis verification...",
        verifyingHypothesis: "Verifying hypothesis",
        thinkingStateMessage: "Thinking about how to verify this hypothesis...",
        actingStateMessage: "Executing a tool to gather evidence...",
        observingStateMessage: "Analyzing the results...",
        executingTool: "Executing tool"
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
        generatedHypothesesTitle: "生成された仮説一覧",
        confidenceLabel: "信頼度",
        reasoningLabel: "根拠",
        startingHypothesisVerification: "仮説の検証を開始します...",
        verifyingHypothesis: "仮説を検証中",
        thinkingStateMessage: "この仮説を検証する方法を考えています...",
        actingStateMessage: "証拠を収集するためにツールを実行しています...",
        observingStateMessage: "結果を分析しています...",
        executingTool: "実行中のツール"
      }
    };
  }
  
  /**
   * 指定されたキーに対応する翻訳を取得する
   * @param key 翻訳キー
   * @returns 翻訳されたテキスト
   */
  translate(key: TranslationKey): string {
    return this.translations[this.language][key] || this.translations["en"][key] || key;
  }
  
  /**
   * 現在の言語設定を取得する
   * @returns 言語設定
   */
  getLanguage(): Language {
    return this.language;
  }
  
  /**
   * 言語に応じた条件分岐を行う
   * @param jaValue 日本語の場合の値
   * @param enValue 英語の場合の値
   * @returns 現在の言語に応じた値
   */
  ifJaElseEn<T>(jaValue: T, enValue: T): T {
    return this.language === "ja" ? jaValue : enValue;
  }
}
