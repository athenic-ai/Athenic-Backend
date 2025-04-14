-- Add paused_session_id if it doesn't exist
ALTER TABLE IF EXISTS sandbox_sessions ADD COLUMN IF NOT EXISTS paused_session_id TEXT;
