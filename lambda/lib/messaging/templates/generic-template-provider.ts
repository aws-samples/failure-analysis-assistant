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
    const blocks: MessageBlock[] = [
      {
        type: "input",
        blockId: "input_query",
        label: this.i18n.translate("insightQueryLabel"),
        element: {
          type: "text_input",
          actionId: "query",
          multiline: true,
          placeholder: this.i18n.translate("insightQueryPlaceholder")
        }
      },
      {
        type: "input",
        blockId: "input_duration",
        label: this.i18n.translate("insightDurationLabel"),
        element: {
          type: "select",
          placeholder: this.i18n.translate("insightDurationPlaceholder"),
          actionId: "duration",
          options: this.createDurationOptions()
        }
      }
    ];
    
    return {
      blocks,
      title: this.i18n.translate("insightCommandTitle"),
      submitLabel: this.i18n.translate("submitLabel"),
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
      forcedCompletion?: boolean;
      toolExecutions?: ToolExecutionRecord[];
    }
  ): MessageTemplate {
    const elements: RichTextElement[] = [];


    // Create the message align with each statuses
    switch (reactState.state) {
      case 'thinking':
        // Show observation result when current state is thinking
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
        // Show thinking result when current state is acting
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
        // Show acting result when current state is observing
        if (reactState.lastAction) {
          elements.push({
            type: "rich_text_section",
            elements: [
              {
                type: "text",
                text: this.i18n.translate("executedToolLabel"),
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
          
          elements.push({
            type: "rich_text_section",
            elements: [
              {
                type: "text",
                text: this.i18n.translate("parametersLabel"),
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
        
        if (reactState.lastThinking) {
          const thoughtMatch = reactState.lastThinking.match(/<FinalAnswer>([\s\S]*?)<\/FinalAnswer>/);
          if (thoughtMatch) {
            const thoughtContent = thoughtMatch[1].trim();
            elements.push({
              type: "rich_text_section",
              elements: [
                {
                  type: "text",
                  text: this.i18n.translate("finalAnalysisLabel") + thoughtContent,
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
    const options = [];
    
    for (let i = 1; i <= 14; i++) {
      options.push({
        text: this.i18n.ifJaElseEn(`${i}日`, `${i} Day${i > 1 ? 's' : ''}`),
        value: i.toString()
      });
    }
    
    return options;
  }
}
