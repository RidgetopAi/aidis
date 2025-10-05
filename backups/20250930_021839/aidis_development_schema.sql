--
-- PostgreSQL database dump
--

\restrict 2Ceg4At2VvLNO0T8DWa7ZvPFxt2FYTfVgOTfkVB3sHDmH271BuLaDqNByrNbMA4

-- Dumped from database version 16.9 (Debian 16.9-1.pgdg120+1)
-- Dumped by pg_dump version 16.10 (Ubuntu 16.10-0ubuntu0.24.04.1)

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

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: task_type_enum; Type: TYPE; Schema: public; Owner: ridgetop
--

CREATE TYPE public.task_type_enum AS ENUM (
    'feature',
    'bug',
    'bugfix',
    'refactor',
    'test',
    'review',
    'docs',
    'documentation',
    'devops',
    'general'
);


ALTER TYPE public.task_type_enum OWNER TO ridgetop;

--
-- Name: update_branch_stats(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.update_branch_stats() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    branch_rec RECORD;
BEGIN
    -- Update branch statistics when commits are added
    IF TG_OP = 'INSERT' THEN
        UPDATE git_branches 
        SET 
            current_commit_sha = NEW.commit_sha,
            last_commit_date = NEW.author_date,
            commit_count = commit_count + 1
        WHERE project_id = NEW.project_id 
        AND branch_name = NEW.branch_name;
        
        -- Set first commit date if this is the first commit
        UPDATE git_branches 
        SET first_commit_date = NEW.author_date
        WHERE project_id = NEW.project_id 
        AND branch_name = NEW.branch_name
        AND first_commit_date IS NULL;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION public.update_branch_stats() OWNER TO ridgetop;

--
-- Name: update_tasks_updated_at(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.update_tasks_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_tasks_updated_at() OWNER TO ridgetop;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO ridgetop;

--
-- Name: validate_commit_insertion(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.validate_commit_insertion() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
BEGIN
    -- Validate SHA format
    IF NEW.commit_sha !~ '^[a-f0-9]{40}$' THEN
        RAISE EXCEPTION 'Invalid commit SHA format: %', NEW.commit_sha;
    END IF;
    
    -- Validate short SHA is prefix of full SHA
    IF NEW.short_sha != substring(NEW.commit_sha from 1 for length(NEW.short_sha)) THEN
        RAISE EXCEPTION 'Short SHA must be prefix of full SHA';
    END IF;
    
    -- Auto-generate short SHA if not provided
    IF NEW.short_sha IS NULL OR NEW.short_sha = '' THEN
        NEW.short_sha := substring(NEW.commit_sha from 1 for 12);
    END IF;
    
    -- Auto-classify commit type based on message
    IF NEW.commit_type = 'unknown' AND NEW.message IS NOT NULL THEN
        NEW.commit_type := CASE
            WHEN NEW.message ~* '^(feat|feature)(\(.*\))?:' THEN 'feature'
            WHEN NEW.message ~* '^(fix|bugfix)(\(.*\))?:' THEN 'bugfix'
            WHEN NEW.message ~* '^(refactor|refact)(\(.*\))?:' THEN 'refactor'
            WHEN NEW.message ~* '^(test|tests)(\(.*\))?:' THEN 'test'
            WHEN NEW.message ~* '^(docs|doc)(\(.*\))?:' THEN 'docs'
            WHEN NEW.message ~* '^(style|styles)(\(.*\))?:' THEN 'style'
            WHEN NEW.message ~* '^(chore|maintenance)(\(.*\))?:' THEN 'chore'
            WHEN NEW.message ~* '^(merge|Merge)' THEN 'merge'
            WHEN NEW.message ~* '^(revert|Revert)' THEN 'revert'
            WHEN NEW.message ~* '^(hotfix|hot-fix)(\(.*\))?:' THEN 'hotfix'
            WHEN NEW.message ~* 'breaking change|BREAKING CHANGE' THEN 'breaking'
            ELSE 'unknown'
        END;
    END IF;
    
    -- Set merge commit flag based on parent count
    IF array_length(NEW.parent_shas, 1) > 1 THEN
        NEW.is_merge_commit := TRUE;
    END IF;
    
    RETURN NEW;
END;
$_$;


ALTER FUNCTION public.validate_commit_insertion() OWNER TO ridgetop;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _aidis_migrations; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public._aidis_migrations (
    id integer NOT NULL,
    filename character varying(255) NOT NULL,
    migration_number integer NOT NULL,
    applied_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    checksum character varying(64)
);


ALTER TABLE public._aidis_migrations OWNER TO ridgetop;

--
-- Name: _aidis_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: ridgetop
--

CREATE SEQUENCE public._aidis_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public._aidis_migrations_id_seq OWNER TO ridgetop;

--
-- Name: _aidis_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: ridgetop
--

ALTER SEQUENCE public._aidis_migrations_id_seq OWNED BY public._aidis_migrations.id;


--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username character varying(50) NOT NULL,
    email character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'admin'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_login timestamp without time zone
);


ALTER TABLE public.admin_users OWNER TO ridgetop;

--
-- Name: agent_collaborations; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.agent_collaborations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    agents uuid[] NOT NULL,
    type character varying(100) DEFAULT 'general'::character varying NOT NULL,
    title character varying(500) NOT NULL,
    description text,
    status character varying(50) DEFAULT 'active'::character varying NOT NULL,
    result text,
    contexts uuid[] DEFAULT '{}'::uuid[],
    tasks uuid[] DEFAULT '{}'::uuid[],
    metadata jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.agent_collaborations OWNER TO ridgetop;

--
-- Name: agent_messages; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.agent_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    from_agent_id uuid NOT NULL,
    to_agent_id uuid,
    message_type character varying(100) DEFAULT 'info'::character varying NOT NULL,
    title character varying(500),
    content text NOT NULL,
    context_refs uuid[] DEFAULT '{}'::uuid[],
    task_refs uuid[] DEFAULT '{}'::uuid[],
    metadata jsonb DEFAULT '{}'::jsonb,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.agent_messages OWNER TO ridgetop;

--
-- Name: agent_sessions; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.agent_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    session_id character varying(255) NOT NULL,
    project_id uuid NOT NULL,
    status character varying(50) DEFAULT 'active'::character varying NOT NULL,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_activity timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    metadata jsonb DEFAULT '{}'::jsonb
);


ALTER TABLE public.agent_sessions OWNER TO ridgetop;

--
-- Name: agent_tasks; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.agent_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    assigned_to uuid,
    created_by uuid,
    title character varying(500) NOT NULL,
    description text,
    type public.task_type_enum DEFAULT 'general'::public.task_type_enum NOT NULL,
    status character varying(50) DEFAULT 'todo'::character varying NOT NULL,
    priority character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    dependencies uuid[] DEFAULT '{}'::uuid[],
    tags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    progress integer DEFAULT 0,
    CONSTRAINT agent_tasks_progress_check CHECK (((progress >= 0) AND (progress <= 100)))
);


