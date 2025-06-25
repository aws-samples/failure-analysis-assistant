import { logger } from "./logger.js";

export interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface ToolDescription {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: Record<string, unknown>) => Promise<string>;
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  
  registerTool(tool: Tool): void {
    logger.info(`Registering tool: ${tool.name}`);
    this.tools.set(tool.name, tool);
  }
  
  async executeTool(toolName: string, params: Record<string, unknown>): Promise<string> {
    logger.info(`Executing tool: ${toolName}`, { params });
    
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }
    
    // パラメータのバリデーション
    this.validateParameters(tool, params);
    
    try {
      const result = await tool.execute(params);
      logger.info(`Tool ${toolName} executed successfully`);
      return result;
    } catch (error) {
      logger.error(`Error executing tool ${toolName}`, { error });
      throw error;
    }
  }
  
  private validateParameters(tool: Tool, params: Record<string, unknown>): void {
    // 必須パラメータのチェック
    for (const param of tool.parameters) {
      if (param.required && (params[param.name] === undefined || params[param.name] === null)) {
        throw new Error(`Required parameter '${param.name}' is missing for tool '${tool.name}'`);
      }
    }
  }
  
  getToolDescriptions(): ToolDescription[] {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }));
  }
  
  hasTool(toolName: string): boolean {
    return this.tools.has(toolName);
  }
  
  getAllToolNames(): string[] {
    return Array.from(this.tools.keys());
  }
}
