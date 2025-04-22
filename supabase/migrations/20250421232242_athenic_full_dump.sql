--
-- PostgreSQL database dump
--

-- Dumped from database version 15.6
-- Dumped by pg_dump version 15.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

DROP POLICY select_teams_policy ON public.organisations;
DROP POLICY "Update team row if member in correct team" ON public.organisations;
DROP POLICY "Enable read access for all users" ON public.field_types;
DROP POLICY "Enable read access for all users" ON public.dictionary_terms;
DROP POLICY "Enable read access for all users" ON public.connection_organisation_mapping;
DROP POLICY "Enable read access for all users" ON public.connection_member_mapping;
DROP POLICY "Enable insert for authenticated users only" ON public.connection_organisation_mapping;
DROP POLICY "Enable insert for authenticated users only" ON public.connection_member_mapping;
DROP POLICY "Enable all for authenticated users only (improve this)" ON public.object_types;
DROP POLICY "Enable all for authenticated users only (improve this)" ON public.object_metadata_types;
DROP POLICY "Delete team row if member in correct team" ON public.organisations;
DROP POLICY "Create team row if member authorised" ON public.organisations;
DROP POLICY "CRUD own objects" ON public.objects;
DROP POLICY "Allow member to manage their own row" ON public.members;
DROP POLICY "Allow insert for auth users where owner org is null" ON public.objects;
ALTER TABLE ONLY public.organisations DROP CONSTRAINT organisations_max_risk_appetite_fkey;
ALTER TABLE ONLY public.objects DROP CONSTRAINT objects_related_object_type_id_fkey;
ALTER TABLE ONLY public.objects DROP CONSTRAINT objects_owner_organisation_id_fkey;
ALTER TABLE ONLY public.objects DROP CONSTRAINT objects_owner_member_id_fkey;
ALTER TABLE ONLY public.object_types DROP CONSTRAINT object_types_parent_object_type_id_fkey;
ALTER TABLE ONLY public.object_types DROP CONSTRAINT object_types_owner_organisation_id_fkey;
ALTER TABLE ONLY public.object_types DROP CONSTRAINT object_types_owner_member_id_fkey;
ALTER TABLE ONLY public.object_types DROP CONSTRAINT object_types_metadata_type_state_controller_id_fkey;
ALTER TABLE ONLY public.object_metadata_types DROP CONSTRAINT object_metadata_types_related_object_type_id_fkey;
ALTER TABLE ONLY public.object_metadata_types DROP CONSTRAINT object_metadata_types_owner_organisation_id_fkey;
ALTER TABLE ONLY public.object_metadata_types DROP CONSTRAINT object_metadata_types_owner_member_id_fkey;
ALTER TABLE ONLY public.object_metadata_types DROP CONSTRAINT object_metadata_types_field_type_id_fkey;
ALTER TABLE ONLY public.object_metadata_types DROP CONSTRAINT object_metadata_types_accent_colour_id_fkey;
ALTER TABLE ONLY public.members DROP CONSTRAINT members_owner_organisation_id_fkey;
ALTER TABLE ONLY public.connection_organisation_mapping DROP CONSTRAINT connection_organisation_mapping_organisation_id_fkey;
ALTER TABLE ONLY public.connection_member_mapping DROP CONSTRAINT connection_member_mapping_member_id_fkey;
DROP TRIGGER job_update_trigger ON public.objects;
DROP TRIGGER job_insert_trigger ON public.objects;
DROP TRIGGER job_delete_trigger ON public.objects;
DROP INDEX public.idx_sandbox_sessions_last_used;
DROP INDEX public.idx_sandbox_sessions_key;
DROP INDEX public.idx_sandbox_sessions_e2b_id;
ALTER TABLE ONLY public.organisations DROP CONSTRAINT teams_pkey;
ALTER TABLE ONLY public.sandbox_sessions DROP CONSTRAINT sandbox_sessions_session_key_key;
ALTER TABLE ONLY public.sandbox_sessions DROP CONSTRAINT sandbox_sessions_pkey;
ALTER TABLE ONLY public.organisations DROP CONSTRAINT organisations_id_key;
ALTER TABLE ONLY public.objects DROP CONSTRAINT objects_pkey;
ALTER TABLE ONLY public.objects DROP CONSTRAINT objects_id_key;
ALTER TABLE ONLY public.object_types DROP CONSTRAINT object_types_slug_key;
ALTER TABLE ONLY public.object_types DROP CONSTRAINT object_types_pkey;
ALTER TABLE ONLY public.object_metadata_types DROP CONSTRAINT object_metadata_types_pkey;
ALTER TABLE ONLY public.members DROP CONSTRAINT members_pkey;
ALTER TABLE ONLY public.members DROP CONSTRAINT members_id_key;
ALTER TABLE ONLY public.dictionary_terms DROP CONSTRAINT dictionary_terms_pkey;
ALTER TABLE ONLY public.dictionary_terms DROP CONSTRAINT dictionary_terms_id_key;
ALTER TABLE ONLY public.field_types DROP CONSTRAINT data_types_pkey;
ALTER TABLE ONLY public.field_types DROP CONSTRAINT data_types_id_key;
ALTER TABLE ONLY public.connection_organisation_mapping DROP CONSTRAINT connection_organisation_mapping_pkey;
ALTER TABLE ONLY public.connection_member_mapping DROP CONSTRAINT connection_member_mapping_pkey;
ALTER TABLE public.sandbox_sessions ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE public.sandbox_sessions_id_seq;
DROP TABLE public.sandbox_sessions;
DROP TABLE public.organisations;
DROP TABLE public.objects;
DROP TABLE public.object_types;
DROP TABLE public.object_metadata_types;
DROP TABLE public.members;
DROP TABLE public.field_types;
DROP TABLE public.dictionary_terms;
DROP TABLE public.connection_organisation_mapping;
DROP TABLE public.connection_member_mapping;
SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: connection_member_mapping; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.connection_member_mapping (
    connection text NOT NULL,
    connection_id text NOT NULL,
    member_id uuid NOT NULL
);


