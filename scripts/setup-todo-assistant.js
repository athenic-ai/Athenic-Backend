/**
 * Setup Todo Assistant
 * 
 * This script creates a Todo Assistant for the consumer app with
 * todo management capabilities. It should be run after the database
 * migrations that add the todo object type and capability metadata field.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables. Please check your .env file.');
  process.exit(1);
}

// Organization ID to create the assistant for
const ORGANIZATION_ID = process.argv[2];

if (!ORGANIZATION_ID) {
  console.error('Please provide an organization ID as a command line argument.');
  console.error('Usage: node setup-todo-assistant.js <organization-id>');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Create or update the Todo Assistant for the specified organization
 */
async function setupTodoAssistant() {
  try {
    console.log(`Setting up Todo Assistant for organization: ${ORGANIZATION_ID}`);
    
    // Check if a Todo Assistant already exists for this organization
    const { data: existingAssistants, error: searchError } = await supabase
      .from('objects')
      .select('id, metadata')
      .eq('owner_organisation_id', ORGANIZATION_ID)
      .eq('related_object_type_id', 'assistant')
      .filter('metadata->title', 'eq', 'Todo Assistant');
    
    if (searchError) {
      throw new Error(`Error searching for existing assistant: ${searchError.message}`);
    }
    
    if (existingAssistants && existingAssistants.length > 0) {
      console.log('Todo Assistant already exists. Updating capabilities...');
      
      // Update the existing assistant with todo management capabilities
      const { data: updatedAssistant, error: updateError } = await supabase
        .from('objects')
        .update({
          metadata: {
            ...existingAssistants[0].metadata,
            capabilities: 'todo_management',
            description: 'I can help you manage your todos. You can ask me to create, update, list, or delete todos.',
            updated_at: new Date().toISOString()
          }
        })
        .eq('id', existingAssistants[0].id)
        .select()
        .single();
      
      if (updateError) {
        throw new Error(`Error updating assistant: ${updateError.message}`);
      }
      
      console.log('Todo Assistant updated successfully!');
      console.log('Assistant ID:', updatedAssistant.id);
      return updatedAssistant;
    } else {
      console.log('Creating new Todo Assistant...');
      
      // Create a new assistant with todo management capabilities
      const { data: newAssistant, error: createError } = await supabase
        .from('objects')
        .insert({
          related_object_type_id: 'assistant',
          owner_organisation_id: ORGANIZATION_ID,
          metadata: {
            title: 'Todo Assistant',
            status: 'assistant_status_active',
            description: 'I can help you manage your todos. You can ask me to create, update, list, or delete todos.',
            capabilities: 'todo_management',
            created_at: new Date().toISOString(),
            profile_image_url: 'https://example.com/todo-assistant.png', // Replace with actual image URL
            welcome_message: 'Hi there! I\'m your Todo Assistant. How can I help you manage your tasks today?'
          }
        })
        .select()
        .single();
      
      if (createError) {
        throw new Error(`Error creating assistant: ${createError.message}`);
      }
      
      console.log('Todo Assistant created successfully!');
      console.log('Assistant ID:', newAssistant.id);
      return newAssistant;
    }
  } catch (error) {
    console.error('Error setting up Todo Assistant:', error.message);
    process.exit(1);
  }
}

// Run the setup function
setupTodoAssistant()
  .then(() => {
    console.log('Todo Assistant setup completed.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  }); 