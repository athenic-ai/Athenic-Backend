-- Add field types
INSERT INTO field_types (id, name, description, is_array, data_type, icon)
VALUES
  ('text', 'Text', 'Text field for storing string data', false, 'string', 'solid font'),
  ('timestamp', 'Timestamp', 'Date and time field', false, 'string', 'solid calendar'),
  ('json', 'JSON', 'JSON data format', false, 'object', 'solid code')
ON CONFLICT (id) DO NOTHING;

-- Check for existing object types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM object_types WHERE id = 'agent_working_memory') THEN
    -- Add agent-related object types
    INSERT INTO object_types (id, name, name_plural, description, icon, category, visible)
    VALUES 
      ('agent_working_memory', 'Working Memory', 'Working Memory', 'Short-term memory storage for agent operations', 'solid brain', 'organisation_data_special', true),
      ('agent_long_term_memory', 'Long-term Memory', 'Long-term Memory', 'Persistent knowledge storage with semantic retrieval capabilities', 'solid database', 'organisation_data_special', true),
      ('agent_execution', 'Agent Execution', 'Agent Executions', 'Record of agent execution steps and results', 'solid play', 'organisation_data_special', true);
  END IF;
END;
$$;

-- Add metadata types for agent_working_memory (with ID)
INSERT INTO object_metadata_types (id, name, description, related_object_type_id, field_type_id, is_required, is_visible, allow_ai_update, order_priority)
VALUES
  -- Required common fields
  ('title', 'title', 'Title', 'agent_working_memory', 'text', true, true, false, 1),
  ('created_at', 'created_at', 'Created', 'agent_working_memory', 'timestamp', true, true, false, 2),
  -- Working memory specific fields
  ('key', 'key', 'Memory Key', 'agent_working_memory', 'text', true, true, false, 3),
  ('data', 'data', 'Stored Data', 'agent_working_memory', 'json', true, true, false, 4),
  ('expires_at', 'expires_at', 'Expiration Time', 'agent_working_memory', 'timestamp', false, true, false, 5)
ON CONFLICT (id, related_object_type_id) DO NOTHING;

-- Add metadata types for agent_long_term_memory (with ID)
INSERT INTO object_metadata_types (id, name, description, related_object_type_id, field_type_id, is_required, is_visible, allow_ai_update, order_priority)
VALUES
  -- Required common fields
  ('title', 'title', 'Title', 'agent_long_term_memory', 'text', true, true, false, 1),
  ('created_at', 'created_at', 'Created', 'agent_long_term_memory', 'timestamp', true, true, false, 2),
  -- Long-term memory specific fields
  ('concept', 'concept', 'Memory Concept', 'agent_long_term_memory', 'text', true, true, false, 3),
  ('data', 'data', 'Stored Data', 'agent_long_term_memory', 'json', true, true, false, 4),
  ('embedding', 'embedding', 'Vector Embedding', 'agent_long_term_memory', 'json', false, false, false, 5)
ON CONFLICT (id, related_object_type_id) DO NOTHING;

-- Add metadata types for agent_execution (with ID)
INSERT INTO object_metadata_types (id, name, description, related_object_type_id, field_type_id, is_required, is_visible, allow_ai_update, order_priority)
VALUES
  -- Required common fields
  ('title', 'title', 'Title', 'agent_execution', 'text', true, true, false, 1),
  ('created_at', 'created_at', 'Created', 'agent_execution', 'timestamp', true, true, false, 2),
  -- Execution specific fields
  ('execution_id', 'execution_id', 'Execution ID', 'agent_execution', 'text', true, true, false, 3),
  ('context', 'context', 'Execution Context', 'agent_execution', 'json', true, true, false, 4),
  ('status', 'status', 'Execution Status', 'agent_execution', 'text', true, true, true, 5)
ON CONFLICT (id, related_object_type_id) DO NOTHING;

-- Create stored procedure for semantic search of memories using vector similarity
CREATE OR REPLACE FUNCTION match_agent_memories(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_organization_id text
)
RETURNS TABLE (
  id UUID,
  concept TEXT,
  data JSONB,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    (o.metadata->>'concept')::TEXT as concept,
    (o.metadata->>'data')::JSONB as data,
    1 - (o.embedding <=> query_embedding) as similarity
  FROM objects o
  WHERE 
    o.owner_organisation_id = p_organization_id AND
    o.related_object_type_id = 'agent_long_term_memory' AND
    o.embedding IS NOT NULL AND
    1 - (o.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$; 