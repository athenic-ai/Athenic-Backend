revoke delete on table "admin"."dictionary_terms" from "anon";

revoke insert on table "admin"."dictionary_terms" from "anon";

revoke references on table "admin"."dictionary_terms" from "anon";

revoke select on table "admin"."dictionary_terms" from "anon";

revoke trigger on table "admin"."dictionary_terms" from "anon";

revoke truncate on table "admin"."dictionary_terms" from "anon";

revoke update on table "admin"."dictionary_terms" from "anon";

revoke delete on table "admin"."dictionary_terms" from "authenticated";

revoke insert on table "admin"."dictionary_terms" from "authenticated";

revoke references on table "admin"."dictionary_terms" from "authenticated";

revoke select on table "admin"."dictionary_terms" from "authenticated";

revoke trigger on table "admin"."dictionary_terms" from "authenticated";

revoke truncate on table "admin"."dictionary_terms" from "authenticated";

revoke update on table "admin"."dictionary_terms" from "authenticated";

revoke delete on table "admin"."dictionary_terms" from "service_role";

revoke insert on table "admin"."dictionary_terms" from "service_role";

revoke references on table "admin"."dictionary_terms" from "service_role";

revoke select on table "admin"."dictionary_terms" from "service_role";

revoke trigger on table "admin"."dictionary_terms" from "service_role";

revoke truncate on table "admin"."dictionary_terms" from "service_role";

revoke update on table "admin"."dictionary_terms" from "service_role";

alter table "admin"."dictionary_terms" drop constraint "dictionary_terms_pkey";

drop index if exists "admin"."dictionary_terms_pkey";

drop table "admin"."dictionary_terms";

drop type "admin"."DictionaryTermsTypes";

drop type "admin"."d";

drop type "admin"."dictionaryTermsTypes";

drop type "admin"."dictionary_terms_types";

drop type "admin"."test";


