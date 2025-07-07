import { AbstractTemplateProvider } from './abstract-template-provider.js';
import { MessageTemplate, FormTemplate, RetrieveResultItem, MessageBlock, RichTextElement } from '../interfaces/template-provider.interface.js';
import { I18nProvider } from '../providers/i18n-provider.js';
import { ConfigProvider } from '../providers/config-provider.js';
import { ToolAction, ToolExecutionRecord } from '../../react-agent.js';

/**
 * Generic template provider class
 * Generates platform-independent abstract templates
 */
export class GenericTemplateProvider extends AbstractTemplateProvider {
  /**
   * Constructor
   * @param i18n Internationalization provider
   * @param config Configuration provider
   */
  constructor(i18n: I18nProvider, config: ConfigProvider) {
    super(i18n, config);
  }
  
  /**
   * Generate form template
   * @param date Initial date
   * @param time Initial time
   * @returns Form template
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
   * Generate command execution form template
   * @returns Form template
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
   * Generate message template
   * @param message Message text
   * @returns Message template
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
   * Generate error message template
   * @returns Error message template
   */
  createErrorMessageTemplate(): MessageTemplate {
    return {
      blocks: [
        {
          type: "rich_text",
          elements: [
            {
              type: "rich_text_section",
              elements: [
                {
                  type: "emoji",
                  name: "warning"
                },
                {
                  type: "text",
                  text: " " + this.i18n.translate("errorMessage") + " ",
                  style: {
                    bold: true
                  }
                },
                {
                  type: "emoji",
                  name: "warning"
                }
              ]
            }
          ]
        }
      ]
    };
  }
  
  /**
   * Generate progress message template
   * @param stepAction Next action
   * @param currentHypothesis Current hypothesis
   * @param reactState ReActAgent state
   * @returns Progress message template
   */
  createProgressMessageTemplate(
    stepAction: string | undefined,
    reactState: {
      state: string;
      lastThinking?: string;
      lastAction?: ToolAction;
      lastObservation?: string;
      forcedCompletion?: boolean; // 追加: 強制完了フラグ
      toolExecutions?: ToolExecutionRecord[];
    }
  ): MessageTemplate {
    const elements: RichTextElement[] = [];


    // 現在の状態に基づいて適切なメッセージを生成
    switch (reactState.state) {
      case 'thinking':
        // observingの結果を表示
        if (reactState.lastObservation) {
          elements.push({
            type: "rich_text_section",
            elements: [
              {
                type: "text",
                text: reactState.lastObservation.length < 3000 ? reactState.lastObservation : `${reactState.lastObservation.substring(0,3000)}...`,
                style: {
                  italic: true
                }
              }
            ]
          });
        }

        elements.push({
          type: "rich_text_section",
          elements: [
            {
              type: "text",
              text: "\n" + this.i18n.translate("thinkingStateMessage"),
              style: {
                italic: true
              }
            }
          ]
        });
        break;
        
      case 'acting':
        // thinkingの結果を表示
        if (reactState.lastThinking) {
          const thoughtMatch = reactState.lastThinking.match(/<Thought>([\s\S]*?)<\/Thought>/);
          if (thoughtMatch) {
            const thoughtContent = thoughtMatch[1].trim();
            elements.push({
              type: "rich_text_section",
              elements: [
                {
                  type: "text",
                  text: thoughtContent,
                  style: {
                    italic: true
                  }
                }
              ]
            });
          }
        }
        

        elements.push({
          type: "rich_text_section",
          elements: [
            {
              type: "emoji",
              name: "gear"
            },
            {
              type: "text",
              text: " " + this.i18n.translate("actingStateMessage")
            }
          ]
        });
        break;
        
      case 'observing':
        // actingの結果を表示
        if (reactState.lastAction) {
          elements.push({
            type: "rich_text_section",
            elements: [
              {
                type: "text",
                text: "\n実行したツール: ",
                style: {
                  bold: true
                }
              },
              {
                type: "text",
                text: `"${reactState.lastAction.tool}"`,
                style: {
                  code: true
                }
              }
            ]
          });
          
          // パラメータ情報を追加
          elements.push({
            type: "rich_text_section",
            elements: [
              {
                type: "text",
                text: "\nパラメータ: ",
                style: {
                  bold: true
                }
              },
              {
                type: "text",
                text: JSON.stringify(reactState.lastAction.parameters, null, 2),
                style: {
                  code: true
                }
              }
            ]
          });
        }
        
        elements.push({
          type: "rich_text_section",
          elements: [
            {
              type: "emoji",
              name: "mag"
            },
            {
              type: "text",
              text: " " + this.i18n.translate("observingStateMessage")
            }
          ]
        });

        break;
        
      case 'completing':
        // 強制完了の場合のメッセージを先に追加
        if (reactState.forcedCompletion) {
          elements.push({
            type: "rich_text_section",
            elements: [
              {
                type: "emoji",
                name: "warning"
              },
              {
                type: "text",
                text: " " + this.i18n.translate("maxCyclesReachedMessage"),
                style: {
                  bold: true
                }
              }
            ]
          });
        }

        // 最終分析生成中のメッセージを追加
        elements.push({
          type: "rich_text_section",
          elements: [
            {
              type: "emoji",
              name: "hourglass_flowing_sand"
            },
            {
              type: "text",
              text: " " + this.i18n.translate("completingStateMessage"),
              style: {
                italic: true
              }
            }
          ]
        });
        
        // 最後の思考内容があれば表示
        if (reactState.lastThinking) {
          const thoughtMatch = reactState.lastThinking.match(/<FinalAnswer>([\s\S]*?)<\/FinalAnswer>/);
          if (thoughtMatch) {
            const thoughtContent = thoughtMatch[1].trim();
            elements.push({
              type: "rich_text_section",
              elements: [
                {
                  type: "text",
                  text: "\n最終的な分析:\n" + thoughtContent,
                  style: {
                    italic: true
                  }
                }
              ]
            });
          }
        }
        break;
    }

    // 基本的なステータスメッセージ
    elements.push({
      type: "rich_text_section",
      elements: [
        {
          type: "emoji",
          name: "hourglass_flowing_sand"
        },
        {
          type: "text",
          text: ` ${this.i18n.translate("analysisStepMessage")} - ${stepAction?.toUpperCase()})`,
          style: {
            bold: true
          }
        },
      ]
    });

    return {
      blocks: [
        {
          type: "rich_text",
          elements: elements
        }
      ]
    };
  }
  
  
  /**
   * Generate search result message template
   * @param retrieveResults Array of search result items
   * @returns Search result message template
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
   * Generate duration selection options
   * @returns Array of duration selection options
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
