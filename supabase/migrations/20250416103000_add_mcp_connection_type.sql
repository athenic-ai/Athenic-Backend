-- Migration to add MCP Connection object type and associated metadata types

BEGIN;

-- Add the MCP Connection object type
INSERT INTO public.object_types (id, name, name_plural, description, icon, category, visible, order_priority)
VALUES ('mcp_connection', 'MCP Connection', 'MCP Connections', 'A connection to a Model Context Protocol server.', 'solid server', 'account_data_special', true, 100) -- Adjusted icon and category based on current conventions
ON CONFLICT (id) DO NOTHING;

-- Add metadata types for the MCP Connection
INSERT INTO public.object_metadata_types (id, related_object_type_id, name, description, field_type_id, is_visible, is_required, order_priority, allow_ai_update, dictionary_term_type)
VALUES
  ('title', 'mcp_connection', 'Connection Name', 'User-friendly name for the MCP connection.', 'text', true, true, 10, false, NULL),
  ('mcp_url', 'mcp_connection', 'Server URL', 'The WebSocket (ws:// or wss://) or SSE URL of the MCP server.', 'url', true, true, 20, false, NULL),
  ('mcp_credentials', 'mcp_connection', 'Credentials', 'Encrypted credentials (e.g., API Key, token) or Vault secret identifier for the MCP server.', 'text', false, false, 30, false, NULL), -- Not visible in UI tables, requirement depends on server
  ('mcp_status', 'mcp_connection', 'Status', 'Connection status (e.g., connected, error, pending). Requires dictionary terms.', 'single_select', true, true, 40, false, 'mcpConnectionStatuses'), -- Requires dictionary terms
  ('mcp_last_error', 'mcp_connection', 'Last Error', 'Details of the last connection error.', 'text', false, false, 50, false, NULL) -- Not visible by default
ON CONFLICT (id) DO UPDATE SET
  related_object_type_id = EXCLUDED.related_object_type_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  field_type_id = EXCLUDED.field_type_id,
  is_visible = EXCLUDED.is_visible,
  is_required = EXCLUDED.is_required,
  order_priority = EXCLUDED.order_priority,
  allow_ai_update = EXCLUDED.allow_ai_update,
  dictionary_term_type = EXCLUDED.dictionary_term_type; -- Ensure dictionary_term_type is updated if needed

-- Add dictionary terms for MCP Connection Statuses
INSERT INTO public.dictionary_terms (id, type, pretty_name, description, value)
VALUES 
  ('mcpConnected', 'mcpConnectionStatuses', 'Connected', 'The connection is active.', 1),
  ('mcpError', 'mcpConnectionStatuses', 'Error', 'The connection failed.', 2),
  ('mcpPending', 'mcpConnectionStatuses', 'Pending', 'Connection details saved, validation pending.', 3)
ON CONFLICT (id) DO UPDATE SET
  type = EXCLUDED.type,
  pretty_name = EXCLUDED.pretty_name,
  description = EXCLUDED.description,
  value = EXCLUDED.value;

-- Add the new dictionary term type to the enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type typ JOIN pg_enum enm ON typ.oid = enm.enumtypid WHERE typname = 'dictionary_term_types' AND enm.enumlabel = 'mcpConnectionStatuses') THEN
    ALTER TYPE public.dictionary_term_types ADD VALUE 'mcpConnectionStatuses';
  END IF;
END$$;

COMMIT; 