ALTER TABLE public.connection_member_mapping OWNER TO postgres;

--
-- Name: connection_organisation_mapping; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.connection_organisation_mapping (
    connection text NOT NULL,
    connection_id text NOT NULL,
    organisation_id text NOT NULL
);


ALTER TABLE public.connection_organisation_mapping OWNER TO postgres;

--
-- Name: dictionary_terms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dictionary_terms (
    id text NOT NULL,
    type public.dictionary_term_types NOT NULL,
    description text,
    pretty_name text NOT NULL,
    value numeric,
    colour numeric
);


ALTER TABLE public.dictionary_terms OWNER TO postgres;

--
-- Name: field_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.field_types (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    is_array boolean DEFAULT false NOT NULL,
    data_type public.data_type NOT NULL,
    icon text
);


ALTER TABLE public.field_types OWNER TO postgres;

--
-- Name: members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_organisation_id text NOT NULL,
    email text,
    first_name text,
    last_name text,
    connection_metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    enabled boolean NOT NULL,
    roles text[]
);


ALTER TABLE public.members OWNER TO postgres;

--
-- Name: object_metadata_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.object_metadata_types (
    id text NOT NULL,
    owner_organisation_id text,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    allow_ai_update boolean DEFAULT true NOT NULL,
    related_object_type_id text NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    field_type_id text NOT NULL,
    dictionary_term_type public.dictionary_term_types,
    max_value numeric,
    accent_colour_id text,
    order_priority smallint,
    owner_member_id uuid,
    is_visible boolean DEFAULT true NOT NULL
);


ALTER TABLE public.object_metadata_types OWNER TO postgres;

