-- Drop stored procedure
DROP FUNCTION IF EXISTS match_agent_memories;

-- Remove agent-related metadata types
DELETE FROM object_metadata_types WHERE related_object_type_id IN ('agent_working_memory', 'agent_long_term_memory', 'agent_execution');

-- Remove agent-related object types
DELETE FROM object_types WHERE id IN ('agent_working_memory', 'agent_long_term_memory', 'agent_execution'); 