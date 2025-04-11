create table "admin"."dictionary_terms" (
    "id" text not null,
    "type" text not null,
    "description" text,
    "pretty_name" text,
    "value" double precision
);


alter table "admin"."dictionary_terms" enable row level security;

CREATE UNIQUE INDEX dictionary_terms_pkey ON admin.dictionary_terms USING btree (id);

alter table "admin"."dictionary_terms" add constraint "dictionary_terms_pkey" PRIMARY KEY using index "dictionary_terms_pkey";

grant delete on table "admin"."dictionary_terms" to "anon";

grant insert on table "admin"."dictionary_terms" to "anon";

grant references on table "admin"."dictionary_terms" to "anon";

grant select on table "admin"."dictionary_terms" to "anon";

grant trigger on table "admin"."dictionary_terms" to "anon";

grant truncate on table "admin"."dictionary_terms" to "anon";

grant update on table "admin"."dictionary_terms" to "anon";

grant delete on table "admin"."dictionary_terms" to "authenticated";

grant insert on table "admin"."dictionary_terms" to "authenticated";

grant references on table "admin"."dictionary_terms" to "authenticated";

grant select on table "admin"."dictionary_terms" to "authenticated";

grant trigger on table "admin"."dictionary_terms" to "authenticated";

grant truncate on table "admin"."dictionary_terms" to "authenticated";

grant update on table "admin"."dictionary_terms" to "authenticated";

grant delete on table "admin"."dictionary_terms" to "service_role";

grant insert on table "admin"."dictionary_terms" to "service_role";

grant references on table "admin"."dictionary_terms" to "service_role";

grant select on table "admin"."dictionary_terms" to "service_role";

grant trigger on table "admin"."dictionary_terms" to "service_role";

grant truncate on table "admin"."dictionary_terms" to "service_role";

grant update on table "admin"."dictionary_terms" to "service_role";

create policy "Enable read access for all users"
on "admin"."dictionary_terms"
as permissive
for select
to public
using (true);



create extension if not exists "vector" with schema "extensions";


create type "public"."data_type" as enum ('boolean', 'integer', 'number', 'object', 'string');

create type "public"."dictionary_term_types" as enum ('accentColours', 'companyFeatures', 'defaultProductAreas', 'platformSources', 'productTypes', 'estimationSizes', 'taskTypes', 'userAdoptionStages', 'jobStatuses', 'signalCategories', 'estimationColours', 'jobRunStatuses', 'assistantStatuses');

create type "public"."object_type_categories" as enum ('organisation_data_standard', 'organisation_data_special', 'company_data');

create table "public"."connection_member_mapping" (
    "connection" text not null,
    "connection_id" text not null,
    "member_id" uuid not null
);


alter table "public"."connection_member_mapping" enable row level security;

create table "public"."connection_organisation_mapping" (
    "connection" text not null,
    "connection_id" text not null,
    "organisation_id" text not null
);


alter table "public"."connection_organisation_mapping" enable row level security;

create table "public"."dictionary_terms" (
    "id" text not null,
    "type" dictionary_term_types not null,
    "description" text,
    "pretty_name" text not null,
    "value" numeric,
    "colour" numeric
);


alter table "public"."dictionary_terms" enable row level security;

create table "public"."field_types" (
    "id" text not null,
    "name" text not null,
    "description" text,
    "is_array" boolean not null default false,
    "data_type" data_type not null,
    "icon" text
);


alter table "public"."field_types" enable row level security;

create table "public"."members" (
    "id" uuid not null default gen_random_uuid(),
    "owner_organisation_id" text not null,
    "email" text,
    "first_name" text,
    "last_name" text,
    "connection_metadata" jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone default now(),
    "enabled" boolean not null,
    "roles" text[]
);


alter table "public"."members" enable row level security;

create table "public"."object_metadata_types" (
    "id" text not null,
    "owner_organisation_id" text,
    "name" text not null,
    "description" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone default now(),
    "allow_ai_update" boolean not null default true,
    "related_object_type_id" text not null,
    "is_required" boolean not null default false,
    "field_type_id" text not null,
    "dictionary_term_type" dictionary_term_types,
    "max_value" numeric,
    "accent_colour_id" text,
    "order_priority" smallint,
    "owner_member_id" uuid,
    "is_visible" boolean not null default true
);


