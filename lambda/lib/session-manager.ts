import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { 
  DynamoDBDocumentClient, 
  GetCommand, 
  PutCommand, 
  DeleteCommand,
  QueryCommand
} from "@aws-sdk/lib-dynamodb";
import { SessionState } from "./react-agent.js";
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
    
    // セッションIDをpkの形式に変換
    const pk = `SESSION#${sessionId}`;
    
    // 1. マスターセッションアイテムを取得
    const masterCommand = new GetCommand({
      TableName: tableName,
      Key: { 
        pk,
        sk: "DATA"
      }
    });
    
    const masterResponse = await docClient.send(masterCommand);
    
    if (!masterResponse.Item) {
      logger.info("No session found", { sessionId });
      return null;
    }
    
    // 2. 履歴アイテムを取得
    const historyCommand = new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":prefix": "HISTORY#"
      },
      ScanIndexForward: true // 昇順でソート
    });
    
    const historyResponse = await docClient.send(historyCommand);
    
    // 3. マスターセッションと履歴を結合してSessionStateを構築
    const masterItem = masterResponse.Item;
    const historyItems = historyResponse.Items || [];
    
    // 履歴アイテムをSessionStateのhistory配列に変換
    const history = historyItems.map(item => ({
      thinking: item.thinking,
      action: item.action,
      observation: item.observation,
      timestamp: item.timestamp
    }));
    
    // SessionStateオブジェクトを構築
    const state: SessionState = {
      context: masterItem.context,
      history: history,
      finalAnswer: masterItem.finalAnswer,
      state: masterItem.state,
      cycleCount: masterItem.cycleCount,
      dataCollectionStatus: masterItem.dataCollectionStatus,
      lastThinking: masterItem.lastThinking,
      lastAction: masterItem.lastAction,
      lastObservation: masterItem.lastObservation,
      missingData: masterItem.missingData,
      forcedCompletion: masterItem.forcedCompletion
    };
    
    logger.info("Session state retrieved", { sessionId, historyCount: history.length });
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
    
    const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60 * 30; // Expires after 30 days
    
    // セッションIDをpkの形式に変換
    const pk = `SESSION#${sessionId}`;
    
    // 1. マスターセッションアイテムを保存
    const masterItem = {
      pk,
      sk: "DATA",
      context: state.context,
      finalAnswer: state.finalAnswer,
      state: state.state,
      cycleCount: state.cycleCount,
      dataCollectionStatus: state.dataCollectionStatus,
      lastThinking: state.lastThinking,
      lastAction: state.lastAction,
      lastObservation: state.lastObservation,
      missingData: state.missingData,
      forcedCompletion: state.forcedCompletion,
      ttl
    };
    
    const masterCommand = new PutCommand({
      TableName: tableName,
      Item: masterItem
    });
    
    await docClient.send(masterCommand);
    
    // 2. 既存の履歴数を取得
    const countCommand = new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":prefix": "HISTORY#"
      },
      Select: "COUNT"
    });
    
    const countResponse = await docClient.send(countCommand);
    const existingHistoryCount = countResponse.Count || 0;
    
    // 3. 新しい履歴アイテムのみを保存
    const newHistoryItems = state.history.slice(existingHistoryCount);
    
    for (let i = 0; i < newHistoryItems.length; i++) {
      const historyItem = newHistoryItems[i];
      const historyNumber = existingHistoryCount + i + 1;
      const sk = `HISTORY#${historyNumber}`;
      
      const historyCommand = new PutCommand({
        TableName: tableName,
        Item: {
          pk,
          sk,
          thinking: historyItem.thinking,
          action: historyItem.action,
          observation: historyItem.observation,
          timestamp: historyItem.timestamp,
          ttl
        }
      });
      
      await docClient.send(historyCommand);
    }
    
    logger.info("Session state saved", { 
      sessionId, 
      newHistoryCount: newHistoryItems.length,
      totalHistoryCount: state.history.length
    });
  } catch (error) {
    logger.error("Error saving session state", { error, sessionId });
    throw error;
  }
}

export async function updateSessionState(sessionId: string, state: SessionState): Promise<void> {
  // updateSessionStateは内部的にsaveSessionStateを呼び出す
  await saveSessionState(sessionId, state);
}

export async function completeSession(sessionId: string): Promise<void> {
  logger.info("Completing session", { sessionId });
  
  try {
    const tableName = process.env.SESSION_TABLE_NAME;
    if (!tableName) {
      throw new Error("SESSION_TABLE_NAME environment variable is not set");
    }
    
    // Get session state
    const currentState = await getSessionState(sessionId);
    if (currentState) {
      // Set final answer if it's not set
      if (!currentState.finalAnswer) {
        currentState.finalAnswer = "分析が完了しました。";
      }
      
      // Update state
      const { ReactionState } = await import("./react-agent.js");
      currentState.state = ReactionState.COMPLETED;
      
      // Save updated session state
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
    
    // セッションIDをpkの形式に変換
    const pk = `SESSION#${sessionId}`;
    
    // 1. マスターセッションアイテムを削除
    const masterCommand = new DeleteCommand({
      TableName: tableName,
      Key: { 
        pk,
        sk: "DATA"
      }
    });
    
    await docClient.send(masterCommand);
    
    // 2. 履歴アイテムを取得
    const historyCommand = new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":prefix": "HISTORY#"
      },
      ProjectionExpression: "sk"
    });
    
    const historyResponse = await docClient.send(historyCommand);
    const historyItems = historyResponse.Items || [];
    
    // 3. 履歴アイテムを削除
    for (const item of historyItems) {
      const deleteCommand = new DeleteCommand({
        TableName: tableName,
        Key: {
          pk,
          sk: item.sk
        }
      });
      
      await docClient.send(deleteCommand);
    }
    
    logger.info("Session deleted", { sessionId, historyItemsDeleted: historyItems.length });
  } catch (error) {
    logger.error("Error deleting session", { error, sessionId });
    throw error;
  }
}