ALTER TABLE public.agent_tasks OWNER TO ridgetop;

--
-- Name: agents; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(100) DEFAULT 'ai_assistant'::character varying NOT NULL,
    capabilities text[] DEFAULT '{}'::text[],
    status character varying(50) DEFAULT 'active'::character varying NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    last_seen timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.agents OWNER TO ridgetop;

--
-- Name: code_analysis_sessions; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.code_analysis_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    analyzer_agent_id uuid,
    session_type character varying(100) DEFAULT 'full'::character varying NOT NULL,
    files_analyzed text[] DEFAULT '{}'::text[],
    components_found integer DEFAULT 0,
    dependencies_found integer DEFAULT 0,
    analysis_duration_ms integer,
    status character varying(50) DEFAULT 'completed'::character varying NOT NULL,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp with time zone
);


ALTER TABLE public.code_analysis_sessions OWNER TO ridgetop;

--
-- Name: code_components; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.code_components (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    file_path text NOT NULL,
    component_type character varying(100) NOT NULL,
    name character varying(500) NOT NULL,
    signature text,
    start_line integer,
    end_line integer,
    complexity_score integer DEFAULT 0,
    lines_of_code integer DEFAULT 0,
    documentation text,
    is_exported boolean DEFAULT false,
    is_deprecated boolean DEFAULT false,
    tags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    analyzed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_modified_commit character varying(40),
    creation_commit character varying(40),
    modification_frequency integer DEFAULT 0
);


ALTER TABLE public.code_components OWNER TO ridgetop;

--
-- Name: code_dependencies; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.code_dependencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    from_component_id uuid NOT NULL,
    to_component_id uuid,
    dependency_type character varying(100) NOT NULL,
    import_path text,
    import_alias character varying(255),
    is_external boolean DEFAULT false,
    confidence_score double precision DEFAULT 1.0,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.code_dependencies OWNER TO ridgetop;

--
-- Name: code_metrics; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.code_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    file_path text,
    component_id uuid,
    metric_type character varying(100) NOT NULL,
    metric_name character varying(255) NOT NULL,
    metric_value double precision NOT NULL,
    threshold_min double precision,
    threshold_max double precision,
    status character varying(50) DEFAULT 'ok'::character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    measured_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.code_metrics OWNER TO ridgetop;

--
-- Name: commit_session_links; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.commit_session_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    commit_id uuid NOT NULL,
    session_id uuid NOT NULL,
    link_type character varying(50) DEFAULT 'contributed'::character varying,
    confidence_score double precision DEFAULT 1.0,
    time_proximity_minutes integer,
    author_match boolean DEFAULT false,
    content_similarity double precision DEFAULT 0.0,
    relevant_context_ids uuid[] DEFAULT '{}'::uuid[],
    decision_ids uuid[] DEFAULT '{}'::uuid[],
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_by character varying(100),
    CONSTRAINT commit_session_links_confidence_score_check CHECK (((confidence_score >= (0)::double precision) AND (confidence_score <= (1)::double precision))),
    CONSTRAINT commit_session_links_link_type_check CHECK (((link_type)::text = ANY ((ARRAY['contributed'::character varying, 'reviewed'::character varying, 'planned'::character varying, 'discussed'::character varying, 'debugged'::character varying, 'tested'::character varying])::text[])))
);


ALTER TABLE public.commit_session_links OWNER TO ridgetop;

--
-- Name: contexts; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.contexts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    session_id uuid,
    context_type character varying(50) NOT NULL,
    content text NOT NULL,
    embedding public.vector(384),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    relevance_score double precision DEFAULT 1.0,
    tags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    related_commit_sha character varying(40),
    commit_context_type character varying(50),
    CONSTRAINT content_not_empty CHECK ((length(TRIM(BOTH FROM content)) > 0)),
    CONSTRAINT contexts_commit_context_type_check CHECK (((commit_context_type IS NULL) OR ((commit_context_type)::text = ANY ((ARRAY['pre_commit'::character varying, 'post_commit'::character varying, 'commit_discussion'::character varying, 'commit_review'::character varying])::text[])))),
    CONSTRAINT contexts_context_type_check CHECK (((context_type)::text = ANY (ARRAY[('code'::character varying)::text, ('decision'::character varying)::text, ('error'::character varying)::text, ('discussion'::character varying)::text, ('planning'::character varying)::text, ('completion'::character varying)::text, ('milestone'::character varying)::text]))),
    CONSTRAINT contexts_relevance_score_check CHECK (((relevance_score >= (0)::double precision) AND (relevance_score <= (10)::double precision)))
);


ALTER TABLE public.contexts OWNER TO ridgetop;

--
-- Name: file_analysis_cache; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.file_analysis_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    file_path text NOT NULL,
    file_hash character varying(64) NOT NULL,
    language character varying(50),
    analysis_result jsonb NOT NULL,
    components_count integer DEFAULT 0,
    dependencies_count integer DEFAULT 0,
    complexity_total integer DEFAULT 0,
    lines_of_code integer DEFAULT 0,
    last_modified timestamp with time zone,
    analyzed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.file_analysis_cache OWNER TO ridgetop;

--
-- Name: git_branches; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.git_branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    branch_name character varying(255) NOT NULL,
    full_ref_name character varying(500) NOT NULL,
    current_commit_sha character varying(40),
    is_default_branch boolean DEFAULT false,
    is_protected boolean DEFAULT false,
    is_active boolean DEFAULT true,
    upstream_branch character varying(255),
    merge_target character varying(255),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    first_commit_date timestamp with time zone,
    last_commit_date timestamp with time zone,
    deleted_at timestamp with time zone,
    description text,
    branch_type character varying(50) DEFAULT 'feature'::character varying,
    commit_count integer DEFAULT 0,
    unique_authors integer DEFAULT 0,
    associated_sessions uuid[] DEFAULT '{}'::uuid[],
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT git_branches_branch_type_check CHECK (((branch_type)::text = ANY ((ARRAY['main'::character varying, 'develop'::character varying, 'feature'::character varying, 'hotfix'::character varying, 'release'::character varying, 'bugfix'::character varying, 'experimental'::character varying])::text[])))
);


