import { AbstractTemplateProvider } from './abstract-template-provider.js';
import { MessageTemplate, FormTemplate, RetrieveResultItem, MessageBlock } from '../interfaces/template-provider.interface.js';
import { I18nProvider } from '../providers/i18n-provider.js';
import { ConfigProvider } from '../providers/config-provider.js';

/**
 * 汎用テンプレートプロバイダークラス
 * プラットフォームに依存しない抽象的なテンプレートを生成する
 */
export class GenericTemplateProvider extends AbstractTemplateProvider {
  /**
   * コンストラクタ
   * @param i18n 国際化プロバイダー
   * @param config 設定プロバイダー
   */
  constructor(i18n: I18nProvider, config: ConfigProvider) {
    super(i18n, config);
  }
  
  /**
   * フォームテンプレートを生成する
   * @param date 初期日付
   * @param time 初期時刻
   * @returns フォームテンプレート
   */
  createFormTemplate(date: string, time: string): FormTemplate {
    const blocks: MessageBlock[] = [
      {
        type: "section",
        text: this.i18n.translate("alarmDescription")
      },
      { type: "divider" },
      {
        type: "input",
        blockId: "error_description",
        label: this.i18n.translate("errorDescriptionLabel"),
        element: {
          type: "text_input",
          actionId: "error_description",
          placeholder: this.i18n.translate("errorDescriptionPlaceholder")
        }
      },
      {
        type: "input",
        blockId: "start_date",
        label: this.i18n.translate("startDateLabel"),
        element: {
          type: "datepicker",
          initialDate: date,
          actionId: "start_date"
        }
      },
      {
        type: "input",
        blockId: "start_time",
        label: this.i18n.translate("startTimeLabel"),
        element: {
          type: "timepicker",
          initialTime: time,
          actionId: "start_time"
        }
      },
      {
        type: "input",
        blockId: "end_date",
        label: this.i18n.translate("endDateLabel"),
        element: {
          type: "datepicker",
          initialDate: date,
          actionId: "end_date"
        }
      },
      {
        type: "input",
        blockId: "end_time",
        label: this.i18n.translate("endTimeLabel"),
        element: {
          type: "timepicker",
          initialTime: time,
          actionId: "end_time"
        }
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: this.i18n.translate("submitButtonText"),
            style: "primary",
            actionId: "submit_button",
            value: "submit"
          }
        ]
      }
    ];
    
    return {
      blocks,
      title: this.i18n.translate("formTitle"),
      submitLabel: this.i18n.translate("submitLabel")
    };
  }
  
  /**
   * コマンド実行フォームテンプレートを生成する
   * @returns フォームテンプレート
   */
  createCommandFormTemplate(): FormTemplate {
    const language = this.i18n.getLanguage();
    
    const blocks: MessageBlock[] = [
      {
        type: "input",
        blockId: "input_query",
        label: language === "ja" 
          ? "メトリクスからどのようなことを知りたいですか?"
          : "What do you want to know based on metrics?",
        element: {
          type: "text_input",
          actionId: "query",
          multiline: true,
          placeholder: language === "ja"
            ? "例：ECSのリソースは十分ですか？チューニングの必要があるか教えてください"
            : "Ex. Are ECS resources enough? Please let me know if the tuning is required for this workload."
        }
      },
      {
        type: "input",
        blockId: "input_duration",
        label: language === "ja"
          ? "メトリクスを取得する期間"
          : "Duration of getting metric data",
        element: {
          type: "select",
          placeholder: language === "ja"
            ? "期間を日単位で選択してください"
            : "Please select days to get metric data",
          actionId: "duration",
          options: this.createDurationOptions()
        }
      }
    ];
    
    return {
      blocks,
      title: language === "ja" ? "insightコマンドの実行" : "Invoke insight command",
      submitLabel: "Submit",
      callbackId: "view_insight"
    };
  }
  
  /**
   * メッセージテンプレートを生成する
   * @param message メッセージテキスト
   * @returns メッセージテンプレート
   */
  createMessageTemplate(message: string): MessageTemplate {
    return {
      blocks: [
        {
          type: "section",
          text: message
        }
      ]
    };
  }
  
  /**
   * エラーメッセージテンプレートを生成する
   * @returns エラーメッセージテンプレート
   */
  createErrorMessageTemplate(): MessageTemplate {
    return {
      blocks: [
        {
          type: "section",
          text: this.i18n.translate("errorMessage")
        }
      ]
    };
  }
  
  /**
   * 検索結果メッセージテンプレートを生成する
   * @param retrieveResults 検索結果アイテムの配列
   * @returns 検索結果メッセージテンプレート
   */
  createRetrieveResultTemplate(retrieveResults: RetrieveResultItem[]): MessageTemplate {
    const resultsText = retrieveResults.map(result => {
      return `[${result.index + 1}]${result.text}\n
  source: ${result.source}\n
  score:  (${result.score})\n`;
    }).join('');
    
    return {
      blocks: [
        {
          type: "section",
          text: `*${this.i18n.translate("retrievedDocumentsTitle")}*\n\n${resultsText}`
        }
      ]
    };
  }
  
  /**
   * 期間選択オプションを生成する
   * @returns 期間選択オプションの配列
   */
  private createDurationOptions(): Array<{ text: string; value: string }> {
    const language = this.i18n.getLanguage();
    const options = [];
    
    for (let i = 1; i <= 14; i++) {
      options.push({
        text: language === "ja" ? `${i}日` : `${i} Day${i > 1 ? 's' : ''}`,
        value: i.toString()
      });
    }
    
    return options;
  }
}