--
-- Name: object_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.object_types (
    id text NOT NULL,
    owner_organisation_id text,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    parent_object_type_id text,
    name_plural text NOT NULL,
    icon text,
    category public.object_type_categories NOT NULL,
    owner_member_id uuid,
    order_priority smallint,
    visible boolean DEFAULT true NOT NULL,
    metadata_type_state_controller text
);


ALTER TABLE public.object_types OWNER TO postgres;

--
-- Name: objects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    related_object_type_id text NOT NULL,
    owner_organisation_id text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    embedding extensions.vector,
    owner_member_id uuid
);


ALTER TABLE public.objects OWNER TO postgres;

--
-- Name: organisations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.organisations (
    id text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    name text,
    connection_metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    sub_tier text,
    sub_expiry timestamp with time zone,
    user_data_anonymous boolean DEFAULT false NOT NULL,
    max_risk_appetite_old numeric DEFAULT '0'::numeric NOT NULL,
    max_risk_appetite text
);


ALTER TABLE public.organisations OWNER TO postgres;

--
-- Name: sandbox_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sandbox_sessions (
    id bigint NOT NULL,
    session_key text NOT NULL,
    session_id text NOT NULL,
    organization_id text NOT NULL,
    working_directory text DEFAULT '/home/sandbox'::text NOT NULL,
    e2b_session_id text,
    paused_session_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.sandbox_sessions OWNER TO postgres;

--
-- Name: sandbox_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.sandbox_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.sandbox_sessions_id_seq OWNER TO postgres;

--
-- Name: sandbox_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.sandbox_sessions_id_seq OWNED BY public.sandbox_sessions.id;


--
-- Name: sandbox_sessions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sandbox_sessions ALTER COLUMN id SET DEFAULT nextval('public.sandbox_sessions_id_seq'::regclass);


--
-- Data for Name: connection_member_mapping; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.connection_member_mapping (connection, connection_id, member_id) FROM stdin;
\.


--
-- Data for Name: connection_organisation_mapping; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.connection_organisation_mapping (connection, connection_id, organisation_id) FROM stdin;
\.


--
-- Data for Name: dictionary_terms; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.dictionary_terms (id, type, description, pretty_name, value, colour) FROM stdin;
\.


--
-- Data for Name: field_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.field_types (id, name, description, is_array, data_type, icon) FROM stdin;
text	Text	Text field for storing string data	f	string	solid font
timestamp	Timestamp	Date and time field	f	string	solid calendar
json	JSON	JSON data format	f	object	solid code
\.


--
-- Data for Name: members; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.members (id, owner_organisation_id, email, first_name, last_name, connection_metadata, created_at, updated_at, enabled, roles) FROM stdin;
\.


--
-- Data for Name: object_metadata_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.object_metadata_types (id, owner_organisation_id, name, description, created_at, updated_at, allow_ai_update, related_object_type_id, is_required, field_type_id, dictionary_term_type, max_value, accent_colour_id, order_priority, owner_member_id, is_visible) FROM stdin;
title	\N	title	Title	2025-04-13 17:34:26.766037+00	2025-04-13 17:34:26.766037+00	f	agent_working_memory	t	text	\N	\N	\N	1	\N	t
created_at	\N	created_at	Created	2025-04-13 17:34:26.766037+00	2025-04-13 17:34:26.766037+00	f	agent_working_memory	t	timestamp	\N	\N	\N	2	\N	t
key	\N	key	Memory Key	2025-04-13 17:34:26.766037+00	2025-04-13 17:34:26.766037+00	f	agent_working_memory	t	text	\N	\N	\N	3	\N	t
data	\N	data	Stored Data	2025-04-13 17:34:26.766037+00	2025-04-13 17:34:26.766037+00	f	agent_working_memory	t	json	\N	\N	\N	4	\N	t
expires_at	\N	expires_at	Expiration Time	2025-04-13 17:34:26.766037+00	2025-04-13 17:34:26.766037+00	f	agent_working_memory	f	timestamp	\N	\N	\N	5	\N	t
title	\N	title	Title	2025-04-13 17:34:26.766037+00	2025-04-13 17:34:26.766037+00	f	agent_long_term_memory	t	text	\N	\N	\N	1	\N	t
created_at	\N	created_at	Created	2025-04-13 17:34:26.766037+00	2025-04-13 17:34:26.766037+00	f	agent_long_term_memory	t	timestamp	\N	\N	\N	2	\N	t
concept	\N	concept	Memory Concept	2025-04-13 17:34:26.766037+00	2025-04-13 17:34:26.766037+00	f	agent_long_term_memory	t	text	\N	\N	\N	3	\N	t
data	\N	data	Stored Data	2025-04-13 17:34:26.766037+00	2025-04-13 17:34:26.766037+00	f	agent_long_term_memory	t	json	\N	\N	\N	4	\N	t
embedding	\N	embedding	Vector Embedding	2025-04-13 17:34:26.766037+00	2025-04-13 17:34:26.766037+00	f	agent_long_term_memory	f	json	\N	\N	\N	5	\N	f
title	\N	title	Title	2025-04-13 17:34:26.766037+00	2025-04-13 17:34:26.766037+00	f	agent_execution	t	text	\N	\N	\N	1	\N	t
created_at	\N	created_at	Created	2025-04-13 17:34:26.766037+00	2025-04-13 17:34:26.766037+00	f	agent_execution	t	timestamp	\N	\N	\N	2	\N	t
execution_id	\N	execution_id	Execution ID	2025-04-13 17:34:26.766037+00	2025-04-13 17:34:26.766037+00	f	agent_execution	t	text	\N	\N	\N	3	\N	t
context	\N	context	Execution Context	2025-04-13 17:34:26.766037+00	2025-04-13 17:34:26.766037+00	f	agent_execution	t	json	\N	\N	\N	4	\N	t
status	\N	status	Execution Status	2025-04-13 17:34:26.766037+00	2025-04-13 17:34:26.766037+00	t	agent_execution	t	text	\N	\N	\N	5	\N	t
\.


--
-- Data for Name: object_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.object_types (id, owner_organisation_id, name, description, created_at, updated_at, parent_object_type_id, name_plural, icon, category, owner_member_id, order_priority, visible, metadata_type_state_controller) FROM stdin;
agent_working_memory	\N	Working Memory	Short-term memory storage for agent operations	2025-04-13 17:34:26.766037+00	2025-04-13 17:34:26.766037+00	\N	Working Memory	solid brain	organisation_data_special	\N	\N	t	\N
agent_long_term_memory	\N	Long-term Memory	Persistent knowledge storage with semantic retrieval capabilities	2025-04-13 17:34:26.766037+00	2025-04-13 17:34:26.766037+00	\N	Long-term Memory	solid database	organisation_data_special	\N	\N	t	\N
agent_execution	\N	Agent Execution	Record of agent execution steps and results	2025-04-13 17:34:26.766037+00	2025-04-13 17:34:26.766037+00	\N	Agent Executions	solid play	organisation_data_special	\N	\N	t	\N
\.


--
-- Data for Name: objects; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.objects (id, related_object_type_id, owner_organisation_id, metadata, created_at, embedding, owner_member_id) FROM stdin;
\.


--
-- Data for Name: organisations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.organisations (id, enabled, name, connection_metadata, created_at, updated_at, sub_tier, sub_expiry, user_data_anonymous, max_risk_appetite_old, max_risk_appetite) FROM stdin;
\.


--
-- Data for Name: sandbox_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sandbox_sessions (id, session_key, session_id, organization_id, working_directory, e2b_session_id, paused_session_id, created_at, last_used) FROM stdin;
\.


--
-- Name: sandbox_sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.sandbox_sessions_id_seq', 1, false);


--
-- Name: connection_member_mapping connection_member_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.connection_member_mapping
    ADD CONSTRAINT connection_member_mapping_pkey PRIMARY KEY (connection, connection_id);


--
-- Name: connection_organisation_mapping connection_organisation_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.connection_organisation_mapping
    ADD CONSTRAINT connection_organisation_mapping_pkey PRIMARY KEY (connection, connection_id);


--
-- Name: field_types data_types_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.field_types
    ADD CONSTRAINT data_types_id_key UNIQUE (id);


--
-- Name: field_types data_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.field_types
    ADD CONSTRAINT data_types_pkey PRIMARY KEY (id);


--
-- Name: dictionary_terms dictionary_terms_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dictionary_terms
    ADD CONSTRAINT dictionary_terms_id_key UNIQUE (id);


--
-- Name: dictionary_terms dictionary_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dictionary_terms
    ADD CONSTRAINT dictionary_terms_pkey PRIMARY KEY (id);


--
-- Name: members members_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_id_key UNIQUE (id);


--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (id);


--
-- Name: object_metadata_types object_metadata_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.object_metadata_types
    ADD CONSTRAINT object_metadata_types_pkey PRIMARY KEY (id, related_object_type_id);


--
-- Name: object_types object_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.object_types
    ADD CONSTRAINT object_types_pkey PRIMARY KEY (id);


--
-- Name: object_types object_types_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.object_types
    ADD CONSTRAINT object_types_slug_key UNIQUE (id);


--
-- Name: objects objects_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.objects
    ADD CONSTRAINT objects_id_key UNIQUE (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: organisations organisations_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organisations
    ADD CONSTRAINT organisations_id_key UNIQUE (id);


--
-- Name: sandbox_sessions sandbox_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sandbox_sessions
    ADD CONSTRAINT sandbox_sessions_pkey PRIMARY KEY (id);


--
-- Name: sandbox_sessions sandbox_sessions_session_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sandbox_sessions
    ADD CONSTRAINT sandbox_sessions_session_key_key UNIQUE (session_key);


--
-- Name: organisations teams_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organisations
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: idx_sandbox_sessions_e2b_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sandbox_sessions_e2b_id ON public.sandbox_sessions USING btree (e2b_session_id);


--
-- Name: idx_sandbox_sessions_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sandbox_sessions_key ON public.sandbox_sessions USING btree (session_key);


--
-- Name: idx_sandbox_sessions_last_used; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sandbox_sessions_last_used ON public.sandbox_sessions USING btree (last_used);


--
-- Name: objects job_delete_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER job_delete_trigger BEFORE DELETE ON public.objects FOR EACH ROW EXECUTE FUNCTION public.handle_job_delete();


--
-- Name: objects job_insert_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER job_insert_trigger AFTER INSERT ON public.objects FOR EACH ROW EXECUTE FUNCTION public.handle_job_insert();


--
-- Name: objects job_update_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER job_update_trigger AFTER UPDATE ON public.objects FOR EACH ROW EXECUTE FUNCTION public.handle_job_update();


--
-- Name: connection_member_mapping connection_member_mapping_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.connection_member_mapping
    ADD CONSTRAINT connection_member_mapping_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: connection_organisation_mapping connection_organisation_mapping_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.connection_organisation_mapping
    ADD CONSTRAINT connection_organisation_mapping_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.organisations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: members members_owner_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_owner_organisation_id_fkey FOREIGN KEY (owner_organisation_id) REFERENCES public.organisations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: object_metadata_types object_metadata_types_accent_colour_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.object_metadata_types
    ADD CONSTRAINT object_metadata_types_accent_colour_id_fkey FOREIGN KEY (accent_colour_id) REFERENCES public.dictionary_terms(id);


--
-- Name: object_metadata_types object_metadata_types_field_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.object_metadata_types
    ADD CONSTRAINT object_metadata_types_field_type_id_fkey FOREIGN KEY (field_type_id) REFERENCES public.field_types(id);


--
-- Name: object_metadata_types object_metadata_types_owner_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.object_metadata_types
    ADD CONSTRAINT object_metadata_types_owner_member_id_fkey FOREIGN KEY (owner_member_id) REFERENCES public.members(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: object_metadata_types object_metadata_types_owner_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.object_metadata_types
    ADD CONSTRAINT object_metadata_types_owner_organisation_id_fkey FOREIGN KEY (owner_organisation_id) REFERENCES public.organisations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: object_metadata_types object_metadata_types_related_object_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.object_metadata_types
    ADD CONSTRAINT object_metadata_types_related_object_type_id_fkey FOREIGN KEY (related_object_type_id) REFERENCES public.object_types(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: object_types object_types_metadata_type_state_controller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.object_types
    ADD CONSTRAINT object_types_metadata_type_state_controller_id_fkey FOREIGN KEY (metadata_type_state_controller, id) REFERENCES public.object_metadata_types(id, related_object_type_id) ON UPDATE CASCADE ON DELETE SET DEFAULT;


--
-- Name: object_types object_types_owner_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.object_types
    ADD CONSTRAINT object_types_owner_member_id_fkey FOREIGN KEY (owner_member_id) REFERENCES public.members(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: object_types object_types_owner_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.object_types
    ADD CONSTRAINT object_types_owner_organisation_id_fkey FOREIGN KEY (owner_organisation_id) REFERENCES public.organisations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: object_types object_types_parent_object_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.object_types
    ADD CONSTRAINT object_types_parent_object_type_id_fkey FOREIGN KEY (parent_object_type_id) REFERENCES public.object_types(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: objects objects_owner_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.objects
    ADD CONSTRAINT objects_owner_member_id_fkey FOREIGN KEY (owner_member_id) REFERENCES public.members(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: objects objects_owner_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.objects
    ADD CONSTRAINT objects_owner_organisation_id_fkey FOREIGN KEY (owner_organisation_id) REFERENCES public.organisations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: objects objects_related_object_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.objects
    ADD CONSTRAINT objects_related_object_type_id_fkey FOREIGN KEY (related_object_type_id) REFERENCES public.object_types(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: organisations organisations_max_risk_appetite_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organisations
    ADD CONSTRAINT organisations_max_risk_appetite_fkey FOREIGN KEY (max_risk_appetite) REFERENCES public.dictionary_terms(id) ON UPDATE CASCADE;


--
-- Name: objects Allow insert for auth users where owner org is null; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow insert for auth users where owner org is null" ON public.objects FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: members Allow member to manage their own row; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow member to manage their own row" ON public.members USING ((auth.uid() = id));


--
-- Name: objects CRUD own objects; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "CRUD own objects" ON public.objects USING ((EXISTS ( SELECT 1
   FROM public.members
  WHERE ((members.owner_organisation_id = objects.owner_organisation_id) AND (members.id = auth.uid())))));


--
-- Name: organisations Create team row if member authorised; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Create team row if member authorised" ON public.organisations FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: organisations Delete team row if member in correct team; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Delete team row if member in correct team" ON public.organisations FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.members
  WHERE ((members.owner_organisation_id = organisations.id) AND (members.id = auth.uid())))));


--
-- Name: object_metadata_types Enable all for authenticated users only (improve this); Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable all for authenticated users only (improve this)" ON public.object_metadata_types TO authenticated USING (true) WITH CHECK (true);


--
-- Name: object_types Enable all for authenticated users only (improve this); Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable all for authenticated users only (improve this)" ON public.object_types TO authenticated USING (true) WITH CHECK (true);


--
-- Name: connection_member_mapping Enable insert for authenticated users only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable insert for authenticated users only" ON public.connection_member_mapping TO authenticated WITH CHECK (true);


--
-- Name: connection_organisation_mapping Enable insert for authenticated users only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable insert for authenticated users only" ON public.connection_organisation_mapping TO authenticated WITH CHECK (true);


--
-- Name: connection_member_mapping Enable read access for all users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for all users" ON public.connection_member_mapping FOR SELECT USING (true);


--
-- Name: connection_organisation_mapping Enable read access for all users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for all users" ON public.connection_organisation_mapping FOR SELECT USING (true);


--
-- Name: dictionary_terms Enable read access for all users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for all users" ON public.dictionary_terms FOR SELECT USING (true);


--
-- Name: field_types Enable read access for all users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for all users" ON public.field_types FOR SELECT USING (true);


--
-- Name: organisations Update team row if member in correct team; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Update team row if member in correct team" ON public.organisations FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.members
  WHERE ((members.owner_organisation_id = organisations.id) AND (members.id = auth.uid())))));


--
-- Name: connection_member_mapping; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.connection_member_mapping ENABLE ROW LEVEL SECURITY;

--
-- Name: connection_organisation_mapping; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.connection_organisation_mapping ENABLE ROW LEVEL SECURITY;

--
-- Name: dictionary_terms; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.dictionary_terms ENABLE ROW LEVEL SECURITY;

--
-- Name: field_types; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.field_types ENABLE ROW LEVEL SECURITY;

--
-- Name: members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

--
-- Name: object_metadata_types; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.object_metadata_types ENABLE ROW LEVEL SECURITY;

--
-- Name: object_types; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.object_types ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: organisations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;

--
-- Name: organisations select_teams_policy; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY select_teams_policy ON public.organisations FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.members
  WHERE ((members.id = auth.uid()) AND (members.owner_organisation_id = organisations.id)))) OR (NOT (EXISTS ( SELECT 1
   FROM public.members
  WHERE (members.id = auth.uid()))))));


