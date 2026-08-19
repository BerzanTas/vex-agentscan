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
    usd_in_priced numeric,
    usd_out_priced numeric,
    pricing_state text DEFAULT 'pending'::text NOT NULL,
    priced_at timestamp with time zone,
    pricing_attempts smallint DEFAULT 0 NOT NULL,
    pricing_next_attempt_at timestamp with time zone,
    block_time timestamp with time zone,
    token_in2_address text,
    token_in2_symbol text,
    token_in2_decimals smallint,
    token_out2_address text,
    token_out2_symbol text,
    token_out2_decimals smallint,
    amount_in2_raw text,
    amount_out2_raw text,
    executed_in2_raw text,
    executed_out2_raw text,
    usd_network_gas_est numeric,
    usd_venue_fee_est numeric,
    usd_vex_fee_est numeric,
    usd_destination_prepay_est numeric,
    CONSTRAINT activities_chain_family_check CHECK ((chain_family = ANY (ARRAY['eip155'::text, 'solana'::text]))),
    CONSTRAINT activities_event_role_check CHECK ((event_role = ANY (ARRAY['swap'::text, 'trench_fee'::text, 'swap_fee'::text, 'bridge_deposit'::text, 'bridge_fee'::text, 'bridge_fill_expected'::text, 'bridge_fill_observed'::text, 'bridge_refund'::text, 'lend_deposit'::text, 'lend_withdraw'::text, 'lend_borrow_operate'::text, 'predict_buy'::text, 'predict_sell'::text, 'predict_claim'::text, 'predict_close'::text, 'wrap'::text, 'unwrap'::text, 'yield_pt'::text, 'yield_yt'::text, 'yield_py'::text, 'yield_lp'::text, 'yield_sy'::text, 'yield_claim'::text, 'token_launch'::text, 'pools_fee'::text, 'pools_claim'::text]))),
    CONSTRAINT activities_kind_check CHECK ((kind = ANY (ARRAY['swap'::text, 'bridge'::text, 'lend'::text, 'prediction'::text, 'wrap'::text, 'yield'::text, 'launch'::text, 'claim'::text]))),
    CONSTRAINT activities_pricing_state_check CHECK ((pricing_state = ANY (ARRAY['pending'::text, 'server_priced'::text, 'unpriced'::text]))),
    CONSTRAINT activities_second_leg_in_amount_has_token CHECK ((((amount_in2_raw IS NULL) AND (executed_in2_raw IS NULL)) OR ((token_in2_address IS NOT NULL) AND (token_in2_decimals IS NOT NULL)))),
    CONSTRAINT activities_second_leg_out_amount_has_token CHECK ((((amount_out2_raw IS NULL) AND (executed_out2_raw IS NULL)) OR ((token_out2_address IS NOT NULL) AND (token_out2_decimals IS NOT NULL)))),
    CONSTRAINT activities_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'definitively_failed'::text, 'superseded_unproven'::text]))),
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
-- Name: agent_wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_wallets (
    id bigint NOT NULL,
    agent_hash text NOT NULL,
    chain_family text NOT NULL,
    address_hmac text NOT NULL,
    hmac_version smallint DEFAULT 1 NOT NULL,
    proof_signature text NOT NULL,
    proven_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agent_wallets_chain_family_check CHECK ((chain_family = ANY (ARRAY['eip155'::text, 'solana'::text])))
);


--
-- Name: agent_wallets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_wallets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_wallets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_wallets_id_seq OWNED BY public.agent_wallets.id;


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
    name text,
    last_handshake_at timestamp with time zone,
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
    tx_count integer DEFAULT 0 NOT NULL,
    volume_usd_priced numeric DEFAULT 0 NOT NULL
);