ALTER TABLE public.git_branches OWNER TO ridgetop;

--
-- Name: git_commits; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.git_commits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    commit_sha character varying(40) NOT NULL,
    short_sha character varying(12) NOT NULL,
    tree_sha character varying(40),
    parent_shas character varying(40)[] DEFAULT '{}'::character varying[],
    message text NOT NULL,
    author_name character varying(255) NOT NULL,
    author_email character varying(255) NOT NULL,
    author_date timestamp with time zone NOT NULL,
    committer_name character varying(255) NOT NULL,
    committer_email character varying(255) NOT NULL,
    committer_date timestamp with time zone NOT NULL,
    repository_url text,
    branch_name character varying(255),
    is_merge_commit boolean DEFAULT false,
    merge_strategy character varying(50),
    files_changed integer DEFAULT 0,
    insertions integer DEFAULT 0,
    deletions integer DEFAULT 0,
    total_changes integer GENERATED ALWAYS AS ((insertions + deletions)) STORED,
    discovered_by character varying(100),
    first_seen timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_analyzed boolean DEFAULT false,
    analysis_version integer DEFAULT 1,
    commit_type character varying(50) DEFAULT 'unknown'::character varying,
    tags text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT git_commits_commit_type_check CHECK (((commit_type)::text = ANY ((ARRAY['unknown'::character varying, 'feature'::character varying, 'bugfix'::character varying, 'refactor'::character varying, 'test'::character varying, 'docs'::character varying, 'style'::character varying, 'chore'::character varying, 'merge'::character varying, 'revert'::character varying, 'hotfix'::character varying, 'breaking'::character varying])::text[]))),
    CONSTRAINT non_empty_message CHECK ((length(TRIM(BOTH FROM message)) > 0)),
    CONSTRAINT valid_dates CHECK ((committer_date >= author_date)),
    CONSTRAINT valid_email_format CHECK ((((author_email)::text ~ '^[^@]+@[^@]+\.[^@]+$'::text) AND ((committer_email)::text ~ '^[^@]+@[^@]+\.[^@]+$'::text))),
    CONSTRAINT valid_sha_format CHECK ((((commit_sha)::text ~ '^[a-f0-9]{40}$'::text) AND ((short_sha)::text ~ '^[a-f0-9]{7,12}$'::text)))
);


ALTER TABLE public.git_commits OWNER TO ridgetop;

--
-- Name: git_file_changes; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.git_file_changes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    commit_id uuid NOT NULL,
    file_path text NOT NULL,
    old_file_path text,
    file_type character varying(50),
    change_type character varying(20) NOT NULL,
    lines_added integer DEFAULT 0,
    lines_removed integer DEFAULT 0,
    lines_changed integer GENERATED ALWAYS AS ((lines_added + lines_removed)) STORED,
    old_file_mode character varying(10),
    new_file_mode character varying(10),
    is_binary boolean DEFAULT false,
    is_generated boolean DEFAULT false,
    component_id uuid,
    affects_exports boolean DEFAULT false,
    complexity_delta integer DEFAULT 0,
    patch_preview text,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT git_file_changes_change_type_check CHECK (((change_type)::text = ANY ((ARRAY['added'::character varying, 'modified'::character varying, 'deleted'::character varying, 'renamed'::character varying, 'copied'::character varying, 'type_changed'::character varying])::text[]))),
    CONSTRAINT valid_line_counts CHECK (((lines_added >= 0) AND (lines_removed >= 0)))
);


ALTER TABLE public.git_file_changes OWNER TO ridgetop;

--
-- Name: naming_registry; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.naming_registry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    entity_type character varying(50) NOT NULL,
    canonical_name character varying(255) NOT NULL,
    aliases text[] DEFAULT '{}'::text[],
    description text,
    naming_convention jsonb DEFAULT '{}'::jsonb,
    first_seen timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_used timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    usage_count integer DEFAULT 1,
    deprecated boolean DEFAULT false,
    deprecated_reason text,
    replacement_id uuid,
    context_tags text[] DEFAULT '{}'::text[],
    related_entities uuid[] DEFAULT '{}'::uuid[],
    CONSTRAINT naming_registry_entity_type_check CHECK (((entity_type)::text = ANY (ARRAY[('variable'::character varying)::text, ('function'::character varying)::text, ('class'::character varying)::text, ('interface'::character varying)::text, ('type'::character varying)::text, ('component'::character varying)::text, ('file'::character varying)::text, ('directory'::character varying)::text, ('module'::character varying)::text, ('service'::character varying)::text, ('endpoint'::character varying)::text, ('database_table'::character varying)::text, ('database_column'::character varying)::text, ('config_key'::character varying)::text, ('environment_var'::character varying)::text, ('css_class'::character varying)::text, ('html_id'::character varying)::text])))
);


ALTER TABLE public.naming_registry OWNER TO ridgetop;

--
-- Name: projects; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(50) DEFAULT 'active'::character varying,
    git_repo_url text,
    root_directory text,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT projects_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('archived'::character varying)::text, ('completed'::character varying)::text, ('paused'::character varying)::text])))
);


ALTER TABLE public.projects OWNER TO ridgetop;

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    agent_type character varying(50) NOT NULL,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    ended_at timestamp with time zone,
    context_summary text,
    tokens_used integer DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    active_branch character varying(255),
    working_commit_sha character varying(40),
    commits_contributed integer DEFAULT 0,
    CONSTRAINT reasonable_session_duration CHECK (((ended_at IS NULL) OR (ended_at >= started_at)))
);


ALTER TABLE public.sessions OWNER TO ridgetop;

--
-- Name: tasks; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    title character varying(500) NOT NULL,
    description text,
    type character varying(100) DEFAULT 'general'::character varying NOT NULL,
    status character varying(50) DEFAULT 'todo'::character varying NOT NULL,
    priority character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    assigned_to uuid,
    dependencies uuid[] DEFAULT '{}'::uuid[],
    tags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tasks OWNER TO ridgetop;

--
-- Name: TABLE tasks; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TABLE public.tasks IS 'Task management system for AI development coordination';


--
-- Name: COLUMN tasks.status; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.tasks.status IS 'Task status: todo (not started), in_progress (actively worked on), blocked (waiting on dependency), completed (finished), cancelled (abandoned)';


