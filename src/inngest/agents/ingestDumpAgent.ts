import { createAgent, openai } from '@inngest/agent-kit';
import { z } from 'zod';
import { supabase } from '../../utils/supabase.js';
import { Logger } from '../../utils/logger.js';

// Create a logger for this agent
const logger = Logger.getLogger({
  component: 'IngestDumpAgent'
});

// Define an interface for the agent's state
export interface IngestDumpAgentState {
  userId: string;
  accountId: string;
  inputText: string;
  potentialParents?: Array<{ id: string; title: string; description?: string }>;
  processedMetadata?: any;
}

// Define the DumpMetadata interface
export interface DumpMetadata {
  title: string;
  description: string;
  due_date: string | null;
  is_completed: boolean | null;
  priority: string | null;
  colour_primary: string;
  icon: string;
  created_at: string;
  updated_at: string;
  parent_id: string | null;
}

/**
 * Agent for processing dump inputs and creating dump objects
 */
export const ingestDumpAgent = createAgent({
  name: 'Dump Ingest Agent',
  description: 'Processes user input text to create structured dump objects in the database',
  
  // Define the tools available to the agent
  tools: [
    {
      name: 'searchDumps',
      description: 'Search for existing dumps that might be related to the input text',
      parameters: z.object({
        query: z.string().describe('The search query to find relevant dumps'),
      }),
      handler: async ({ query }, { state }) => {
        const accountId = (state as IngestDumpAgentState).accountId;
        
        try {
          logger.info(`Searching for dumps with query: ${query}`, { accountId });
          
          // Search for dumps in the database
          const { data: dumps, error } = await supabase
            .from('objects')
            .select('id, metadata')
            .eq('related_object_type_id', 'dump')
            .eq('owner_account_id', accountId)
            .textSearch('metadata', query, { 
              config: 'english',
              type: 'plain'
            })
            .limit(5);
            
          if (error) {
            logger.error('Error searching dumps', { error: error.message, accountId });
            return { dumps: [] };
          }
          
          // Format the results
          const formattedDumps = dumps.map(dump => {
            const metadata = typeof dump.metadata === 'string' 
              ? JSON.parse(dump.metadata) 
              : dump.metadata;
              
            return {
              id: dump.id,
              title: metadata.title || 'Untitled Dump',
              description: metadata.description || '',
            };
          });
          
          logger.info(`Found ${formattedDumps.length} related dumps`, { accountId });
          return { dumps: formattedDumps };
        } catch (error) {
          logger.error('Error in searchDumps tool', { 
            error: error instanceof Error ? error.message : String(error),
            accountId 
          });
          return { dumps: [] };
        }
      },
    },
    
    {
      name: 'createDump',
      description: 'Create a new dump object in the database',
      parameters: z.object({
        metadata: z.object({
          title: z.string().describe('A concise title for the dump'),
          description: z.string().describe('A detailed description of the dump'),
          due_date: z.string().nullable().describe('Optional due date in ISO format'),
          is_completed: z.boolean().nullable().describe('Whether the dump is completed'),
          priority: z.string().nullable().describe('Priority level: high, medium, or low'),
          colour_primary: z.string().describe('Hex color code for the dump'),
          icon: z.string().describe('Icon name for the dump'),
          parent_id: z.string().nullable().describe('ID of the parent dump if this is a sub-dump'),
        }),
      }),
      handler: async ({ metadata }, { state }) => {
        const { userId, accountId } = state as IngestDumpAgentState;
        
        try {
          logger.info('Creating new dump', { accountId, title: metadata.title });
          
          // Add timestamps
          const now = new Date().toISOString();
          const dumpMetadata = {
            ...metadata,
            created_at: now,
            updated_at: now,
          };
          
          // Insert the new dump object
          const { data: newDump, error } = await supabase
            .from('objects')
            .insert({
              related_object_type_id: 'dump',
              owner_account_id: accountId,
              owner_member_id: userId,
              metadata: dumpMetadata,
            })
            .select('id')
            .single();
            
          if (error) {
            logger.error('Error creating dump', { error: error.message, accountId });
            return { success: false, error: error.message };
          }
          
          logger.info('Successfully created dump', { 
            dumpId: newDump.id,
            accountId
          });
          
          return { 
            success: true, 
            dumpId: newDump.id,
            message: `Successfully created dump with ID: ${newDump.id}`
          };
        } catch (error) {
          logger.error('Error in createDump tool', { 
            error: error instanceof Error ? error.message : String(error),
            accountId 
          });
          return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          };
        }
      },
    },
  ],
  
  // Define the system message for the agent
  systemMessage: `You are the Dump Ingest Agent, responsible for processing user input and creating structured "dump" objects in the database.

Your task is to:
1. Analyze the user's input text
2. Search for potentially related dumps to determine if this should be a sub-dump
3. Generate appropriate metadata for the dump including:
   - A concise but descriptive title
   - A detailed description
   - Appropriate priority level (if relevant)
   - A suitable color and icon
   - Due date (if the input implies one)
   - Parent relationship (if this should be a child of another dump)

Guidelines:
- If the input seems like a task or todo item, set appropriate fields
- Choose a color that matches the emotional tone or category of the dump
- Select an icon that represents the content
- If the input clearly relates to an existing dump, set it as a child
- Be creative but practical in your interpretations

Always create a dump object at the end of your analysis.`,
  
  // Define the agent's execution logic
  execute: async (input, { step, state, tools }) => {
    const { searchDumps, createDump } = tools;
    
    // Step 1: Analyze the input
    await step.ai.complete({
      messages: [
        { role: 'system', content: 'Analyze the following user input for creating a dump:' },
        { role: 'user', content: input },
      ],
    });
    
    // Step 2: Search for potentially related dumps
    const searchResults = await step.run('search-related-dumps', async () => {
      return await searchDumps({ query: input });
    });
    
    // Store potential parents in state
    (state as IngestDumpAgentState).potentialParents = searchResults.dumps;
    
    // Step 3: Decide on metadata and relationships
    const metadataDecision = await step.ai.complete({
      messages: [
        { role: 'system', content: 'Based on the user input and search results, determine the appropriate metadata for the dump.' },
        { role: 'user', content: input },
        { role: 'system', content: `Here are potentially related dumps: ${JSON.stringify(searchResults.dumps)}` },
        { role: 'system', content: 'Generate a JSON object with the following fields: title, description, due_date (null if none), is_completed (null if not applicable), priority (null, "high", "medium", or "low"), colour_primary (hex code), icon (name of an icon), and parent_id (null or ID of parent dump if this should be a sub-dump).' },
      ],
    });
    
    // Extract the metadata JSON from the response
    let dumpMetadata: DumpMetadata;
    try {
      // Try to extract JSON from the response
      const responseText = metadataDecision.messages[metadataDecision.messages.length - 1].content as string;
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                        responseText.match(/\{[\s\S]*\}/);
                        
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        dumpMetadata = JSON.parse(jsonStr);
      } else {
        // Fallback to default values
        dumpMetadata = {
          title: 'Untitled Dump',
          description: input,
          due_date: null,
          is_completed: null,
          priority: null,
          colour_primary: '#3498db',
          icon: 'note',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          parent_id: null,
        };
      }
    } catch (error) {
      logger.error('Error parsing metadata JSON', { 
        error: error instanceof Error ? error.message : String(error),
        response: metadataDecision.messages[metadataDecision.messages.length - 1].content 
      });
      
      // Use default values
      dumpMetadata = {
        title: 'Untitled Dump',
        description: input,
        due_date: null,
        is_completed: null,
        priority: null,
        colour_primary: '#3498db',
        icon: 'note',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        parent_id: null,
      };
    }
    
    // Store the processed metadata in state
    (state as IngestDumpAgentState).processedMetadata = dumpMetadata;
    
    // Step 4: Create the dump
    const createResult = await step.run('create-dump', async () => {
      return await createDump({ metadata: dumpMetadata });
    });
    
    // Step 5: Return the result
    if (createResult.success) {
      return `Successfully created a new dump: "${dumpMetadata.title}". ID: ${createResult.dumpId}`;
    } else {
      return `Failed to create dump: ${createResult.error}`;
    }
  },
}); 