alter table "public"."object_metadata_types" enable row level security;

create table "public"."object_types" (
    "id" text not null,
    "owner_organisation_id" text,
    "name" text not null,
    "description" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone default now(),
    "parent_object_type_id" text,
    "name_plural" text not null,
    "icon" text,
    "category" object_type_categories not null,
    "owner_member_id" uuid,
    "order_priority" smallint,
    "visible" boolean not null default true,
    "metadata_type_state_controller" text
);


alter table "public"."object_types" enable row level security;

create table "public"."objects" (
    "id" uuid not null default gen_random_uuid(),
    "related_object_type_id" text not null,
    "owner_organisation_id" text,
    "metadata" jsonb,
    "created_at" timestamp with time zone not null default now(),
    "embedding" vector,
    "owner_member_id" uuid
);


alter table "public"."objects" enable row level security;

create table "public"."organisations" (
    "id" text not null,
    "enabled" boolean not null default true,
    "name" text,
    "connection_metadata" jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone default now(),
    "sub_tier" text,
    "sub_expiry" timestamp with time zone,
    "user_data_anonymous" boolean not null default false,
    "max_risk_appetite_old" numeric not null default '0'::numeric,
    "max_risk_appetite" text
);


alter table "public"."organisations" enable row level security;

CREATE UNIQUE INDEX connection_member_mapping_pkey ON public.connection_member_mapping USING btree (connection, connection_id);

CREATE UNIQUE INDEX connection_organisation_mapping_pkey ON public.connection_organisation_mapping USING btree (connection, connection_id);

CREATE UNIQUE INDEX data_types_id_key ON public.field_types USING btree (id);

CREATE UNIQUE INDEX data_types_pkey ON public.field_types USING btree (id);

CREATE UNIQUE INDEX dictionary_terms_id_key ON public.dictionary_terms USING btree (id);

CREATE UNIQUE INDEX dictionary_terms_pkey ON public.dictionary_terms USING btree (id);

CREATE UNIQUE INDEX members_id_key ON public.members USING btree (id);

CREATE UNIQUE INDEX members_pkey ON public.members USING btree (id);

CREATE UNIQUE INDEX object_metadata_types_pkey ON public.object_metadata_types USING btree (id, related_object_type_id);

CREATE UNIQUE INDEX object_types_pkey ON public.object_types USING btree (id);

CREATE UNIQUE INDEX object_types_slug_key ON public.object_types USING btree (id);

CREATE UNIQUE INDEX objects_id_key ON public.objects USING btree (id);

CREATE UNIQUE INDEX objects_pkey ON public.objects USING btree (id);

CREATE UNIQUE INDEX organisations_id_key ON public.organisations USING btree (id);

CREATE UNIQUE INDEX teams_pkey ON public.organisations USING btree (id);

alter table "public"."connection_member_mapping" add constraint "connection_member_mapping_pkey" PRIMARY KEY using index "connection_member_mapping_pkey";

alter table "public"."connection_organisation_mapping" add constraint "connection_organisation_mapping_pkey" PRIMARY KEY using index "connection_organisation_mapping_pkey";

alter table "public"."dictionary_terms" add constraint "dictionary_terms_pkey" PRIMARY KEY using index "dictionary_terms_pkey";

alter table "public"."field_types" add constraint "data_types_pkey" PRIMARY KEY using index "data_types_pkey";

alter table "public"."members" add constraint "members_pkey" PRIMARY KEY using index "members_pkey";

alter table "public"."object_metadata_types" add constraint "object_metadata_types_pkey" PRIMARY KEY using index "object_metadata_types_pkey";

alter table "public"."object_types" add constraint "object_types_pkey" PRIMARY KEY using index "object_types_pkey";

alter table "public"."objects" add constraint "objects_pkey" PRIMARY KEY using index "objects_pkey";

alter table "public"."organisations" add constraint "teams_pkey" PRIMARY KEY using index "teams_pkey";