--
-- Name: TABLE connection_member_mapping; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.connection_member_mapping TO anon;
GRANT ALL ON TABLE public.connection_member_mapping TO authenticated;
GRANT ALL ON TABLE public.connection_member_mapping TO service_role;


--
-- Name: TABLE connection_organisation_mapping; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.connection_organisation_mapping TO anon;
GRANT ALL ON TABLE public.connection_organisation_mapping TO authenticated;
GRANT ALL ON TABLE public.connection_organisation_mapping TO service_role;


--
-- Name: TABLE dictionary_terms; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.dictionary_terms TO anon;
GRANT ALL ON TABLE public.dictionary_terms TO authenticated;
GRANT ALL ON TABLE public.dictionary_terms TO service_role;


--
-- Name: TABLE field_types; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.field_types TO anon;
GRANT ALL ON TABLE public.field_types TO authenticated;
GRANT ALL ON TABLE public.field_types TO service_role;


--
-- Name: TABLE members; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.members TO anon;
GRANT ALL ON TABLE public.members TO authenticated;
GRANT ALL ON TABLE public.members TO service_role;


--
-- Name: TABLE object_metadata_types; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.object_metadata_types TO anon;
GRANT ALL ON TABLE public.object_metadata_types TO authenticated;
GRANT ALL ON TABLE public.object_metadata_types TO service_role;


--
-- Name: TABLE object_types; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.object_types TO anon;
GRANT ALL ON TABLE public.object_types TO authenticated;
GRANT ALL ON TABLE public.object_types TO service_role;


--
-- Name: TABLE objects; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.objects TO anon;
GRANT ALL ON TABLE public.objects TO authenticated;
GRANT ALL ON TABLE public.objects TO service_role;


--
-- Name: TABLE organisations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.organisations TO anon;
GRANT ALL ON TABLE public.organisations TO authenticated;
GRANT ALL ON TABLE public.organisations TO service_role;


--
-- Name: TABLE sandbox_sessions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.sandbox_sessions TO anon;
GRANT ALL ON TABLE public.sandbox_sessions TO authenticated;
GRANT ALL ON TABLE public.sandbox_sessions TO service_role;


--
-- Name: SEQUENCE sandbox_sessions_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.sandbox_sessions_id_seq TO anon;
GRANT ALL ON SEQUENCE public.sandbox_sessions_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.sandbox_sessions_id_seq TO service_role;


--
-- PostgreSQL database dump complete
--