--
-- Name: COLUMN tasks.priority; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.tasks.priority IS 'Task priority: low (nice to have), medium (normal), high (important), urgent (critical/blocking)';


--
-- Name: COLUMN tasks.dependencies; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.tasks.dependencies IS 'Array of task UUIDs that must be completed before this task';


--
-- Name: COLUMN tasks.metadata; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.tasks.metadata IS 'Flexible JSON storage for additional task data like estimated time, labels, etc.';


--
-- Name: technical_decisions; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.technical_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    session_id uuid,
    decision_type character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    description text NOT NULL,
    rationale text NOT NULL,
    problem_statement text,
    success_criteria text,
    alternatives_considered jsonb DEFAULT '[]'::jsonb,
    decision_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    decided_by text,
    stakeholders text[],
    status character varying(50) DEFAULT 'active'::character varying,
    superseded_by uuid,
    superseded_date timestamp with time zone,
    superseded_reason text,
    impact_level character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    affected_components text[],
    tags text[] DEFAULT '{}'::text[],
    category text,
    outcome_status character varying(50) DEFAULT 'unknown'::character varying,
    outcome_notes text,
    lessons_learned text,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    implementing_commits character varying(40)[] DEFAULT '{}'::character varying[],
    implementation_status character varying(50) DEFAULT 'not_started'::character varying,
    CONSTRAINT technical_decisions_decision_type_check CHECK (((decision_type)::text = ANY (ARRAY[('architecture'::character varying)::text, ('library'::character varying)::text, ('framework'::character varying)::text, ('pattern'::character varying)::text, ('api_design'::character varying)::text, ('database'::character varying)::text, ('deployment'::character varying)::text, ('security'::character varying)::text, ('performance'::character varying)::text, ('ui_ux'::character varying)::text, ('testing'::character varying)::text, ('tooling'::character varying)::text, ('process'::character varying)::text, ('naming_convention'::character varying)::text, ('code_style'::character varying)::text]))),
    CONSTRAINT technical_decisions_impact_level_check CHECK (((impact_level)::text = ANY (ARRAY[('low'::character varying)::text, ('medium'::character varying)::text, ('high'::character varying)::text, ('critical'::character varying)::text]))),
    CONSTRAINT technical_decisions_implementation_status_check CHECK (((implementation_status)::text = ANY ((ARRAY['not_started'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'abandoned'::character varying])::text[]))),
    CONSTRAINT technical_decisions_outcome_status_check CHECK (((outcome_status)::text = ANY (ARRAY[('unknown'::character varying)::text, ('successful'::character varying)::text, ('failed'::character varying)::text, ('mixed'::character varying)::text, ('too_early'::character varying)::text]))),
    CONSTRAINT technical_decisions_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('deprecated'::character varying)::text, ('superseded'::character varying)::text, ('under_review'::character varying)::text])))
);


ALTER TABLE public.technical_decisions OWNER TO ridgetop;

--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    token_id character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp without time zone NOT NULL,
    is_active boolean DEFAULT true
);


ALTER TABLE public.user_sessions OWNER TO ridgetop;

--
-- Name: _aidis_migrations id; Type: DEFAULT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public._aidis_migrations ALTER COLUMN id SET DEFAULT nextval('public._aidis_migrations_id_seq'::regclass);


--
-- Name: _aidis_migrations _aidis_migrations_filename_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public._aidis_migrations
    ADD CONSTRAINT _aidis_migrations_filename_key UNIQUE (filename);


--
-- Name: _aidis_migrations _aidis_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public._aidis_migrations
    ADD CONSTRAINT _aidis_migrations_pkey PRIMARY KEY (id);


--
-- Name: admin_users admin_users_email_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_email_key UNIQUE (email);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);


--
-- Name: admin_users admin_users_username_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_username_key UNIQUE (username);


--
-- Name: agent_collaborations agent_collaborations_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_collaborations
    ADD CONSTRAINT agent_collaborations_pkey PRIMARY KEY (id);


--
-- Name: agent_messages agent_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_messages
    ADD CONSTRAINT agent_messages_pkey PRIMARY KEY (id);


--
-- Name: agent_sessions agent_sessions_agent_id_session_id_project_id_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_sessions
    ADD CONSTRAINT agent_sessions_agent_id_session_id_project_id_key UNIQUE (agent_id, session_id, project_id);


--
-- Name: agent_sessions agent_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_sessions
    ADD CONSTRAINT agent_sessions_pkey PRIMARY KEY (id);


--
-- Name: agent_tasks agent_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_pkey PRIMARY KEY (id);


--
-- Name: agents agents_name_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_name_key UNIQUE (name);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);


--
-- Name: code_analysis_sessions code_analysis_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_analysis_sessions
    ADD CONSTRAINT code_analysis_sessions_pkey PRIMARY KEY (id);


--
-- Name: code_components code_components_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_components
    ADD CONSTRAINT code_components_pkey PRIMARY KEY (id);


--
-- Name: code_dependencies code_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_dependencies
    ADD CONSTRAINT code_dependencies_pkey PRIMARY KEY (id);


--
-- Name: code_metrics code_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_metrics
    ADD CONSTRAINT code_metrics_pkey PRIMARY KEY (id);


--
-- Name: commit_session_links commit_session_links_commit_id_session_id_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.commit_session_links
    ADD CONSTRAINT commit_session_links_commit_id_session_id_key UNIQUE (commit_id, session_id);


--
-- Name: commit_session_links commit_session_links_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.commit_session_links
    ADD CONSTRAINT commit_session_links_pkey PRIMARY KEY (id);


--
-- Name: contexts contexts_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.contexts
    ADD CONSTRAINT contexts_pkey PRIMARY KEY (id);


--
-- Name: file_analysis_cache file_analysis_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.file_analysis_cache
    ADD CONSTRAINT file_analysis_cache_pkey PRIMARY KEY (id);


--
-- Name: file_analysis_cache file_analysis_cache_project_id_file_path_file_hash_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.file_analysis_cache
    ADD CONSTRAINT file_analysis_cache_project_id_file_path_file_hash_key UNIQUE (project_id, file_path, file_hash);


--
-- Name: git_branches git_branches_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.git_branches
    ADD CONSTRAINT git_branches_pkey PRIMARY KEY (id);


--
-- Name: git_branches git_branches_project_id_branch_name_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.git_branches
    ADD CONSTRAINT git_branches_project_id_branch_name_key UNIQUE (project_id, branch_name);


