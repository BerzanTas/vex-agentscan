\restrict dbmate

-- Dumped from database version 17.10 (Debian 17.10-1.pgdg13+1)
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activities (
    id bigint NOT NULL,
    agent_hash text NOT NULL,
    source_row_id text NOT NULL,
    public_id text NOT NULL,
    source_execution_id text NOT NULL,
    event_index integer NOT NULL,
    kind text NOT NULL,
    event_role text NOT NULL,
    status text NOT NULL,
    protocol text NOT NULL,
    chain_family text NOT NULL,
    chain_id bigint NOT NULL,
    from_chain_id bigint,
    to_chain_id bigint,
    token_in_address text,
    token_in_symbol text,
    token_in_decimals smallint,
    token_out_address text,
    token_out_symbol text,
    token_out_decimals smallint,
    amount_in_raw text,
    amount_out_raw text,
    executed_in_raw text,
    executed_out_raw text,
    usd_in_est numeric,
    usd_out_est numeric,
    usd_fee_est numeric,
    usd_source text,
    tx_hash text,
    failure_code text,
    client_created_at timestamp with time zone NOT NULL,
    client_confirmed_at timestamp with time zone,
    client_observed_at timestamp with time zone,
    statuses_seen text[] NOT NULL,
    verification_state text DEFAULT 'none'::text NOT NULL,
    verified_at timestamp with time zone,
    backfill boolean DEFAULT false NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    received_schema_version integer NOT NULL,
    CONSTRAINT activities_chain_family_check CHECK ((chain_family = ANY (ARRAY['eip155'::text, 'solana'::text]))),
    CONSTRAINT activities_event_role_check CHECK ((event_role = ANY (ARRAY['swap'::text, 'bridge_deposit'::text, 'bridge_fill_expected'::text, 'bridge_fill_observed'::text, 'bridge_refund'::text, 'token_launch'::text]))),
    CONSTRAINT activities_kind_check CHECK ((kind = ANY (ARRAY['swap'::text, 'bridge'::text, 'launch'::text]))),
    CONSTRAINT activities_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'definitively_failed'::text]))),
    CONSTRAINT activities_verification_state_check CHECK ((verification_state = ANY (ARRAY['none'::text, 'queued'::text, 'verified_full'::text, 'verified_basic'::text, 'mismatch'::text])))
);


--
-- Name: activities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.activities_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: activities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.activities_id_seq OWNED BY public.activities.id;


--
-- Name: agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agents (
    agent_hash text NOT NULL,
    ingest_token_sha256 text NOT NULL,
    consent_version integer NOT NULL,
    accepted_at timestamp with time zone NOT NULL,
    app_version text,
    status text DEFAULT 'active'::text NOT NULL,
    strike_count smallint DEFAULT 0 NOT NULL,
    first_verified_at timestamp with time zone,
    revoked_at timestamp with time zone,
    quarantined_at timestamp with time zone,
    purged_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agents_agent_hash_check CHECK ((agent_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT agents_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text, 'quarantined'::text])))
);


