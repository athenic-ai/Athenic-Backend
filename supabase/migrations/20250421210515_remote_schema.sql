drop index if exists "public"."idx_sandbox_sessions_e2b_id";

alter type "public"."dictionary_term_types" rename to "dictionary_term_types__old_version_to_be_dropped";

create type "public"."dictionary_term_types" as enum ('accentColours', 'companyFeatures', 'defaultProductAreas', 'platformSources', 'productTypes', 'estimationSizes', 'taskTypes', 'userAdoptionStages', 'jobStatuses', 'signalCategories', 'estimationColours', 'jobRunStatuses', 'assistantStatuses', 'reminderStatuses');

alter table "public"."dictionary_terms" alter column type type "public"."dictionary_term_types" using type::text::"public"."dictionary_term_types";

alter table "public"."object_metadata_types" alter column dictionary_term_type type "public"."dictionary_term_types" using dictionary_term_type::text::"public"."dictionary_term_types";

drop type "public"."dictionary_term_types__old_version_to_be_dropped";

alter table "public"."sandbox_sessions" drop column "e2b_session_id";