--
-- Name: git_commits git_commits_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.git_commits
    ADD CONSTRAINT git_commits_pkey PRIMARY KEY (id);


--
-- Name: git_commits git_commits_project_id_commit_sha_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.git_commits
    ADD CONSTRAINT git_commits_project_id_commit_sha_key UNIQUE (project_id, commit_sha);


--
-- Name: git_file_changes git_file_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.git_file_changes
    ADD CONSTRAINT git_file_changes_pkey PRIMARY KEY (id);


--
-- Name: naming_registry naming_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.naming_registry
    ADD CONSTRAINT naming_registry_pkey PRIMARY KEY (id);


--
-- Name: naming_registry naming_registry_project_id_entity_type_canonical_name_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.naming_registry
    ADD CONSTRAINT naming_registry_project_id_entity_type_canonical_name_key UNIQUE (project_id, entity_type, canonical_name);


--
-- Name: projects projects_name_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_name_key UNIQUE (name);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: technical_decisions technical_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.technical_decisions
    ADD CONSTRAINT technical_decisions_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_token_id_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_token_id_key UNIQUE (token_id);


--
-- Name: idx_admin_users_email; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_admin_users_email ON public.admin_users USING btree (email);


--
-- Name: idx_admin_users_username; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_admin_users_username ON public.admin_users USING btree (username);


--
-- Name: idx_agent_collaborations_agents; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_collaborations_agents ON public.agent_collaborations USING gin (agents);


--
-- Name: idx_agent_collaborations_contexts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_collaborations_contexts ON public.agent_collaborations USING gin (contexts);


--
-- Name: idx_agent_collaborations_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_collaborations_project ON public.agent_collaborations USING btree (project_id);


--
-- Name: idx_agent_collaborations_started_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_collaborations_started_at ON public.agent_collaborations USING btree (started_at);


--
-- Name: idx_agent_collaborations_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_collaborations_status ON public.agent_collaborations USING btree (status);


--
-- Name: idx_agent_collaborations_tasks; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_collaborations_tasks ON public.agent_collaborations USING gin (tasks);


--
-- Name: idx_agent_collaborations_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_collaborations_type ON public.agent_collaborations USING btree (type);


--
-- Name: idx_agent_messages_context_refs; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_messages_context_refs ON public.agent_messages USING gin (context_refs);


--
-- Name: idx_agent_messages_created_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_messages_created_at ON public.agent_messages USING btree (created_at);


--
-- Name: idx_agent_messages_from; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_messages_from ON public.agent_messages USING btree (from_agent_id);


--
-- Name: idx_agent_messages_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_messages_project ON public.agent_messages USING btree (project_id);


--
-- Name: idx_agent_messages_task_refs; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_messages_task_refs ON public.agent_messages USING gin (task_refs);


--
-- Name: idx_agent_messages_to; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_messages_to ON public.agent_messages USING btree (to_agent_id);


--
-- Name: idx_agent_messages_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_messages_type ON public.agent_messages USING btree (message_type);


--
-- Name: idx_agent_sessions_activity; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_sessions_activity ON public.agent_sessions USING btree (last_activity);


--
-- Name: idx_agent_sessions_agent; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_sessions_agent ON public.agent_sessions USING btree (agent_id);


--
-- Name: idx_agent_sessions_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_sessions_project ON public.agent_sessions USING btree (project_id);


--
-- Name: idx_agent_sessions_session; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_sessions_session ON public.agent_sessions USING btree (session_id);


--
-- Name: idx_agent_sessions_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_sessions_status ON public.agent_sessions USING btree (status);


--
-- Name: idx_agent_tasks_assigned_to; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_tasks_assigned_to ON public.agent_tasks USING btree (assigned_to);


--
-- Name: idx_agent_tasks_created_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_tasks_created_at ON public.agent_tasks USING btree (created_at);


--
-- Name: idx_agent_tasks_created_by; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_tasks_created_by ON public.agent_tasks USING btree (created_by);


--
-- Name: idx_agent_tasks_dependencies; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_tasks_dependencies ON public.agent_tasks USING gin (dependencies);


--
-- Name: idx_agent_tasks_priority; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_tasks_priority ON public.agent_tasks USING btree (priority);


--
-- Name: idx_agent_tasks_progress; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_tasks_progress ON public.agent_tasks USING btree (progress);


--
-- Name: idx_agent_tasks_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_tasks_project ON public.agent_tasks USING btree (project_id);


--
-- Name: idx_agent_tasks_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_tasks_status ON public.agent_tasks USING btree (status);


--
-- Name: idx_agent_tasks_tags; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_tasks_tags ON public.agent_tasks USING gin (tags);


--
-- Name: idx_agent_tasks_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_tasks_type ON public.agent_tasks USING btree (type);


--
-- Name: idx_agent_tasks_type_enum; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agent_tasks_type_enum ON public.agent_tasks USING btree (type);


--
-- Name: idx_agents_last_seen; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agents_last_seen ON public.agents USING btree (last_seen);


--
-- Name: idx_agents_name; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agents_name ON public.agents USING btree (name);


--
-- Name: idx_agents_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agents_status ON public.agents USING btree (status);


--
-- Name: idx_agents_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_agents_type ON public.agents USING btree (type);


--
-- Name: idx_code_analysis_sessions_agent; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_agent ON public.code_analysis_sessions USING btree (analyzer_agent_id);


--
-- Name: idx_code_analysis_sessions_files; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_files ON public.code_analysis_sessions USING gin (files_analyzed);


--
-- Name: idx_code_analysis_sessions_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_project ON public.code_analysis_sessions USING btree (project_id);


--
-- Name: idx_code_analysis_sessions_started; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_started ON public.code_analysis_sessions USING btree (started_at);


--
-- Name: idx_code_analysis_sessions_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_status ON public.code_analysis_sessions USING btree (status);


--
-- Name: idx_code_components_documentation_fts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_components_documentation_fts ON public.code_components USING gin (to_tsvector('english'::regconfig, documentation));


--
-- Name: idx_code_components_exported; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_components_exported ON public.code_components USING btree (is_exported);


--
-- Name: idx_code_components_file; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_components_file ON public.code_components USING btree (file_path);


--
-- Name: idx_code_components_last_modified; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_components_last_modified ON public.code_components USING btree (last_modified_commit) WHERE (last_modified_commit IS NOT NULL);


--
-- Name: idx_code_components_name; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_components_name ON public.code_components USING btree (name);