--
-- Name: daily_aggregates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_aggregates (
    day date NOT NULL,
    protocol text NOT NULL,
    kind text NOT NULL,
    volume_usd numeric DEFAULT 0 NOT NULL,
    tx_count integer DEFAULT 0 NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: strikes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.strikes (
    id bigint NOT NULL,
    agent_hash text NOT NULL,
    activity_id bigint,
    reason text NOT NULL,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: strikes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.strikes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: strikes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.strikes_id_seq OWNED BY public.strikes.id;


--
-- Name: token_attestations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_attestations (
    id bigint NOT NULL,
    chain_id bigint NOT NULL,
    token_address text NOT NULL,
    recovered_signer text NOT NULL,
    attest_signature text NOT NULL,
    tx_hash_hint text,
    derived_tx_hash text,
    verify_status text DEFAULT 'unverified'::text NOT NULL,
    verify_detail text,
    verified_at timestamp with time zone,
    revoked_at timestamp with time zone,
    revoke_reason text,
    submitter_ip_hash text,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT token_attestations_recovered_signer_check CHECK ((recovered_signer ~ '^0x[0-9a-f]{40}$'::text)),
    CONSTRAINT token_attestations_token_address_check CHECK ((token_address ~ '^0x[0-9a-f]{40}$'::text)),
    CONSTRAINT token_attestations_verify_status_check CHECK ((verify_status = ANY (ARRAY['unverified'::text, 'verified'::text, 'mismatch'::text, 'unverifiable'::text])))
);


--
-- Name: token_attestations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.token_attestations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: token_attestations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.token_attestations_id_seq OWNED BY public.token_attestations.id;


--
-- Name: verification_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification_jobs (
    activity_id bigint NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    first_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    next_attempt_at timestamp with time zone NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: worker_heartbeat; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_heartbeat (
    worker_name text NOT NULL,
    beat_at timestamp with time zone NOT NULL
);


--
-- Name: activities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities ALTER COLUMN id SET DEFAULT nextval('public.activities_id_seq'::regclass);


--
-- Name: strikes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strikes ALTER COLUMN id SET DEFAULT nextval('public.strikes_id_seq'::regclass);


--
-- Name: token_attestations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_attestations ALTER COLUMN id SET DEFAULT nextval('public.token_attestations_id_seq'::regclass);


--
-- Name: activities activities_agent_hash_source_row_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_agent_hash_source_row_id_key UNIQUE (agent_hash, source_row_id);


--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
-- Name: activities activities_public_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_public_id_key UNIQUE (public_id);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (agent_hash);


--
-- Name: daily_aggregates daily_aggregates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_aggregates
    ADD CONSTRAINT daily_aggregates_pkey PRIMARY KEY (day, protocol, kind);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: strikes strikes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strikes
    ADD CONSTRAINT strikes_pkey PRIMARY KEY (id);


--
-- Name: token_attestations token_attestations_chain_id_token_address_recovered_signer_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_attestations
    ADD CONSTRAINT token_attestations_chain_id_token_address_recovered_signer_key UNIQUE (chain_id, token_address, recovered_signer);


--
-- Name: token_attestations token_attestations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_attestations
    ADD CONSTRAINT token_attestations_pkey PRIMARY KEY (id);


--
-- Name: verification_jobs verification_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_jobs
    ADD CONSTRAINT verification_jobs_pkey PRIMARY KEY (activity_id);


--
-- Name: worker_heartbeat worker_heartbeat_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_heartbeat
    ADD CONSTRAINT worker_heartbeat_pkey PRIMARY KEY (worker_name);


--
-- Name: idx_activities_agent_confirmed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_agent_confirmed ON public.activities USING btree (agent_hash, client_confirmed_at);


--
-- Name: idx_activities_feed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_feed ON public.activities USING btree (received_at DESC, id DESC);


--
-- Name: idx_activities_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_visibility ON public.activities USING btree (status, verification_state);


--
-- Name: idx_token_attestations_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_token_attestations_lookup ON public.token_attestations USING btree (chain_id, token_address);


--
-- Name: idx_token_attestations_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_token_attestations_pending ON public.token_attestations USING btree (next_attempt_at) WHERE ((verify_status = 'unverified'::text) AND (revoked_at IS NULL));


--
-- Name: idx_verification_jobs_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_verification_jobs_due ON public.verification_jobs USING btree (next_attempt_at);


--
-- Name: activities activities_agent_hash_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_agent_hash_fkey FOREIGN KEY (agent_hash) REFERENCES public.agents(agent_hash);


--
-- Name: strikes strikes_agent_hash_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.strikes
    ADD CONSTRAINT strikes_agent_hash_fkey FOREIGN KEY (agent_hash) REFERENCES public.agents(agent_hash);


--
-- Name: verification_jobs verification_jobs_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_jobs
    ADD CONSTRAINT verification_jobs_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict dbmate


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('0001'),
    ('0008');
