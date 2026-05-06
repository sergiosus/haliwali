--
-- PostgreSQL database dump
--

\restrict cSsqRp7kazWD4vehCjiDwFJfOU5rFMwux0LfwnFnHEqV32wYn4BisQrlvIHOsa4

-- Dumped from database version 17.9
-- Dumped by pg_dump version 17.9

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
-- Name: auth_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.auth_sessions (
    token text NOT NULL,
    user_id text NOT NULL,
    created_at bigint NOT NULL,
    expires_at bigint NOT NULL
);


ALTER TABLE public.auth_sessions OWNER TO postgres;

--
-- Name: listings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.listings (
    id text NOT NULL,
    edit_token text NOT NULL,
    owner_id text NOT NULL,
    type text NOT NULL,
    status text NOT NULL,
    moderation_reason text DEFAULT ''::text NOT NULL,
    deal_status text DEFAULT 'active'::text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    category_name text NOT NULL,
    category_slug text NOT NULL,
    city text NOT NULL,
    address text,
    latitude double precision,
    longitude double precision,
    address_public boolean DEFAULT false NOT NULL,
    specialization text,
    price bigint,
    phone text DEFAULT ''::text NOT NULL,
    photos jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    author_public_name text DEFAULT ''::text NOT NULL,
    listing_lifecycle text DEFAULT 'live'::text NOT NULL,
    deleted_at bigint,
    delete_permanently_at bigint,
    archived_at bigint,
    deleted_snapshot jsonb,
    CONSTRAINT listings_type_check CHECK ((type = ANY (ARRAY['task'::text, 'service'::text, 'product_sell'::text, 'product_buy'::text])))
);


ALTER TABLE public.listings OWNER TO postgres;

--
-- Name: registration_pending; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.registration_pending (
    id text NOT NULL,
    email text,
    phone text,
    password_hash text,
    confirm_method text NOT NULL,
    code_hash text NOT NULL,
    expires_at bigint NOT NULL,
    attempts integer DEFAULT 0,
    consumed boolean DEFAULT false,
    created_at bigint NOT NULL,
    last_sent_at bigint
);


ALTER TABLE public.registration_pending OWNER TO postgres;

--
-- Name: reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reports (
    id text NOT NULL,
    reporter_id text NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    reason text NOT NULL,
    comment text NOT NULL,
    created_at bigint NOT NULL,
    dismissed boolean DEFAULT false NOT NULL
);


ALTER TABLE public.reports OWNER TO postgres;

--
-- Name: support_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.support_messages (
    id text NOT NULL,
    ticket_id text NOT NULL,
    role text NOT NULL,
    sender_type text,
    text text NOT NULL,
    created_at bigint NOT NULL
);


ALTER TABLE public.support_messages OWNER TO postgres;

--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.support_tickets (
    id text NOT NULL,
    user_id text NOT NULL,
    category text NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    status text NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    listing_id text,
    listing_title text
);


ALTER TABLE public.support_tickets OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    user_id text NOT NULL,
    email text,
    phone text,
    password_hash text,
    phone_visible boolean DEFAULT false,
    created_at bigint,
    last_seen_at bigint,
    deletion_status text DEFAULT ''::text,
    delete_requested_at bigint,
    delete_scheduled_at bigint,
    full_name text,
    public_display_name text,
    role text DEFAULT 'user'::text,
    is_admin boolean DEFAULT false
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Data for Name: auth_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.auth_sessions (token, user_id, created_at, expires_at) FROM stdin;
i_5LrzJzN8wh178X7xmHgL_gp9gmrsPcbinUPYE4FPs	user-1a8cf504-068f-443e-b7aa-03fc8d7510ae	1777997562642	1780589562642
\.


--
-- Data for Name: listings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.listings (id, edit_token, owner_id, type, status, moderation_reason, deal_status, title, description, category_name, category_slug, city, address, latitude, longitude, address_public, specialization, price, phone, photos, created_at, updated_at, author_public_name, listing_lifecycle, deleted_at, delete_permanently_at, archived_at, deleted_snapshot) FROM stdin;
task-1778003192779	1b819fe1157305de0ed9344c1860e319	user-1a8cf504-068f-443e-b7aa-03fc8d7510ae	task	auto		active	вапрлждлоролдж	олджрмлжД.лоюрбрсьобрлюот.дьдл	Разовые задания	razovye-zadaniya	Ижевск	Ижевск, Удмуртская Республика	56.8527	53.2115	f	\N	\N	+79124475419	["/uploads/8332a7b6-edc9-4d90-9911-48730243f77e.jpg"]	1778003192779	1778003192779	kostashu	live	\N	\N	\N	\N
\.


