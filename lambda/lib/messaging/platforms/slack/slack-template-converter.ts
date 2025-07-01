import { KnownBlock, View, RichTextBlock } from "@slack/types";
import { MessageTemplate, FormTemplate, MessageBlock, RichTextElement } from '../../interfaces/template-provider.interface.js';

/**
 * Interface for template converter
 */
export interface ITemplateConverter<T> {
  /**
   * Convert message template
   * @param template Message template
   * @returns Converted object
   */
  convertMessageTemplate(template: MessageTemplate): T;
  
  /**
   * Convert form template
   * @param template Form template
   * @returns Converted object
   */
  convertFormTemplate(template: FormTemplate): T;
}

/**
 * Template converter for Slack
 * Converts abstract templates to Slack-specific format
 */
export class SlackTemplateConverter implements ITemplateConverter<KnownBlock[] | View> {
  /**
   * Convert message template to Slack blocks
   * @param template Message template
   * @returns Array of Slack blocks
   */
  convertMessageTemplate(template: MessageTemplate): KnownBlock[] {
    // 抽象的なMessageTemplateをSlackのKnownBlock[]に変換
    return template.blocks.map(block => this.convertBlock(block));
  }
  
  /**
   * Convert form template to Slack view
   * @param template Form template
   * @returns Slack view
   */
  convertFormTemplate(template: FormTemplate): View {
    // FormTemplateをSlackのViewに変換
    return {
      type: "modal",
      title: {
        type: "plain_text",
        text: template.title || "Form"
      },
      submit: template.submitLabel ? {
        type: "plain_text",
        text: template.submitLabel
      } : undefined,
      callback_id: template.callbackId,
      blocks: template.blocks.map(block => this.convertBlock(block))
    };
  }
  
  /**
   * Convert abstract block to Slack block
   * @param block Abstract message block
   * @returns Slack block
   */
  private convertBlock(block: MessageBlock): KnownBlock {
    // 抽象的なMessageBlockをSlackのKnownBlockに変換
    switch (block.type) {
      case "rich_text":
        return this.convertRichTextBlock(block);
      case "section":
        return {
          type: "section",
          text: block.text ? {
            type: "mrkdwn",
            text: block.text
          } : undefined
        };
      case "divider":
        return { type: "divider" };
      case "input":
        return {
          type: "input",
          block_id: block.blockId,
          label: {
            type: "plain_text",
            text: block.label || "",
            emoji: true
          },
          element: this.convertElement(block.element)
        };
      case "actions":
        return {
          type: "actions",
          elements: Array.isArray(block.elements) 
            ? block.elements.map(element => this.convertElement(element))
            : []
        };
      case "header":
        return {
          type: "header",
          text: {
            type: "plain_text",
            text: block.text || "",
            emoji: true
          }
        };
      // 他のブロックタイプの変換...
      default:
        // 未知のブロックタイプはそのまま返す（型キャスト）
        return block as unknown as KnownBlock;
    }
  }
  
  /**
   * Convert rich text block
   * @param block Rich text block
   * @returns Slack rich text block
   */
  private convertRichTextBlock(block: MessageBlock): RichTextBlock {
    return {
      type: "rich_text",
      elements: block.elements ? 
        block.elements.map(element => this.convertRichTextElement(element)) : []
    };
  }
  
  /**
   * Convert rich text element
   * @param element Rich text element
   * @returns Slack rich text element
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertRichTextElement(element: RichTextElement): any {
    if (!element) return undefined;
    
    switch (element.type) {
      case "rich_text_section":
        return {
          type: "rich_text_section",
          elements: element.elements ? 
            element.elements.map((subElement: RichTextElement) => this.convertRichTextElement(subElement)) : []
        };
      case "rich_text_list":
        return {
          type: "rich_text_list",
          style: element.style || "bullet",
          elements: element.elements ? 
            element.elements.map((subElement: RichTextElement) => this.convertRichTextElement(subElement)) : []
        };
      case "text":
        return {
          type: "text",
          text: element.text || "",
          style: element.style
        };
      case "emoji":
        return {
          type: "emoji",
          name: element.name || ""
        };
      case "link":
        return {
          type: "link",
          url: element.url || "",
          text: element.text || element.url || ""
        };
      default:
        // 未知の要素タイプはそのまま返す
        return element;
    }
  }
  
  /**
   * Convert abstract element to Slack element
   * @param element Abstract element
   * @returns Slack element
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertElement(element: any): any {
    // 要素の変換ロジック
    if (!element) return undefined;
    
    switch (element.type) {
      case "text_input":
        return {
          type: "plain_text_input",
          action_id: element.actionId,
          placeholder: element.placeholder ? {
            type: "plain_text",
            text: element.placeholder
          } : undefined,
          multiline: element.multiline
        };
      case "datepicker":
        return {
          type: "datepicker",
          initial_date: element.initialDate,
          placeholder: {
            type: "plain_text",
            text: "Select a date",
            emoji: true
          },
          action_id: element.actionId
        };
      case "timepicker":
        return {
          type: "timepicker",
          initial_time: element.initialTime,
          placeholder: {
            type: "plain_text",
            text: "Select time",
            emoji: true
          },
          action_id: element.actionId
        };
      case "select":
        return {
          type: "static_select",
          placeholder: {
            type: "plain_text",
            text: element.placeholder || "Select an option",
            emoji: true
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          options: (element.options || []).map((option: any) => ({
            text: {
              type: "plain_text",
              text: option.text,
              emoji: true
            },
            value: option.value
          })),
          action_id: element.actionId
        };
      case "button":
        return {
          type: "button",
          text: {
            type: "plain_text",
            text: element.text
          },
          style: element.style,
          action_id: element.actionId,
          value: element.value
        };
      // 他の要素タイプの変換...
      default:
        // 未知の要素タイプはそのまま返す
        return element;
    }
  }
}