--
-- Name: handshake_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.handshake_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_hash text NOT NULL,
    nonce text NOT NULL,
    domain text NOT NULL,
    address_hmacs text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT handshake_challenges_agent_hash_check CHECK ((agent_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: rate_limit_hits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limit_hits (
    key_hash text NOT NULL,
    hits timestamp with time zone[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
)
WITH (autovacuum_vacuum_scale_factor='0.01', autovacuum_vacuum_threshold='50');


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
-- Name: token_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_prices (
    chain_family text NOT NULL,
    chain_id bigint NOT NULL,
    token_address text NOT NULL,
    price_hour timestamp with time zone NOT NULL,
    price_usd numeric,
    confidence numeric,
    source text NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT token_prices_chain_family_check CHECK ((chain_family = ANY (ARRAY['eip155'::text, 'solana'::text])))
);


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
-- Name: agent_wallets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_wallets ALTER COLUMN id SET DEFAULT nextval('public.agent_wallets_id_seq'::regclass);


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
-- Name: agent_wallets agent_wallets_chain_family_address_hmac_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_wallets
    ADD CONSTRAINT agent_wallets_chain_family_address_hmac_key UNIQUE (chain_family, address_hmac);


--
-- Name: agent_wallets agent_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_wallets
    ADD CONSTRAINT agent_wallets_pkey PRIMARY KEY (id);


--
-- Name: agents agents_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_name_key UNIQUE (name);


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
-- Name: handshake_challenges handshake_challenges_nonce_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.handshake_challenges
    ADD CONSTRAINT handshake_challenges_nonce_key UNIQUE (nonce);


--
-- Name: handshake_challenges handshake_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.handshake_challenges
    ADD CONSTRAINT handshake_challenges_pkey PRIMARY KEY (id);


--
-- Name: rate_limit_hits rate_limit_hits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_hits
    ADD CONSTRAINT rate_limit_hits_pkey PRIMARY KEY (key_hash);


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
-- Name: token_prices token_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_prices
    ADD CONSTRAINT token_prices_pkey PRIMARY KEY (chain_family, chain_id, token_address, price_hour);


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
-- Name: idx_activities_chain_event_time_feed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_chain_event_time_feed ON public.activities USING btree (chain_family, chain_id, date_trunc('milliseconds'::text, COALESCE(COALESCE(client_confirmed_at, block_time), client_created_at), 'UTC'::text) DESC, id DESC);


--
-- Name: idx_activities_chain_feed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_chain_feed ON public.activities USING btree (chain_family, chain_id, received_at DESC, id DESC);


--
-- Name: idx_activities_event_time_feed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_event_time_feed ON public.activities USING btree (date_trunc('milliseconds'::text, COALESCE(COALESCE(client_confirmed_at, block_time), client_created_at), 'UTC'::text) DESC, id DESC);


--
-- Name: idx_activities_feed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_feed ON public.activities USING btree (received_at DESC, id DESC);


--
-- Name: idx_activities_pricing_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_pricing_due ON public.activities USING btree (pricing_next_attempt_at) WHERE (pricing_state = 'pending'::text);


--
-- Name: idx_activities_protocol_event_time_feed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_protocol_event_time_feed ON public.activities USING btree (protocol, date_trunc('milliseconds'::text, COALESCE(COALESCE(client_confirmed_at, block_time), client_created_at), 'UTC'::text) DESC, id DESC);


--
-- Name: idx_activities_protocol_feed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_protocol_feed ON public.activities USING btree (protocol, received_at DESC, id DESC);


--
-- Name: idx_activities_tx_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_tx_hash ON public.activities USING btree (lower(tx_hash)) WHERE (tx_hash IS NOT NULL);


--
-- Name: idx_activities_verified_anchor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_verified_anchor ON public.activities USING btree (COALESCE(COALESCE(client_confirmed_at, block_time), verified_at)) WHERE (verification_state = ANY (ARRAY['verified_full'::text, 'verified_basic'::text]));


--
-- Name: idx_activities_verified_chain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_verified_chain ON public.activities USING btree (chain_family, chain_id) WHERE (verification_state = ANY (ARRAY['verified_full'::text, 'verified_basic'::text]));


--
-- Name: idx_activities_verified_token_in; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_verified_token_in ON public.activities USING btree (chain_family, chain_id, lower(token_in_address)) WHERE (verification_state = ANY (ARRAY['verified_full'::text, 'verified_basic'::text]));


--
-- Name: idx_activities_verified_token_out; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_verified_token_out ON public.activities USING btree (chain_family, chain_id, lower(token_out_address)) WHERE (verification_state = ANY (ARRAY['verified_full'::text, 'verified_basic'::text]));


--
-- Name: idx_activities_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_visibility ON public.activities USING btree (status, verification_state);


--
-- Name: idx_agent_wallets_agent_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_wallets_agent_hash ON public.agent_wallets USING btree (agent_hash);


--
-- Name: idx_handshake_challenges_purge; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_handshake_challenges_purge ON public.handshake_challenges USING btree (created_at);


--
-- Name: idx_rate_limit_hits_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limit_hits_updated_at ON public.rate_limit_hits USING btree (updated_at);


--
-- Name: idx_token_attestations_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_token_attestations_lookup ON public.token_attestations USING btree (chain_id, token_address);


--
-- Name: idx_token_attestations_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_token_attestations_pending ON public.token_attestations USING btree (next_attempt_at) WHERE ((verify_status = 'unverified'::text) AND (revoked_at IS NULL));


--
-- Name: idx_token_attestations_pending_by_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_token_attestations_pending_by_ip ON public.token_attestations USING btree (submitter_ip_hash) WHERE ((verify_status = 'unverified'::text) AND (revoked_at IS NULL));


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
-- Name: agent_wallets agent_wallets_agent_hash_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_wallets
    ADD CONSTRAINT agent_wallets_agent_hash_fkey FOREIGN KEY (agent_hash) REFERENCES public.agents(agent_hash);


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
    ('0002'),
    ('0003'),
    ('0004'),
    ('0005'),
    ('0006'),
    ('0007'),
    ('0008'),
    ('0009'),
    ('0010'),
    ('0011'),
    ('0012'),
    ('0013'),
    ('0014'),
    ('0015');
