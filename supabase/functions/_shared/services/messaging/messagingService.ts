import { MessagingInterface } from './messagingInterface.ts';
import { MessagingPluginCompany } from './messagingPluginCompany.ts';
import { MessagingPluginSlack } from './messagingPluginSlack.ts';
import * as config from "../../configs/index.ts";
import * as uuid from "jsr:@std/uuid";

const connectionPlugins: Record<string, MessagingInterface> = {
  company: new MessagingPluginCompany(),
  slack: new MessagingPluginSlack(),
};

export class MessagingService {
  async auth(connection: string, connectionMetadata: Map<string, any>) {
    const plugin = connectionPlugins[connection];
    if (!plugin) throw new Error(`Unsupported connection: ${connection}`);
    return plugin.auth(connection, connectionMetadata);
  }

  async receiveMessage(connection: string, dataIn: Map<string, any>) {
    const plugin = connectionPlugins[connection];
    if (!plugin) throw new Error(`Unsupported connection: ${connection}`);
    return plugin.receiveMessage(dataIn);
  }

  async getChatHistory({organisationId, memberId, messageThreadId, storageService}) {
    try {
      console.log(`Getting chat history for organisationId: ${organisationId}, memberId: ${memberId}, messageThreadId: ${messageThreadId}`);
      // TODO: improve this so instead of just getting the last X messages sent in the last X hours, summarise older messages and include those too so AI doesn't just have a short term memory
      const chatHistory = [];

      // Calculate the timestamp for 12 hours ago
      let twelveHoursAgo = new Date();
      twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);
      twelveHoursAgo = twelveHoursAgo.toISOString(); // Required for Supabase to compare with timestamps in the DB
      console.log(`twelveHoursAgo: ${twelveHoursAgo}`);

      // Prepare where conditions based on whether organisationId is provided
      const whereAndConditions = [
        { column: 'related_object_type_id', operator: 'eq', value: config.OBJECT_TYPE_ID_MESSAGE },
        { column: 'metadata', jsonPath:['parent_id'], operator: 'eq', value: messageThreadId },
        { column: 'metadata', jsonPath:['created_at'], operator: 'gte', value: twelveHoursAgo },
      ];
      
      // Add member and organization conditions only if they are provided
      if (memberId) {
        whereAndConditions.push({ column: 'owner_member_id', operator: 'eq', value: memberId });
      }
      
      if (organisationId) {
        whereAndConditions.push({ column: 'owner_organisation_id', operator: 'eq', value: organisationId });
      }

      // Fetch the last 6 messages sent in the last 12 hours, ordered by lastModified ascending
      const getChatHistoryResult = await storageService.getRows(config.OBJECT_TABLE_NAME, {
        whereAndConditions,
        orderByConditions: [
          { column: 'metadata', jsonPath:['created_at'], ascending: false }, // desc so we get the most recent messages
        ],
        limitCount: 6, // TODO: consider increasing this to maybe 20
        removeEmbeddings: true // Exclude embeddings to reduce payload size
      });
      if (getChatHistoryResult.status != 200) {
        throw Error(getChatHistoryResult.message);
      }
      const chatHistoryMessageObjects = getChatHistoryResult.data;
      console.log(`chatHistoryMessageObjects retrieved: ${JSON.stringify(chatHistoryMessageObjects)}`);

      // Process each message and convert it to the required format
      for (const messageObject of chatHistoryMessageObjects) {
        const role = messageObject.metadata.author_id === "company" ? "assistant" : "user";

        console.log(`messageData: ${JSON.stringify(messageObject)}`);

        // Push the formatted message into the history array IF title is a string as expected (otherwise future NLP calls may fail)
        if (typeof messageObject.metadata.title === "string") {
          // Only add the message to the chat history if it's a different role to the previous message (otherwise, there was probably an error with previous message)
          if (chatHistory.length === 0 || chatHistory[chatHistory.length - 1].role !== role) {
            chatHistory.push({
              role: role,
              content: messageObject.metadata.title,
            });
          }
        }
      }

      chatHistory.reverse(); // need to reverse so that it shows the older messages in the right order
      console.log(`chatHistory after: ${JSON.stringify(chatHistory)}`);

      if (chatHistory.length > 0 && chatHistory[0].role == "assistant") {
        console.log(`chatHistory before: ${JSON.stringify(chatHistory)}`);
        console.log("If somehow first item is model, remove it so that AI model doesn't cause an error as it expects first item in history to be a user's message");
        chatHistory.shift();
        console.log(`chatHistory after: ${JSON.stringify(chatHistory)}`);
      }

      const result: FunctionResult = {
        status: 200,
        data: chatHistory,
      };
      return result;
    } catch (error) {
      const result: FunctionResult = {
        status: 500,
        message: `❌ Failed to get getChatHistory with error: ${error.message}.`,
      };
      return result;
    }
  }

  async storeMessage({organisationId, memberId = null, connectionId, messageThreadId, messageIsFromBot, authorId, message, storageService, nlpService}) {
    try {
      if (!message || message.trim().length === 0) {
        console.log("⚠️ Skipping storing empty message");
        return {
          status: 400,
          message: "Cannot store empty message"
        };
      }
      
      console.log(`Storing ${messageIsFromBot ? 'AI' : 'user'} message: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);
      
      // Step 1: Create and store the message object
      const messageObjectData = {
        id: uuid.v1.generate(),
        related_object_type_id: config.OBJECT_TYPE_ID_MESSAGE,
        metadata: {
          [config.OBJECT_METADATA_DEFAULT_TITLE]: message,
          [config.OBJECT_METADATA_TYPE_ID_MESSAGE_AUTHOR_ID]: messageIsFromBot ? config.OBJECT_MESSAGE_AUTHOR_ID_VALUE_IF_COMPANY : authorId,
          [config.OBJECT_METADATA_DEFAULT_CREATED_AT]: new Date(),
          [config.OBJECT_METADATA_DEFAULT_PARENT_ID]: messageThreadId,
        },
      };
      
      // Add organisationId and memberId only if they are provided
      if (organisationId) {
        messageObjectData.owner_organisation_id = organisationId;
      }
      
      if (memberId) {
        messageObjectData.owner_member_id = memberId;
      }
      
      console.log(`Upserting row with data: ${JSON.stringify(messageObjectData)}`);
      const messageUpdateResult = await storageService.updateRow({
        table: config.OBJECT_TABLE_NAME,
        keys: {id: messageObjectData.id},
        rowData: messageObjectData,
        nlpService,
        mayAlreadyExist: false,
      });
      if (messageUpdateResult.status != 200) {
        throw Error(messageUpdateResult.message);
      }

      // Step 2: First get the existing message thread object to fetch current child_ids
      const getThreadResult = await storageService.getRow({
        table: config.OBJECT_TABLE_NAME,
        keys: {id: messageThreadId}
      });
      
      // If thread doesn't exist, throw an error
      if (getThreadResult.status != 200) {
        throw Error(`Message thread not found: ${getThreadResult.message}`);
      }
      
      const threadData = getThreadResult.data;
      
      // Initialize or update the child_ids object in metadata
      let childIds = {};
      if (threadData.metadata && threadData.metadata.child_ids) {
        // Keep existing child IDs
        childIds = {...threadData.metadata.child_ids};
      }
      
      // Add new message ID to the message array, or create a new array if it doesn't exist
      if (!childIds[config.OBJECT_TYPE_ID_MESSAGE]) {
        childIds[config.OBJECT_TYPE_ID_MESSAGE] = [];
      }
      
      // Make sure we don't duplicate message IDs
      if (!childIds[config.OBJECT_TYPE_ID_MESSAGE].includes(messageObjectData.id)) {
        childIds[config.OBJECT_TYPE_ID_MESSAGE].push(messageObjectData.id);
      }
      
      // Create update data
      const messageThreadObjectData = {
        metadata: {
          ...threadData.metadata,
          child_ids: childIds
        },
      };
      
      console.log(`Updating message thread object data in DB with messageThreadObjectData: ${JSON.stringify(messageThreadObjectData)}`);
      const messageThreadUpdateResult = await storageService.updateRow({
        table: config.OBJECT_TABLE_NAME,
        keys: {id: messageThreadId},
        rowData: messageThreadObjectData,
        nlpService,
        mayAlreadyExist: true,
      });
      if (messageThreadUpdateResult.status != 200) {
        throw Error(messageThreadUpdateResult.message);
      }
      
      console.log(`✅ Successfully stored ${messageIsFromBot ? 'AI' : 'user'} message`);
      return {
        status: 200,
        message: "Message stored successfully"
      };
    } catch (error) {
      console.log(`❌ Failed to store message with error: ${error.message}.`);
      const result: FunctionResult = {
        status: 500,
        message: `❌ Failed to store message with error: ${error.message}. Please try again.`,
      };
      return result;
    }
  }
}
