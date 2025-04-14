-- Create the sandbox_sessions table
CREATE TABLE IF NOT EXISTS sandbox_sessions (
  id BIGSERIAL PRIMARY KEY,
  session_key TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  working_directory TEXT NOT NULL DEFAULT '/home/sandbox',
  e2b_session_id TEXT,
  paused_session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient session lookup
CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_key ON sandbox_sessions(session_key);
CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_last_used ON sandbox_sessions(last_used);
CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_e2b_id ON sandbox_sessions(e2b_session_id);