--
-- Data for Name: registration_pending; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.registration_pending (id, email, phone, password_hash, confirm_method, code_hash, expires_at, attempts, consumed, created_at, last_sent_at) FROM stdin;
reg-1777995757847-71e50d8e2c773	kostashu@yahoo.com		$2b$10$wXsptIO33tWalcUWzjXlx.e4Li6RE0kJDPLXwvD3y8tmJY7QFamfm	email	c4d9243a3263403112b94314707e37c270707c60f73cf97213bae8811303b0c2	1777996357847	0	t	1777995757847	1777995757847
\.


--
-- Data for Name: reports; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reports (id, reporter_id, target_type, target_id, reason, comment, created_at, dismissed) FROM stdin;
\.


--
-- Data for Name: support_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.support_messages (id, ticket_id, role, sender_type, text, created_at) FROM stdin;
\.


--
-- Data for Name: support_tickets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.support_tickets (id, user_id, category, subject, status, created_at, updated_at, listing_id, listing_title) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (user_id, email, phone, password_hash, phone_visible, created_at, last_seen_at, deletion_status, delete_requested_at, delete_scheduled_at, full_name, public_display_name, role, is_admin) FROM stdin;
user-1a8cf504-068f-443e-b7aa-03fc8d7510ae	kostashu@yahoo.com		$2b$10$wXsptIO33tWalcUWzjXlx.e4Li6RE0kJDPLXwvD3y8tmJY7QFamfm	f	1777995770229	1778009402851		\N	\N	серго		admin	t
\.


--
-- Name: auth_sessions auth_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_pkey PRIMARY KEY (token);


--
-- Name: listings listings_edit_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_edit_token_key UNIQUE (edit_token);


--
-- Name: listings listings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_pkey PRIMARY KEY (id);


--
-- Name: registration_pending registration_pending_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.registration_pending
    ADD CONSTRAINT registration_pending_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: support_messages support_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- Name: auth_sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX auth_sessions_expires_at_idx ON public.auth_sessions USING btree (expires_at);


--
-- Name: auth_sessions_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX auth_sessions_user_id_idx ON public.auth_sessions USING btree (user_id);


--
-- Name: listings_deal_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX listings_deal_status_idx ON public.listings USING btree (deal_status);


--
-- Name: listings_owner_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX listings_owner_id_idx ON public.listings USING btree (owner_id);


--
-- Name: listings_status_category_slug_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX listings_status_category_slug_idx ON public.listings USING btree (status, category_slug);


--
-- Name: registration_pending_lookup_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX registration_pending_lookup_idx ON public.registration_pending USING btree (confirm_method, consumed, last_sent_at DESC);


--
-- Name: reports_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX reports_created_at_idx ON public.reports USING btree (created_at DESC);


--
-- Name: reports_dismissed_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX reports_dismissed_created_at_idx ON public.reports USING btree (dismissed, created_at DESC);


--
-- Name: reports_target_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX reports_target_idx ON public.reports USING btree (target_type, target_id);


--
-- Name: support_messages_ticket_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX support_messages_ticket_created_at_idx ON public.support_messages USING btree (ticket_id, created_at);


--
-- Name: support_tickets_updated_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX support_tickets_updated_at_idx ON public.support_tickets USING btree (updated_at DESC);


--
-- Name: support_tickets_user_updated_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX support_tickets_user_updated_at_idx ON public.support_tickets USING btree (user_id, updated_at DESC);


--
-- Name: users_email_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX users_email_unique ON public.users USING btree (email) WHERE (email <> ''::text);


--
-- Name: users_phone_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX users_phone_unique ON public.users USING btree (phone) WHERE (phone <> ''::text);


--
-- Name: support_messages support_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict cSsqRp7kazWD4vehCjiDwFJfOU5rFMwux0LfwnFnHEqV32wYn4BisQrlvIHOsa4

