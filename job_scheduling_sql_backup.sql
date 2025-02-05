-- Helper function to log messages with context
CREATE OR REPLACE FUNCTION log_job_event(
  event_type TEXT,
  job_id UUID,
  details JSONB
) RETURNS void AS $$
BEGIN
  -- Log to Postgres logs with structured JSON
  RAISE LOG '%',
    json_build_object(
      'level', 'INFO',
      'message', format('Job Event: %s for job %s', event_type, job_id),
      'metadata', details
    );
END;
$$ LANGUAGE plpgsql;

-- Function to create a cron job for a specific job row
-- Function to create a cron job for a specific job row
CREATE OR REPLACE FUNCTION create_job_cron(
  job_id UUID,
  owner_organisation_id TEXT,  -- Changed from UUID to TEXT
  schedule TEXT
) RETURNS void AS $$
DECLARE
  job_name text := 'job_' || job_id::text;
  request_body text := json_build_object(
    'companyMetadata', json_build_object('organisationId', owner_organisation_id),
    'companyDataContents', ARRAY[job_id::text]
  )::text;
BEGIN
  -- Log attempt to create cron job
  PERFORM log_job_event('CRON_CREATE_ATTEMPT', job_id, jsonb_build_object(
    'schedule', schedule,
    'owner_organisation_id', owner_organisation_id
  ));

  -- Validate schedule format
  IF regexp_match(schedule, '^(\S+\s+){4}\S+$') IS NULL THEN
    RAISE EXCEPTION 'Invalid cron schedule format: %', schedule;
  END IF;

  -- Create the cron job using Supabase's cron functionality
  PERFORM cron.schedule(
    job_name,
    schedule,
    'SELECT net.http_post(''https://gvblzovvpfeepnhifwqh.supabase.co/functions/v1/jobs/execute'', ''' || 
    request_body || '''::jsonb, ''{"Content-Type": "application/json"}''::jsonb);'
  );

  -- Log successful creation
  PERFORM log_job_event('CRON_CREATE_SUCCESS', job_id, jsonb_build_object(
    'job_name', job_name,
    'schedule', schedule
  ));
EXCEPTION WHEN OTHERS THEN
  -- Log failure
  PERFORM log_job_event('CRON_CREATE_ERROR', job_id, jsonb_build_object(
    'error', SQLERRM,
    'schedule', schedule
  ));
  RAISE;
END;
$$ LANGUAGE plpgsql;

-- Function to remove a cron job for a specific job
CREATE OR REPLACE FUNCTION remove_job_cron(
  job_id UUID
) RETURNS void AS $$
DECLARE
  job_name text := 'job_' || job_id::text;
BEGIN
  -- Log attempt to remove cron job
  PERFORM log_job_event('CRON_REMOVE_ATTEMPT', job_id, jsonb_build_object(
    'job_name', job_name
  ));

  -- Check if the job exists before trying to remove it
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = job_name) THEN
    PERFORM cron.unschedule(job_name);
    
    -- Log successful removal
    PERFORM log_job_event('CRON_REMOVE_SUCCESS', job_id, jsonb_build_object(
      'job_name', job_name
    ));
  ELSE
    -- Log that job wasn't found
    PERFORM log_job_event('CRON_REMOVE_SKIP', job_id, jsonb_build_object(
      'reason', 'Job not found',
      'job_name', job_name
    ));
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Log failure
  PERFORM log_job_event('CRON_REMOVE_ERROR', job_id, jsonb_build_object(
    'error', SQLERRM,
    'job_name', job_name
  ));
  RAISE;
END;
$$ LANGUAGE plpgsql;

-- Function to handle job insert
CREATE OR REPLACE FUNCTION handle_job_insert() RETURNS TRIGGER AS $$
BEGIN
  -- Log the insert attempt
  PERFORM log_job_event('INSERT_TRIGGER', NEW.id, jsonb_build_object(
    'type', NEW.related_object_type_id,
    'status', NEW.metadata->>'status',
    'has_schedule', (NEW.metadata->>'schedule') IS NOT NULL
  ));

  -- Check if this is a job object with planned status and schedule
  IF NEW.related_object_type_id = 'job' AND 
     NEW.metadata->>'status' = 'planned' AND 
     NEW.metadata->>'schedule' IS NOT NULL AND 
     NEW.metadata->>'schedule' != '' THEN
    
    -- Create the cron job
    PERFORM create_job_cron(
      NEW.id,
      NEW.owner_organisation_id,
      NEW.metadata->>'schedule'
    );
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log failure
  PERFORM log_job_event('INSERT_TRIGGER_ERROR', NEW.id, jsonb_build_object(
    'error', SQLERRM
  ));
  RAISE;
END;
$$ LANGUAGE plpgsql;

-- Function to handle job update
CREATE OR REPLACE FUNCTION handle_job_update() RETURNS TRIGGER AS $$
BEGIN
  -- Log the update attempt
  PERFORM log_job_event('UPDATE_TRIGGER', NEW.id, jsonb_build_object(
    'old_status', OLD.metadata->>'status',
    'new_status', NEW.metadata->>'status',
    'old_schedule', OLD.metadata->>'schedule',
    'new_schedule', NEW.metadata->>'schedule'
  ));

  -- Only attempt to remove existing cron job if this was a job type
  IF OLD.related_object_type_id = 'job' THEN
    PERFORM remove_job_cron(OLD.id);
  END IF;
  
  -- Check if the updated row meets the criteria for having a cron job
  IF NEW.related_object_type_id = 'job' AND 
     NEW.metadata->>'status' = 'planned' AND 
     NEW.metadata->>'schedule' IS NOT NULL AND 
     NEW.metadata->>'schedule' != '' THEN
    
    -- Create new cron job with updated details
    PERFORM create_job_cron(
      NEW.id,
      NEW.owner_organisation_id,
      NEW.metadata->>'schedule'
    );
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log failure
  PERFORM log_job_event('UPDATE_TRIGGER_ERROR', NEW.id, jsonb_build_object(
    'error', SQLERRM
  ));
  RAISE;
END;
$$ LANGUAGE plpgsql;

-- Function to handle job delete
CREATE OR REPLACE FUNCTION handle_job_delete() RETURNS TRIGGER AS $$
BEGIN
  -- Log the delete attempt
  PERFORM log_job_event('DELETE_TRIGGER', OLD.id, jsonb_build_object(
    'type', OLD.related_object_type_id,
    'status', OLD.metadata->>'status'
  ));

  -- Only attempt to remove cron job if this was a job type
  IF OLD.related_object_type_id = 'job' THEN
    PERFORM remove_job_cron(OLD.id);
  END IF;
  
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  -- Log failure
  PERFORM log_job_event('DELETE_TRIGGER_ERROR', OLD.id, jsonb_build_object(
    'error', SQLERRM
  ));
  RAISE;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers first
DROP TRIGGER IF EXISTS job_insert_trigger ON objects;
DROP TRIGGER IF EXISTS job_update_trigger ON objects;
DROP TRIGGER IF EXISTS job_delete_trigger ON objects;

-- Create triggers to call these functions
CREATE TRIGGER job_insert_trigger
  AFTER INSERT ON objects
  FOR EACH ROW
  EXECUTE FUNCTION handle_job_insert();

CREATE TRIGGER job_update_trigger
  AFTER UPDATE ON objects
  FOR EACH ROW
  EXECUTE FUNCTION handle_job_update();

CREATE TRIGGER job_delete_trigger
  BEFORE DELETE ON objects
  FOR EACH ROW
  EXECUTE FUNCTION handle_job_delete();