alter table "public"."connection_member_mapping" add constraint "connection_member_mapping_member_id_fkey" FOREIGN KEY (member_id) REFERENCES members(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."connection_member_mapping" validate constraint "connection_member_mapping_member_id_fkey";

alter table "public"."connection_organisation_mapping" add constraint "connection_organisation_mapping_organisation_id_fkey" FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."connection_organisation_mapping" validate constraint "connection_organisation_mapping_organisation_id_fkey";

alter table "public"."dictionary_terms" add constraint "dictionary_terms_id_key" UNIQUE using index "dictionary_terms_id_key";

alter table "public"."field_types" add constraint "data_types_id_key" UNIQUE using index "data_types_id_key";

alter table "public"."members" add constraint "members_id_key" UNIQUE using index "members_id_key";

alter table "public"."members" add constraint "members_owner_organisation_id_fkey" FOREIGN KEY (owner_organisation_id) REFERENCES organisations(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."members" validate constraint "members_owner_organisation_id_fkey";

alter table "public"."object_metadata_types" add constraint "object_metadata_types_accent_colour_id_fkey" FOREIGN KEY (accent_colour_id) REFERENCES dictionary_terms(id) not valid;

alter table "public"."object_metadata_types" validate constraint "object_metadata_types_accent_colour_id_fkey";

alter table "public"."object_metadata_types" add constraint "object_metadata_types_field_type_id_fkey" FOREIGN KEY (field_type_id) REFERENCES field_types(id) not valid;

alter table "public"."object_metadata_types" validate constraint "object_metadata_types_field_type_id_fkey";

alter table "public"."object_metadata_types" add constraint "object_metadata_types_owner_member_id_fkey" FOREIGN KEY (owner_member_id) REFERENCES members(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."object_metadata_types" validate constraint "object_metadata_types_owner_member_id_fkey";

alter table "public"."object_metadata_types" add constraint "object_metadata_types_owner_organisation_id_fkey" FOREIGN KEY (owner_organisation_id) REFERENCES organisations(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."object_metadata_types" validate constraint "object_metadata_types_owner_organisation_id_fkey";

alter table "public"."object_metadata_types" add constraint "object_metadata_types_related_object_type_id_fkey" FOREIGN KEY (related_object_type_id) REFERENCES object_types(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."object_metadata_types" validate constraint "object_metadata_types_related_object_type_id_fkey";

alter table "public"."object_types" add constraint "object_types_metadata_type_state_controller_id_fkey" FOREIGN KEY (metadata_type_state_controller, id) REFERENCES object_metadata_types(id, related_object_type_id) ON UPDATE CASCADE ON DELETE SET DEFAULT not valid;

alter table "public"."object_types" validate constraint "object_types_metadata_type_state_controller_id_fkey";

alter table "public"."object_types" add constraint "object_types_owner_member_id_fkey" FOREIGN KEY (owner_member_id) REFERENCES members(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."object_types" validate constraint "object_types_owner_member_id_fkey";

alter table "public"."object_types" add constraint "object_types_owner_organisation_id_fkey" FOREIGN KEY (owner_organisation_id) REFERENCES organisations(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."object_types" validate constraint "object_types_owner_organisation_id_fkey";

alter table "public"."object_types" add constraint "object_types_parent_object_type_id_fkey" FOREIGN KEY (parent_object_type_id) REFERENCES object_types(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."object_types" validate constraint "object_types_parent_object_type_id_fkey";

alter table "public"."object_types" add constraint "object_types_slug_key" UNIQUE using index "object_types_slug_key";

alter table "public"."objects" add constraint "objects_id_key" UNIQUE using index "objects_id_key";

alter table "public"."objects" add constraint "objects_owner_member_id_fkey" FOREIGN KEY (owner_member_id) REFERENCES members(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."objects" validate constraint "objects_owner_member_id_fkey";

alter table "public"."objects" add constraint "objects_owner_organisation_id_fkey" FOREIGN KEY (owner_organisation_id) REFERENCES organisations(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."objects" validate constraint "objects_owner_organisation_id_fkey";

alter table "public"."objects" add constraint "objects_related_object_type_id_fkey" FOREIGN KEY (related_object_type_id) REFERENCES object_types(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."objects" validate constraint "objects_related_object_type_id_fkey";

alter table "public"."organisations" add constraint "organisations_id_key" UNIQUE using index "organisations_id_key";

alter table "public"."organisations" add constraint "organisations_max_risk_appetite_fkey" FOREIGN KEY (max_risk_appetite) REFERENCES dictionary_terms(id) ON UPDATE CASCADE not valid;

alter table "public"."organisations" validate constraint "organisations_max_risk_appetite_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.create_job_cron(job_id uuid, owner_organisation_id text, schedule text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.create_job_cron(job_id uuid, owner_organisation_id uuid, schedule text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
  IF NOT regexp_match(schedule, '^(\S+\s+){4}\S+$') IS NOT NULL THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_job_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_job_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_job_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.log_job_event(event_type text, job_id uuid, details jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Log to Postgres logs with structured JSON
  RAISE LOG '%',
    json_build_object(
      'level', 'INFO',
      'message', format('Job Event: %s for job %s', event_type, job_id),
      'metadata', details
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.match_table_rows(query_embedding vector, match_threshold double precision, match_count integer, search_table_name text, filter_org_id text DEFAULT NULL::text, filter_member_id uuid DEFAULT NULL::uuid, required_object_type_id text DEFAULT NULL::text)
 RETURNS TABLE(similarity double precision, id uuid, owner_organisation_id text, owner_member_id uuid, related_object_type_id text, metadata jsonb)
 LANGUAGE plpgsql
AS $function$
declare
  dynamic_query text;
begin
  dynamic_query := format(
    'select 
      1 - (t.embedding <=> %L) as similarity,
      t.id,
      t.owner_organisation_id,
      t.owner_member_id,
      t.related_object_type_id,
      t.metadata
    from %I t
    where 1 - (t.embedding <=> %L) > %L
    and (
      CASE 
        WHEN %L::text IS NULL THEN t.owner_organisation_id IS NULL  -- When no org_id filter, only match null values
        ELSE (t.owner_organisation_id = %L OR t.owner_organisation_id IS NULL)  -- When org_id specified, match that value OR nulls
      END
    )
    and (
      CASE 
        WHEN %L::uuid IS NULL THEN t.owner_member_id IS NULL  -- When no member_id filter, only match null values
        ELSE (t.owner_member_id = %L OR t.owner_member_id IS NULL)  -- When member_id specified, match that value OR nulls
      END
    )
    and (
      %L::text IS NULL  -- When no object_type_id filter specified, match any value
      OR t.related_object_type_id = %L  -- When specified, must match exactly
    )
    order by t.embedding <=> %L
    limit %L',
    query_embedding,
    search_table_name,
    query_embedding,
    match_threshold,
    filter_org_id, filter_org_id,
    filter_member_id, filter_member_id,
    required_object_type_id, required_object_type_id,
    query_embedding,
    match_count
  );
  
  return query execute dynamic_query;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.remove_job_cron(job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

grant delete on table "public"."connection_member_mapping" to "anon";

grant insert on table "public"."connection_member_mapping" to "anon";

grant references on table "public"."connection_member_mapping" to "anon";

grant select on table "public"."connection_member_mapping" to "anon";

grant trigger on table "public"."connection_member_mapping" to "anon";

grant truncate on table "public"."connection_member_mapping" to "anon";

grant update on table "public"."connection_member_mapping" to "anon";

grant delete on table "public"."connection_member_mapping" to "authenticated";

grant insert on table "public"."connection_member_mapping" to "authenticated";

grant references on table "public"."connection_member_mapping" to "authenticated";

grant select on table "public"."connection_member_mapping" to "authenticated";

grant trigger on table "public"."connection_member_mapping" to "authenticated";

grant truncate on table "public"."connection_member_mapping" to "authenticated";

grant update on table "public"."connection_member_mapping" to "authenticated";

grant delete on table "public"."connection_member_mapping" to "service_role";

grant insert on table "public"."connection_member_mapping" to "service_role";

grant references on table "public"."connection_member_mapping" to "service_role";

grant select on table "public"."connection_member_mapping" to "service_role";

grant trigger on table "public"."connection_member_mapping" to "service_role";

grant truncate on table "public"."connection_member_mapping" to "service_role";

grant update on table "public"."connection_member_mapping" to "service_role";

grant delete on table "public"."connection_organisation_mapping" to "anon";

grant insert on table "public"."connection_organisation_mapping" to "anon";

grant references on table "public"."connection_organisation_mapping" to "anon";

grant select on table "public"."connection_organisation_mapping" to "anon";

grant trigger on table "public"."connection_organisation_mapping" to "anon";

grant truncate on table "public"."connection_organisation_mapping" to "anon";

grant update on table "public"."connection_organisation_mapping" to "anon";

grant delete on table "public"."connection_organisation_mapping" to "authenticated";

grant insert on table "public"."connection_organisation_mapping" to "authenticated";

grant references on table "public"."connection_organisation_mapping" to "authenticated";

grant select on table "public"."connection_organisation_mapping" to "authenticated";

grant trigger on table "public"."connection_organisation_mapping" to "authenticated";

grant truncate on table "public"."connection_organisation_mapping" to "authenticated";

grant update on table "public"."connection_organisation_mapping" to "authenticated";

grant delete on table "public"."connection_organisation_mapping" to "service_role";

grant insert on table "public"."connection_organisation_mapping" to "service_role";

grant references on table "public"."connection_organisation_mapping" to "service_role";

grant select on table "public"."connection_organisation_mapping" to "service_role";

grant trigger on table "public"."connection_organisation_mapping" to "service_role";

grant truncate on table "public"."connection_organisation_mapping" to "service_role";

grant update on table "public"."connection_organisation_mapping" to "service_role";

grant delete on table "public"."dictionary_terms" to "anon";

grant insert on table "public"."dictionary_terms" to "anon";

grant references on table "public"."dictionary_terms" to "anon";

grant select on table "public"."dictionary_terms" to "anon";

grant trigger on table "public"."dictionary_terms" to "anon";

grant truncate on table "public"."dictionary_terms" to "anon";

grant update on table "public"."dictionary_terms" to "anon";

grant delete on table "public"."dictionary_terms" to "authenticated";

grant insert on table "public"."dictionary_terms" to "authenticated";

grant references on table "public"."dictionary_terms" to "authenticated";

grant select on table "public"."dictionary_terms" to "authenticated";

grant trigger on table "public"."dictionary_terms" to "authenticated";

grant truncate on table "public"."dictionary_terms" to "authenticated";

grant update on table "public"."dictionary_terms" to "authenticated";

grant delete on table "public"."dictionary_terms" to "service_role";

grant insert on table "public"."dictionary_terms" to "service_role";

grant references on table "public"."dictionary_terms" to "service_role";

grant select on table "public"."dictionary_terms" to "service_role";

grant trigger on table "public"."dictionary_terms" to "service_role";

grant truncate on table "public"."dictionary_terms" to "service_role";

grant update on table "public"."dictionary_terms" to "service_role";

grant delete on table "public"."field_types" to "anon";

grant insert on table "public"."field_types" to "anon";

grant references on table "public"."field_types" to "anon";

grant select on table "public"."field_types" to "anon";

grant trigger on table "public"."field_types" to "anon";

grant truncate on table "public"."field_types" to "anon";

grant update on table "public"."field_types" to "anon";

grant delete on table "public"."field_types" to "authenticated";

grant insert on table "public"."field_types" to "authenticated";

grant references on table "public"."field_types" to "authenticated";

grant select on table "public"."field_types" to "authenticated";

grant trigger on table "public"."field_types" to "authenticated";

grant truncate on table "public"."field_types" to "authenticated";

grant update on table "public"."field_types" to "authenticated";

grant delete on table "public"."field_types" to "service_role";

grant insert on table "public"."field_types" to "service_role";

grant references on table "public"."field_types" to "service_role";

grant select on table "public"."field_types" to "service_role";

grant trigger on table "public"."field_types" to "service_role";

grant truncate on table "public"."field_types" to "service_role";

grant update on table "public"."field_types" to "service_role";

grant delete on table "public"."members" to "anon";

grant insert on table "public"."members" to "anon";

grant references on table "public"."members" to "anon";

grant select on table "public"."members" to "anon";

grant trigger on table "public"."members" to "anon";

grant truncate on table "public"."members" to "anon";

grant update on table "public"."members" to "anon";

grant delete on table "public"."members" to "authenticated";

grant insert on table "public"."members" to "authenticated";

grant references on table "public"."members" to "authenticated";

grant select on table "public"."members" to "authenticated";

grant trigger on table "public"."members" to "authenticated";

grant truncate on table "public"."members" to "authenticated";

grant update on table "public"."members" to "authenticated";

grant delete on table "public"."members" to "service_role";

grant insert on table "public"."members" to "service_role";

grant references on table "public"."members" to "service_role";

grant select on table "public"."members" to "service_role";

grant trigger on table "public"."members" to "service_role";

grant truncate on table "public"."members" to "service_role";

grant update on table "public"."members" to "service_role";

grant delete on table "public"."object_metadata_types" to "anon";

grant insert on table "public"."object_metadata_types" to "anon";

grant references on table "public"."object_metadata_types" to "anon";

grant select on table "public"."object_metadata_types" to "anon";

grant trigger on table "public"."object_metadata_types" to "anon";

grant truncate on table "public"."object_metadata_types" to "anon";

grant update on table "public"."object_metadata_types" to "anon";

grant delete on table "public"."object_metadata_types" to "authenticated";

grant insert on table "public"."object_metadata_types" to "authenticated";

grant references on table "public"."object_metadata_types" to "authenticated";

grant select on table "public"."object_metadata_types" to "authenticated";

grant trigger on table "public"."object_metadata_types" to "authenticated";

grant truncate on table "public"."object_metadata_types" to "authenticated";

grant update on table "public"."object_metadata_types" to "authenticated";

grant delete on table "public"."object_metadata_types" to "service_role";

grant insert on table "public"."object_metadata_types" to "service_role";

grant references on table "public"."object_metadata_types" to "service_role";

grant select on table "public"."object_metadata_types" to "service_role";

grant trigger on table "public"."object_metadata_types" to "service_role";

grant truncate on table "public"."object_metadata_types" to "service_role";

grant update on table "public"."object_metadata_types" to "service_role";

grant delete on table "public"."object_types" to "anon";

grant insert on table "public"."object_types" to "anon";

grant references on table "public"."object_types" to "anon";

grant select on table "public"."object_types" to "anon";

grant trigger on table "public"."object_types" to "anon";

grant truncate on table "public"."object_types" to "anon";

grant update on table "public"."object_types" to "anon";

grant delete on table "public"."object_types" to "authenticated";

grant insert on table "public"."object_types" to "authenticated";

grant references on table "public"."object_types" to "authenticated";

grant select on table "public"."object_types" to "authenticated";

grant trigger on table "public"."object_types" to "authenticated";

grant truncate on table "public"."object_types" to "authenticated";

grant update on table "public"."object_types" to "authenticated";

grant delete on table "public"."object_types" to "service_role";

grant insert on table "public"."object_types" to "service_role";

grant references on table "public"."object_types" to "service_role";

grant select on table "public"."object_types" to "service_role";

grant trigger on table "public"."object_types" to "service_role";

grant truncate on table "public"."object_types" to "service_role";

grant update on table "public"."object_types" to "service_role";

grant delete on table "public"."objects" to "anon";

grant insert on table "public"."objects" to "anon";

grant references on table "public"."objects" to "anon";

grant select on table "public"."objects" to "anon";

grant trigger on table "public"."objects" to "anon";

grant truncate on table "public"."objects" to "anon";

grant update on table "public"."objects" to "anon";

grant delete on table "public"."objects" to "authenticated";

grant insert on table "public"."objects" to "authenticated";

grant references on table "public"."objects" to "authenticated";

grant select on table "public"."objects" to "authenticated";

grant trigger on table "public"."objects" to "authenticated";

grant truncate on table "public"."objects" to "authenticated";

grant update on table "public"."objects" to "authenticated";

grant delete on table "public"."objects" to "service_role";

grant insert on table "public"."objects" to "service_role";

grant references on table "public"."objects" to "service_role";

grant select on table "public"."objects" to "service_role";

grant trigger on table "public"."objects" to "service_role";

grant truncate on table "public"."objects" to "service_role";

grant update on table "public"."objects" to "service_role";

grant delete on table "public"."organisations" to "anon";

grant insert on table "public"."organisations" to "anon";

grant references on table "public"."organisations" to "anon";

grant select on table "public"."organisations" to "anon";

grant trigger on table "public"."organisations" to "anon";

grant truncate on table "public"."organisations" to "anon";

grant update on table "public"."organisations" to "anon";

grant delete on table "public"."organisations" to "authenticated";

grant insert on table "public"."organisations" to "authenticated";

grant references on table "public"."organisations" to "authenticated";

grant select on table "public"."organisations" to "authenticated";

grant trigger on table "public"."organisations" to "authenticated";

grant truncate on table "public"."organisations" to "authenticated";

grant update on table "public"."organisations" to "authenticated";

grant delete on table "public"."organisations" to "service_role";

grant insert on table "public"."organisations" to "service_role";

grant references on table "public"."organisations" to "service_role";

grant select on table "public"."organisations" to "service_role";

grant trigger on table "public"."organisations" to "service_role";

grant truncate on table "public"."organisations" to "service_role";

grant update on table "public"."organisations" to "service_role";

create policy "Enable insert for authenticated users only"
on "public"."connection_member_mapping"
as permissive
for all
to authenticated
with check (true);


create policy "Enable read access for all users"
on "public"."connection_member_mapping"
as permissive
for select
to public
using (true);


create policy "Enable insert for authenticated users only"
on "public"."connection_organisation_mapping"
as permissive
for all
to authenticated
with check (true);


create policy "Enable read access for all users"
on "public"."connection_organisation_mapping"
as permissive
for select
to public
using (true);


create policy "Enable read access for all users"
on "public"."dictionary_terms"
as permissive
for select
to public
using (true);


create policy "Enable read access for all users"
on "public"."field_types"
as permissive
for select
to public
using (true);


create policy "Allow member to manage their own row"
on "public"."members"
as permissive
for all
to public
using ((auth.uid() = id));


create policy "Enable all for authenticated users only (improve this)"
on "public"."object_metadata_types"
as permissive
for all
to authenticated
using (true)
with check (true);


create policy "Enable all for authenticated users only (improve this)"
on "public"."object_types"
as permissive
for all
to authenticated
using (true)
with check (true);


create policy "Allow insert for auth users where owner org is null"
on "public"."objects"
as permissive
for insert
to authenticated
with check (true);


create policy "CRUD own objects"
on "public"."objects"
as permissive
for all
to public
using ((EXISTS ( SELECT 1
   FROM members
  WHERE ((members.owner_organisation_id = objects.owner_organisation_id) AND (members.id = auth.uid())))));


create policy "Create team row if member authorised"
on "public"."organisations"
as permissive
for insert
to authenticated
with check (true);


create policy "Delete team row if member in correct team"
on "public"."organisations"
as permissive
for delete
to public
using ((EXISTS ( SELECT 1
   FROM members
  WHERE ((members.owner_organisation_id = organisations.id) AND (members.id = auth.uid())))));


create policy "Update team row if member in correct team"
on "public"."organisations"
as permissive
for update
to public
using ((EXISTS ( SELECT 1
   FROM members
  WHERE ((members.owner_organisation_id = organisations.id) AND (members.id = auth.uid())))));


create policy "select_teams_policy"
on "public"."organisations"
as permissive
for select
to public
using (((EXISTS ( SELECT 1
   FROM members
  WHERE ((members.id = auth.uid()) AND (members.owner_organisation_id = organisations.id)))) OR (NOT (EXISTS ( SELECT 1
   FROM members
  WHERE (members.id = auth.uid()))))));


CREATE TRIGGER job_delete_trigger BEFORE DELETE ON public.objects FOR EACH ROW EXECUTE FUNCTION handle_job_delete();

CREATE TRIGGER job_insert_trigger AFTER INSERT ON public.objects FOR EACH ROW EXECUTE FUNCTION handle_job_insert();

CREATE TRIGGER job_update_trigger AFTER UPDATE ON public.objects FOR EACH ROW EXECUTE FUNCTION handle_job_update();


