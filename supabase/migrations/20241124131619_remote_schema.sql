create type "admin"."DictionaryTermsTypes" as enum ('defaultProductAreas', 'platformSources', 'productTypes', 'taskEstimationSizes', 'taskTypes', 'userAdoptionStages');

create type "admin"."d" as enum ('dd');

create type "admin"."dictionaryTermsTypes" as enum ('defaultProductAreas', 'platformSources', 'productTypes', 'taskEstimationSizes', 'taskTypes', 'userAdoptionStages');

create type "admin"."dictionary_terms_types" as enum ('defaultProductAreas', 'platformSources', 'productTypes', 'taskEstimationSizes', 'taskTypes', 'userAdoptionStages');

create type "admin"."test" as enum ('t', 'e');

revoke delete on table "admin"."dictionaryTerms" from "anon";

revoke insert on table "admin"."dictionaryTerms" from "anon";

revoke references on table "admin"."dictionaryTerms" from "anon";

revoke select on table "admin"."dictionaryTerms" from "anon";

revoke trigger on table "admin"."dictionaryTerms" from "anon";

revoke truncate on table "admin"."dictionaryTerms" from "anon";

revoke update on table "admin"."dictionaryTerms" from "anon";

revoke delete on table "admin"."dictionaryTerms" from "authenticated";

revoke insert on table "admin"."dictionaryTerms" from "authenticated";

revoke references on table "admin"."dictionaryTerms" from "authenticated";

revoke select on table "admin"."dictionaryTerms" from "authenticated";

revoke trigger on table "admin"."dictionaryTerms" from "authenticated";

revoke truncate on table "admin"."dictionaryTerms" from "authenticated";

revoke update on table "admin"."dictionaryTerms" from "authenticated";

revoke delete on table "admin"."dictionaryTerms" from "service_role";

revoke insert on table "admin"."dictionaryTerms" from "service_role";

revoke references on table "admin"."dictionaryTerms" from "service_role";

revoke select on table "admin"."dictionaryTerms" from "service_role";

revoke trigger on table "admin"."dictionaryTerms" from "service_role";

revoke truncate on table "admin"."dictionaryTerms" from "service_role";

revoke update on table "admin"."dictionaryTerms" from "service_role";

alter table "admin"."dictionaryTerms" drop constraint "dictionaryTerms_pkey";

drop index if exists "admin"."dictionaryTerms_pkey";

drop table "admin"."dictionaryTerms";

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