--
-- Name: idx_code_components_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_components_project ON public.code_components USING btree (project_id);


--
-- Name: idx_code_components_tags; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_components_tags ON public.code_components USING gin (tags);


--
-- Name: idx_code_components_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_components_type ON public.code_components USING btree (component_type);


--
-- Name: idx_code_components_updated; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_components_updated ON public.code_components USING btree (updated_at);


--
-- Name: idx_code_dependencies_external; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_dependencies_external ON public.code_dependencies USING btree (is_external);


--
-- Name: idx_code_dependencies_from; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_dependencies_from ON public.code_dependencies USING btree (from_component_id);


--
-- Name: idx_code_dependencies_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_dependencies_project ON public.code_dependencies USING btree (project_id);


--
-- Name: idx_code_dependencies_to; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_dependencies_to ON public.code_dependencies USING btree (to_component_id);


--
-- Name: idx_code_dependencies_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_dependencies_type ON public.code_dependencies USING btree (dependency_type);


--
-- Name: idx_code_metrics_component; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_metrics_component ON public.code_metrics USING btree (component_id);


--
-- Name: idx_code_metrics_measured; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_metrics_measured ON public.code_metrics USING btree (measured_at);


--
-- Name: idx_code_metrics_name; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_metrics_name ON public.code_metrics USING btree (metric_name);


--
-- Name: idx_code_metrics_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_metrics_project ON public.code_metrics USING btree (project_id);


--
-- Name: idx_code_metrics_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_metrics_status ON public.code_metrics USING btree (status);


--
-- Name: idx_code_metrics_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_metrics_type ON public.code_metrics USING btree (metric_type);


--
-- Name: idx_commit_session_links_commit; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_commit_session_links_commit ON public.commit_session_links USING btree (commit_id);


--
-- Name: idx_commit_session_links_confidence; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_commit_session_links_confidence ON public.commit_session_links USING btree (confidence_score DESC);


--
-- Name: idx_commit_session_links_contexts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_commit_session_links_contexts ON public.commit_session_links USING gin (relevant_context_ids);


--
-- Name: idx_commit_session_links_decisions; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_commit_session_links_decisions ON public.commit_session_links USING gin (decision_ids);


--
-- Name: idx_commit_session_links_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_commit_session_links_project ON public.commit_session_links USING btree (project_id);


--
-- Name: idx_commit_session_links_session; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_commit_session_links_session ON public.commit_session_links USING btree (session_id);


--
-- Name: idx_commit_session_links_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_commit_session_links_type ON public.commit_session_links USING btree (link_type, project_id);


--
-- Name: idx_contexts_commit_sha; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_commit_sha ON public.contexts USING btree (related_commit_sha) WHERE (related_commit_sha IS NOT NULL);


--
-- Name: idx_contexts_content_fts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_content_fts ON public.contexts USING gin (to_tsvector('english'::regconfig, content));


--
-- Name: idx_contexts_created_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_created_at ON public.contexts USING btree (created_at);


--
-- Name: idx_contexts_embedding_cosine; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_embedding_cosine ON public.contexts USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');


--
-- Name: idx_contexts_metadata_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_metadata_gin ON public.contexts USING gin (metadata);


--
-- Name: idx_contexts_project_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_project_id ON public.contexts USING btree (project_id);


--
-- Name: idx_contexts_project_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_project_type ON public.contexts USING btree (project_id, context_type);


--
-- Name: idx_contexts_relevance; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_relevance ON public.contexts USING btree (relevance_score DESC);


--
-- Name: idx_contexts_session_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_session_id ON public.contexts USING btree (session_id);


--
-- Name: idx_contexts_tags_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_tags_gin ON public.contexts USING gin (tags);


--
-- Name: idx_contexts_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_type ON public.contexts USING btree (context_type);


--
-- Name: idx_file_analysis_cache_analyzed; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_file_analysis_cache_analyzed ON public.file_analysis_cache USING btree (analyzed_at);


--
-- Name: idx_file_analysis_cache_file; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_file_analysis_cache_file ON public.file_analysis_cache USING btree (file_path);


--
-- Name: idx_file_analysis_cache_hash; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_file_analysis_cache_hash ON public.file_analysis_cache USING btree (file_hash);


--
-- Name: idx_file_analysis_cache_language; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_file_analysis_cache_language ON public.file_analysis_cache USING btree (language);


--
-- Name: idx_file_analysis_cache_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_file_analysis_cache_project ON public.file_analysis_cache USING btree (project_id);


--
-- Name: idx_git_branches_active; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_branches_active ON public.git_branches USING btree (is_active, project_id);


--
-- Name: idx_git_branches_current_commit; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_branches_current_commit ON public.git_branches USING btree (current_commit_sha);


--
-- Name: idx_git_branches_default; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_branches_default ON public.git_branches USING btree (is_default_branch, project_id);


--
-- Name: idx_git_branches_description_fts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_branches_description_fts ON public.git_branches USING gin (to_tsvector('english'::regconfig, COALESCE(description, ''::text)));


--
-- Name: idx_git_branches_last_commit; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_branches_last_commit ON public.git_branches USING btree (last_commit_date DESC);


--
-- Name: idx_git_branches_name; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_branches_name ON public.git_branches USING btree (branch_name);


--
-- Name: idx_git_branches_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_branches_project ON public.git_branches USING btree (project_id);


--
-- Name: idx_git_branches_sessions; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_branches_sessions ON public.git_branches USING gin (associated_sessions);


--
-- Name: idx_git_branches_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_branches_type ON public.git_branches USING btree (branch_type, project_id);


--
-- Name: idx_git_commits_analyzed; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_analyzed ON public.git_commits USING btree (is_analyzed, project_id);


--
-- Name: idx_git_commits_author; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_author ON public.git_commits USING btree (author_email, author_date DESC);


--
-- Name: idx_git_commits_author_date; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_author_date ON public.git_commits USING btree (author_date DESC);


--
-- Name: idx_git_commits_branch; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_branch ON public.git_commits USING btree (branch_name);


--
-- Name: idx_git_commits_committer_date; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_committer_date ON public.git_commits USING btree (committer_date DESC);


--
-- Name: idx_git_commits_full_fts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_full_fts ON public.git_commits USING gin (to_tsvector('english'::regconfig, ((((message || ' '::text) || (author_name)::text) || ' '::text) || (COALESCE(branch_name, ''::character varying))::text)));


