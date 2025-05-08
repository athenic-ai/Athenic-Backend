// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

// API Configuration
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Check MCP server definitions
async function checkMcpServers() {
  const { data: mcpServers, error: mcpError } = await supabase
    .from('objects')
    .select('*')
    .eq('related_object_type_id', 'mcp_server');
  
  console.log('MCP Servers:', mcpServers?.length || 0);
  if (mcpError) {
    console.error('Error fetching MCP servers:', mcpError);
    return;
  }
  
  if (mcpServers) {
    console.log('First MCP server metadata:', JSON.stringify(mcpServers[0]?.metadata, null, 2));
  }
}

// Check object_metadata_types for connection
async function checkConnectionMetadataTypes() {
  const { data: metadataTypes, error: metaError } = await supabase
    .from('object_metadata_types')
    .select('*')
    .eq('related_object_type_id', 'connection');
  
  console.log('Connection metadata types:', metadataTypes?.length || 0);
  if (metaError) {
    console.error('Error fetching metadata types:', metaError);
    return;
  }
  
  if (metadataTypes) {
    console.log('Required metadata types:');
    for (const type of metadataTypes) {
      if (type.is_required) {
        console.log(`- ${type.id} (${type.field_type_id})`);
      }
    }
  }
}

// Check existing connections
async function checkExistingConnections() {
  const { data: connections, error: connError } = await supabase
    .from('objects')
    .select('*')
    .eq('related_object_type_id', 'connection');
  
  console.log('Existing connections:', connections?.length || 0);
  if (connError) {
    console.error('Error fetching connections:', connError);
    return;
  }
  
  if (connections && connections.length > 0) {
    console.log('First connection metadata:', JSON.stringify(connections[0]?.metadata, null, 2));
  }
}

// Main entry point
Deno.serve(async (req) => {
  try {
    await checkMcpServers();
    await checkConnectionMetadataTypes();
    await checkExistingConnections();
    
    return new Response(
      JSON.stringify({ message: 'Tests completed successfully. Check the logs for details.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error during tests:', error);
    return new Response(
      JSON.stringify({ error: 'Test failed', message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}); 