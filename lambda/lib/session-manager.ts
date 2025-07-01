import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { 
  DynamoDBDocumentClient, 
  GetCommand, 
  PutCommand, 
  UpdateCommand, 
  DeleteCommand 
} from "@aws-sdk/lib-dynamodb";
import { ToolExecutionRecord, SessionState } from "./react-agent.js";
import { logger } from "./logger.js";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, { 
  marshallOptions: { removeUndefinedValues: true } 
});

export async function getSessionState(sessionId: string): Promise<SessionState | null> {
  logger.info("Getting session state", { sessionId });
  
  try {
    const tableName = process.env.SESSION_TABLE_NAME;
    if (!tableName) {
      throw new Error("SESSION_TABLE_NAME environment variable is not set");
    }
    
    const command = new GetCommand({
      TableName: tableName,
      Key: { sessionId }
    });
    
    const response = await docClient.send(command);
    
    if (!response.Item) {
      logger.info("No session found", { sessionId });
      return null;
    }
    
    // セッション状態を取得
    const state = response.Item.state as SessionState;
    
    // ツール実行記録があれば追加
    if (response.Item.toolExecutions) {
      state.toolExecutions = response.Item.toolExecutions as ToolExecutionRecord[];
    } else if (!state.toolExecutions) {
      // ツール実行記録がない場合は空の配列を設定
      state.toolExecutions = [];
    }
    
    logger.info("Session state retrieved", { 
      sessionId, 
      toolExecutionsCount: state.toolExecutions.length 
    });
    return state;
  } catch (error) {
    logger.error("Error getting session state", { error, sessionId });
    throw error;
  }
}

export async function saveSessionState(sessionId: string, state: SessionState): Promise<void> {
  logger.info("Saving session state", { sessionId });
  
  try {
    const tableName = process.env.SESSION_TABLE_NAME;
    if (!tableName) {
      throw new Error("SESSION_TABLE_NAME environment variable is not set");
    }
    
    const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60 * 30; // 30日後に期限切れ
    
    // ツール実行記録を別フィールドとして保存
    const toolExecutions = state.toolExecutions || [];
    
    const command = new PutCommand({
      TableName: tableName,
      Item: {
        sessionId,
        state,
        toolExecutions, // ツール実行記録を別フィールドとして保存
        ttl
      }
    });
    
    await docClient.send(command);
    logger.info("Session state saved", { 
      sessionId, 
      toolExecutionsCount: toolExecutions.length 
    });
  } catch (error) {
    logger.error("Error saving session state", { error, sessionId });
    throw error;
  }
}

export async function updateSessionState(sessionId: string, state: SessionState): Promise<void> {
  logger.info("Updating session state", { sessionId });
  
  try {
    const tableName = process.env.SESSION_TABLE_NAME;
    if (!tableName) {
      throw new Error("SESSION_TABLE_NAME environment variable is not set");
    }
    
    // ツール実行記録を別フィールドとして更新
    const toolExecutions = state.toolExecutions || [];
    
    const command = new UpdateCommand({
      TableName: tableName,
      Key: { sessionId },
      UpdateExpression: "set #state = :state, #toolExecutions = :toolExecutions",
      ExpressionAttributeNames: {
        "#state": "state",
        "#toolExecutions": "toolExecutions"
      },
      ExpressionAttributeValues: {
        ":state": state,
        ":toolExecutions": toolExecutions
      }
    });
    
    await docClient.send(command);
    logger.info("Session state updated", { 
      sessionId, 
      toolExecutionsCount: toolExecutions.length 
    });
  } catch (error) {
    logger.error("Error updating session state", { error, sessionId });
    throw error;
  }
}

export async function completeSession(sessionId: string): Promise<void> {
  logger.info("Completing session", { sessionId });
  
  try {
    const tableName = process.env.SESSION_TABLE_NAME;
    if (!tableName) {
      throw new Error("SESSION_TABLE_NAME environment variable is not set");
    }
    
    // セッション状態を取得
    const currentState = await getSessionState(sessionId);
    if (currentState) {
      // 最終回答が設定されていない場合は設定
      if (!currentState.finalAnswer) {
        currentState.finalAnswer = "分析が完了しました。";
      }
      
      // 状態を更新
      const { ReactionState } = await import("./react-agent.js");
      currentState.state = ReactionState.COMPLETED;
      
      // 更新したセッション状態を保存
      await saveSessionState(sessionId, currentState);
    }
    
    logger.info("Session marked as completed", { sessionId });
  } catch (error) {
    logger.error("Error completing session", { error, sessionId });
    throw error;
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  logger.info("Deleting session", { sessionId });
  
  try {
    const tableName = process.env.SESSION_TABLE_NAME;
    if (!tableName) {
      throw new Error("SESSION_TABLE_NAME environment variable is not set");
    }
    
    const command = new DeleteCommand({
      TableName: tableName,
      Key: { sessionId }
    });
    
    await docClient.send(command);
    logger.info("Session deleted", { sessionId });
  } catch (error) {
    logger.error("Error deleting session", { error, sessionId });
    throw error;
  }
}