--
-- Name: idx_git_commits_merge; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_merge ON public.git_commits USING btree (is_merge_commit, project_id);


--
-- Name: idx_git_commits_message_fts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_message_fts ON public.git_commits USING gin (to_tsvector('english'::regconfig, message));


--
-- Name: idx_git_commits_parent_shas; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_parent_shas ON public.git_commits USING gin (parent_shas);


--
-- Name: idx_git_commits_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_project ON public.git_commits USING btree (project_id);


--
-- Name: idx_git_commits_project_author; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_project_author ON public.git_commits USING btree (project_id, author_email, author_date DESC);


--
-- Name: idx_git_commits_project_branch_date; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_project_branch_date ON public.git_commits USING btree (project_id, branch_name, author_date DESC);


--
-- Name: idx_git_commits_project_date; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_project_date ON public.git_commits USING btree (project_id, author_date DESC);


--
-- Name: idx_git_commits_sha; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_sha ON public.git_commits USING btree (commit_sha);


--
-- Name: idx_git_commits_short_sha; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_short_sha ON public.git_commits USING btree (short_sha);


--
-- Name: idx_git_commits_stats; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_stats ON public.git_commits USING btree (files_changed DESC, total_changes DESC);


--
-- Name: idx_git_commits_tags; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_tags ON public.git_commits USING gin (tags);


--
-- Name: idx_git_commits_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_type ON public.git_commits USING btree (commit_type, project_id);


--
-- Name: idx_git_file_changes_commit; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_file_changes_commit ON public.git_file_changes USING btree (commit_id);


--
-- Name: idx_git_file_changes_component; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_file_changes_component ON public.git_file_changes USING btree (component_id);


--
-- Name: idx_git_file_changes_file_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_file_changes_file_type ON public.git_file_changes USING btree (file_type, project_id);


--
-- Name: idx_git_file_changes_path; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_file_changes_path ON public.git_file_changes USING btree (file_path);


--
-- Name: idx_git_file_changes_path_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_file_changes_path_type ON public.git_file_changes USING btree (file_path, change_type);


--
-- Name: idx_git_file_changes_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_file_changes_project ON public.git_file_changes USING btree (project_id);


--
-- Name: idx_git_file_changes_project_path; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_file_changes_project_path ON public.git_file_changes USING btree (project_id, file_path);


--
-- Name: idx_git_file_changes_stats; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_file_changes_stats ON public.git_file_changes USING btree (lines_changed DESC);


--
-- Name: idx_git_file_changes_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_file_changes_type ON public.git_file_changes USING btree (change_type, project_id);


--
-- Name: idx_migrations_number; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_migrations_number ON public._aidis_migrations USING btree (migration_number);


--
-- Name: idx_naming_registry_aliases_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_naming_registry_aliases_gin ON public.naming_registry USING gin (aliases);


--
-- Name: idx_naming_registry_canonical_name; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_naming_registry_canonical_name ON public.naming_registry USING btree (canonical_name);


--
-- Name: idx_naming_registry_deprecated; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_naming_registry_deprecated ON public.naming_registry USING btree (deprecated, project_id);


--
-- Name: idx_naming_registry_description_fts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_naming_registry_description_fts ON public.naming_registry USING gin (to_tsvector('english'::regconfig, description));


--
-- Name: idx_naming_registry_project_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_naming_registry_project_type ON public.naming_registry USING btree (project_id, entity_type);


--
-- Name: idx_naming_registry_tags_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_naming_registry_tags_gin ON public.naming_registry USING gin (context_tags);


--
-- Name: idx_naming_registry_usage; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_naming_registry_usage ON public.naming_registry USING btree (usage_count DESC, last_used DESC);


--
-- Name: idx_projects_created_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_projects_created_at ON public.projects USING btree (created_at);


--
-- Name: idx_projects_metadata_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_projects_metadata_gin ON public.projects USING gin (metadata);


--
-- Name: idx_projects_name; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_projects_name ON public.projects USING btree (name);


--
-- Name: idx_projects_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_projects_status ON public.projects USING btree (status);


--
-- Name: idx_sessions_agent_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_agent_type ON public.sessions USING btree (agent_type);


--
-- Name: idx_sessions_branch; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_branch ON public.sessions USING btree (active_branch) WHERE (active_branch IS NOT NULL);


--
-- Name: idx_sessions_project_agent; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_project_agent ON public.sessions USING btree (project_id, agent_type);


--
-- Name: idx_sessions_project_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_project_id ON public.sessions USING btree (project_id);


--
-- Name: idx_sessions_started_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_started_at ON public.sessions USING btree (started_at);


--
-- Name: idx_sessions_working_commit; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_working_commit ON public.sessions USING btree (working_commit_sha) WHERE (working_commit_sha IS NOT NULL);


--
-- Name: idx_tasks_active; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_active ON public.tasks USING btree (project_id, status) WHERE ((status)::text <> ALL (ARRAY[('completed'::character varying)::text, ('cancelled'::character varying)::text]));


--
-- Name: idx_tasks_assigned_to; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_assigned_to ON public.tasks USING btree (assigned_to);


--
-- Name: idx_tasks_created_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_created_at ON public.tasks USING btree (created_at);


--
-- Name: idx_tasks_dependencies; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_dependencies ON public.tasks USING gin (dependencies);


--
-- Name: idx_tasks_priority; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_priority ON public.tasks USING btree (priority);


--
-- Name: idx_tasks_project_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_project_id ON public.tasks USING btree (project_id);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);


--
-- Name: idx_tasks_tags; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_tags ON public.tasks USING gin (tags);


--
-- Name: idx_tasks_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_type ON public.tasks USING btree (type);


--
-- Name: idx_tasks_updated_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_updated_at ON public.tasks USING btree (updated_at);


--
-- Name: idx_tasks_urgent; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_urgent ON public.tasks USING btree (project_id, priority) WHERE ((priority)::text = 'urgent'::text);


--
-- Name: idx_technical_decisions_commits; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_technical_decisions_commits ON public.technical_decisions USING gin (implementing_commits);


--
-- Name: idx_technical_decisions_components_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_technical_decisions_components_gin ON public.technical_decisions USING gin (affected_components);


--
-- Name: idx_technical_decisions_content_fts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_technical_decisions_content_fts ON public.technical_decisions USING gin (to_tsvector('english'::regconfig, (((((((title)::text || ' '::text) || description) || ' '::text) || rationale) || ' '::text) || COALESCE(problem_statement, ''::text))));


--
-- Name: idx_technical_decisions_date; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_technical_decisions_date ON public.technical_decisions USING btree (decision_date DESC);


--
-- Name: idx_technical_decisions_impact; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_technical_decisions_impact ON public.technical_decisions USING btree (impact_level, project_id);


--
-- Name: idx_technical_decisions_project_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_technical_decisions_project_type ON public.technical_decisions USING btree (project_id, decision_type);


--
-- Name: idx_technical_decisions_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_technical_decisions_status ON public.technical_decisions USING btree (status, project_id);


--
-- Name: idx_technical_decisions_tags_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_technical_decisions_tags_gin ON public.technical_decisions USING gin (tags);


--
-- Name: idx_technical_decisions_updated_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_technical_decisions_updated_at ON public.technical_decisions USING btree (updated_at DESC);


--
-- Name: idx_user_sessions_expires_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_user_sessions_expires_at ON public.user_sessions USING btree (expires_at);


--
-- Name: idx_user_sessions_token_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_user_sessions_token_id ON public.user_sessions USING btree (token_id);


--
-- Name: idx_user_sessions_user_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id);


--
-- Name: tasks trigger_update_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER trigger_update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_tasks_updated_at();


--
-- Name: git_commits update_git_branch_stats; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER update_git_branch_stats AFTER INSERT OR UPDATE ON public.git_commits FOR EACH ROW EXECUTE FUNCTION public.update_branch_stats();


--
-- Name: git_branches update_git_branches_updated_at; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER update_git_branches_updated_at BEFORE UPDATE ON public.git_branches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: git_commits update_git_commits_updated_at; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER update_git_commits_updated_at BEFORE UPDATE ON public.git_commits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: projects update_projects_updated_at; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sessions update_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: git_commits validate_git_commit_data; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER validate_git_commit_data BEFORE INSERT OR UPDATE ON public.git_commits FOR EACH ROW EXECUTE FUNCTION public.validate_commit_insertion();


--
-- Name: agent_collaborations agent_collaborations_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_collaborations
    ADD CONSTRAINT agent_collaborations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: agent_messages agent_messages_from_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_messages
    ADD CONSTRAINT agent_messages_from_agent_id_fkey FOREIGN KEY (from_agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: agent_messages agent_messages_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_messages
    ADD CONSTRAINT agent_messages_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: agent_messages agent_messages_to_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_messages
    ADD CONSTRAINT agent_messages_to_agent_id_fkey FOREIGN KEY (to_agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: agent_sessions agent_sessions_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_sessions
    ADD CONSTRAINT agent_sessions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: agent_sessions agent_sessions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_sessions
    ADD CONSTRAINT agent_sessions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: agent_tasks agent_tasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: agent_tasks agent_tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: agent_tasks agent_tasks_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.agent_tasks
    ADD CONSTRAINT agent_tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: code_analysis_sessions code_analysis_sessions_analyzer_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_analysis_sessions
    ADD CONSTRAINT code_analysis_sessions_analyzer_agent_id_fkey FOREIGN KEY (analyzer_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: code_analysis_sessions code_analysis_sessions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_analysis_sessions
    ADD CONSTRAINT code_analysis_sessions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: code_components code_components_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_components
    ADD CONSTRAINT code_components_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: code_dependencies code_dependencies_from_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_dependencies
    ADD CONSTRAINT code_dependencies_from_component_id_fkey FOREIGN KEY (from_component_id) REFERENCES public.code_components(id) ON DELETE CASCADE;


--
-- Name: code_dependencies code_dependencies_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_dependencies
    ADD CONSTRAINT code_dependencies_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: code_dependencies code_dependencies_to_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_dependencies
    ADD CONSTRAINT code_dependencies_to_component_id_fkey FOREIGN KEY (to_component_id) REFERENCES public.code_components(id) ON DELETE CASCADE;


--
-- Name: code_metrics code_metrics_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_metrics
    ADD CONSTRAINT code_metrics_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.code_components(id) ON DELETE CASCADE;


--
-- Name: code_metrics code_metrics_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_metrics
    ADD CONSTRAINT code_metrics_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: commit_session_links commit_session_links_commit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.commit_session_links
    ADD CONSTRAINT commit_session_links_commit_id_fkey FOREIGN KEY (commit_id) REFERENCES public.git_commits(id) ON DELETE CASCADE;


--
-- Name: commit_session_links commit_session_links_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.commit_session_links
    ADD CONSTRAINT commit_session_links_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: commit_session_links commit_session_links_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.commit_session_links
    ADD CONSTRAINT commit_session_links_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: contexts contexts_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.contexts
    ADD CONSTRAINT contexts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: contexts contexts_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.contexts
    ADD CONSTRAINT contexts_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;


--
-- Name: file_analysis_cache file_analysis_cache_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.file_analysis_cache
    ADD CONSTRAINT file_analysis_cache_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: git_branches git_branches_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.git_branches
    ADD CONSTRAINT git_branches_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: git_commits git_commits_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.git_commits
    ADD CONSTRAINT git_commits_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: git_file_changes git_file_changes_commit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.git_file_changes
    ADD CONSTRAINT git_file_changes_commit_id_fkey FOREIGN KEY (commit_id) REFERENCES public.git_commits(id) ON DELETE CASCADE;


--
-- Name: git_file_changes git_file_changes_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.git_file_changes
    ADD CONSTRAINT git_file_changes_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.code_components(id) ON DELETE SET NULL;


--
-- Name: git_file_changes git_file_changes_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.git_file_changes
    ADD CONSTRAINT git_file_changes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: naming_registry naming_registry_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.naming_registry
    ADD CONSTRAINT naming_registry_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: naming_registry naming_registry_replacement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.naming_registry
    ADD CONSTRAINT naming_registry_replacement_id_fkey FOREIGN KEY (replacement_id) REFERENCES public.naming_registry(id);


--
-- Name: sessions sessions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: technical_decisions technical_decisions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.technical_decisions
    ADD CONSTRAINT technical_decisions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: technical_decisions technical_decisions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.technical_decisions
    ADD CONSTRAINT technical_decisions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;


--
-- Name: technical_decisions technical_decisions_superseded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.technical_decisions
    ADD CONSTRAINT technical_decisions_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES public.technical_decisions(id);


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.admin_users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 2Ceg4At2VvLNO0T8DWa7ZvPFxt2FYTfVgOTfkVB3sHDmH271BuLaDqNByrNbMA4

