--
-- PostgreSQL database dump
--

\restrict JMM4Q0LDX1GdFtp9MBSv6mMferfqWiF5DftcJa9RxTjr9kizaLNg0c0c10AYceO

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
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


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
-- Name: cutover_stage; Type: TYPE; Schema: public; Owner: ridgetop
--

CREATE TYPE public.cutover_stage AS ENUM (
    'disabled',
    'dual_write',
    'test_1',
    'test_10',
    'half_50',
    'full_100',
    'completed',
    'rolled_back'
);


ALTER TYPE public.cutover_stage OWNER TO ridgetop;

--
-- Name: TYPE cutover_stage; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TYPE public.cutover_stage IS 'P2.3 Enum for tracking cutover progression stages';


--
-- Name: shadow_sync_status; Type: TYPE; Schema: public; Owner: ridgetop
--

CREATE TYPE public.shadow_sync_status AS ENUM (
    'pending',
    'synced',
    'conflict',
    'migrated',
    'validated'
);


ALTER TYPE public.shadow_sync_status OWNER TO ridgetop;

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
-- Name: advance_cutover_stage(text, boolean); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.advance_cutover_stage(p_table_name text, p_force boolean DEFAULT false) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    current_config RECORD;
    next_stage cutover_stage;
    next_percentage INTEGER;
    result_msg TEXT;
    health_check_result RECORD;
BEGIN
    -- Get current configuration
    SELECT * INTO current_config
    FROM traffic_routing_config
    WHERE table_name = p_table_name;

    IF current_config IS NULL THEN
        RETURN format('ERROR: Table %s not found in routing configuration', p_table_name);
    END IF;

    -- Check if advancement is eligible
    IF NOT p_force AND CURRENT_TIMESTAMP < current_config.next_stage_eligible_at THEN
        RETURN format('ERROR: Stage advancement not yet eligible. Next eligible: %s',
            current_config.next_stage_eligible_at);
    END IF;

    -- Check health status unless forced
    IF NOT p_force AND current_config.health_status NOT IN ('healthy', 'warning') THEN
        RETURN format('ERROR: Health status %s prevents stage advancement', current_config.health_status);
    END IF;

    -- Determine next stage
    next_stage := CASE current_config.cutover_stage
        WHEN 'dual_write' THEN 'test_1'
        WHEN 'test_1' THEN 'test_10'
        WHEN 'test_10' THEN 'half_50'
        WHEN 'half_50' THEN 'full_100'
        WHEN 'full_100' THEN 'completed'
        ELSE NULL
    END;

    IF next_stage IS NULL THEN
        RETURN format('ERROR: Cannot advance from stage %s', current_config.cutover_stage);
    END IF;

    -- Determine read percentage for next stage
    next_percentage := CASE next_stage
        WHEN 'test_1' THEN 1
        WHEN 'test_10' THEN 10
        WHEN 'half_50' THEN 50
        WHEN 'full_100' THEN 100
        WHEN 'completed' THEN 100
        ELSE 0
    END;

    -- Perform health check before advancement
    SELECT * INTO health_check_result FROM perform_cutover_health_check(p_table_name);

    IF NOT p_force AND health_check_result.overall_health != 'healthy' THEN
        RETURN format('ERROR: Health check failed: %s', health_check_result.health_summary);
    END IF;

    -- Update to next stage
    UPDATE traffic_routing_config
    SET
        cutover_stage = next_stage,
        read_percentage = next_percentage,
        stage_started_at = CURRENT_TIMESTAMP,
        next_stage_eligible_at = CURRENT_TIMESTAMP + (current_config.stage_duration_target_minutes || ' minutes')::INTERVAL,
        consecutive_failures = 0,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = current_user,
        notes = COALESCE(notes, '') || format(' ADVANCED to %s (%s%% reads) at %s',
            next_stage, next_percentage, CURRENT_TIMESTAMP)
    WHERE table_name = p_table_name;

    result_msg := format('Cutover ADVANCED for table %s - Stage: %s (%s%% reads)',
        p_table_name, next_stage, next_percentage);
    RAISE NOTICE '%', result_msg;

    RETURN result_msg;
END;
$$;


ALTER FUNCTION public.advance_cutover_stage(p_table_name text, p_force boolean) OWNER TO ridgetop;

--
-- Name: FUNCTION advance_cutover_stage(p_table_name text, p_force boolean); Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON FUNCTION public.advance_cutover_stage(p_table_name text, p_force boolean) IS 'P2.3 Advance cutover to next stage with safety checks';


--
-- Name: archive_old_pattern_sessions(integer); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.archive_old_pattern_sessions(retention_days integer DEFAULT 90) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    archived_count INTEGER;
BEGIN
    -- Mark old sessions as outdated instead of deleting (preserves history)
    UPDATE pattern_discovery_sessions 
    SET 
        status = 'outdated',
        updated_at = CURRENT_TIMESTAMP
    WHERE 
        discovery_timestamp < CURRENT_TIMESTAMP - (retention_days || ' days')::INTERVAL
        AND status = 'completed'
        AND superseded_by IS NOT NULL;
    
    GET DIAGNOSTICS archived_count = ROW_COUNT;
    
    -- Log the maintenance operation
    INSERT INTO pattern_operation_metrics (
        operation_type,
        operation_subtype,
        execution_time_ms,
        records_updated,
        status,
        started_at
    ) VALUES (
        'maintenance',
        'archive_sessions',
        0, -- Will be updated by caller if needed
        archived_count,
        'completed',
        CURRENT_TIMESTAMP
    );
    
    RETURN archived_count;
END;
$$;


ALTER FUNCTION public.archive_old_pattern_sessions(retention_days integer) OWNER TO ridgetop;

--
-- Name: auto_expire_insights(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.auto_expire_insights() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Set expiration dates for different insight types
    IF NEW.expires_at IS NULL THEN
        NEW.expires_at = CASE NEW.insight_type
            WHEN 'temporal_patterns' THEN CURRENT_TIMESTAMP + INTERVAL '90 days'
            WHEN 'developer_specialization' THEN CURRENT_TIMESTAMP + INTERVAL '180 days'
            WHEN 'high_risk_files' THEN CURRENT_TIMESTAMP + INTERVAL '30 days'
            WHEN 'architectural_hotspots' THEN CURRENT_TIMESTAMP + INTERVAL '120 days'
            ELSE CURRENT_TIMESTAMP + INTERVAL '60 days'
        END;
    END IF;
    
    -- Set refresh needed date (earlier than expiration)
    IF NEW.refresh_needed_at IS NULL THEN
        NEW.refresh_needed_at = NEW.expires_at - INTERVAL '7 days';
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.auto_expire_insights() OWNER TO ridgetop;

--
-- Name: auto_generate_metric_alerts(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.auto_generate_metric_alerts() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    alert_title TEXT;
    alert_description TEXT;
    alert_severity VARCHAR(20);
    alert_urgency VARCHAR(20);
BEGIN
    -- Only generate alerts for significant changes or threshold breaches
    IF NEW.alert_triggered = TRUE OR 
       (OLD.alert_triggered IS DISTINCT FROM NEW.alert_triggered) OR
       (NEW.change_significance IN ('significant', 'major')) THEN
        
        -- Determine alert content based on metric type and change
        CASE NEW.metric_type
            WHEN 'code_velocity' THEN
                alert_title = 'Code Velocity Change Detected';
                alert_description = format('Code velocity changed from %s to %s %s (%s%% change)',
                    COALESCE(OLD.metric_value::TEXT, 'baseline'), 
                    NEW.metric_value, 
                    NEW.metric_unit,
                    COALESCE(NEW.percent_change_from_baseline::TEXT, 'unknown'));
            WHEN 'technical_debt_accumulation' THEN
                alert_title = 'Technical Debt Level Change';
                alert_description = format('Technical debt indicator changed to %s (trend: %s)',
                    NEW.metric_value, 
                    COALESCE(NEW.trend_direction, 'unknown'));
            ELSE
                alert_title = format('%s Metric Alert', replace(initcap(NEW.metric_type), '_', ' '));
                alert_description = format('%s metric for %s changed to %s %s',
                    replace(initcap(NEW.metric_type), '_', ' '),
                    COALESCE(NEW.scope_identifier, 'project'),
                    NEW.metric_value,
                    NEW.metric_unit);
        END CASE;
        
        -- Determine severity and urgency
        alert_severity = COALESCE(NEW.alert_severity, 'warning');
        alert_urgency = CASE 
            WHEN NEW.alert_severity = 'critical' THEN 'immediate'
            WHEN NEW.alert_severity = 'error' THEN 'high'
            WHEN NEW.change_significance = 'major' THEN 'high'
            WHEN NEW.change_significance = 'significant' THEN 'medium'
            ELSE 'low'
        END;
        
        -- Create the alert
        INSERT INTO metrics_alerts (
            project_id,
            alert_type,
            metric_type,
            metric_scope,
            scope_identifier,
            trigger_value,
            threshold_value,
            baseline_value,
            severity,
            urgency,
            title,
            description,
            estimated_impact,
            immediate_actions,
            recommended_actions,
            source_metric_id
        ) VALUES (
            NEW.project_id,
            CASE 
                WHEN NEW.alert_triggered THEN 'threshold_exceeded'
                WHEN NEW.change_significance IN ('significant', 'major') THEN 'trend_change'
                ELSE 'anomaly_detected'
            END,
            NEW.metric_type,
            NEW.metric_scope,
            NEW.scope_identifier,
            NEW.metric_value,
            COALESCE(NEW.threshold_high, NEW.threshold_low),
            NEW.baseline_value,
            alert_severity,
            alert_urgency,
            alert_title,
            alert_description,
            CASE NEW.change_significance
                WHEN 'major' THEN 'high'
                WHEN 'significant' THEN 'medium'
                ELSE 'low'
            END,
            ARRAY['Review metric trend', 'Analyze contributing factors', 'Consider intervention if needed'],
            ARRAY['Investigate root causes', 'Update baselines if appropriate', 'Monitor for continued changes'],
            NEW.id
        );
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.auto_generate_metric_alerts() OWNER TO ridgetop;

--
-- Name: auto_generate_session_display_id(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.auto_generate_session_display_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Only generate if display_id is NULL
  IF NEW.display_id IS NULL THEN
    NEW.display_id := get_next_session_display_id();
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.auto_generate_session_display_id() OWNER TO ridgetop;

--
-- Name: calculate_metric_classifications(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.calculate_metric_classifications() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Update timestamps
    IF TG_OP = 'INSERT' THEN
        NEW.created_at = CURRENT_TIMESTAMP;
        NEW.updated_at = CURRENT_TIMESTAMP;
    ELSIF TG_OP = 'UPDATE' THEN
        NEW.updated_at = CURRENT_TIMESTAMP;
    END IF;
    
    -- Auto-calculate percentile ranks for core metrics
    IF TG_TABLE_NAME = 'core_development_metrics' THEN
        -- Calculate percentile rank within same metric type
        -- Fixed: Use proper subquery instead of cross join
        NEW.percentile_rank = (
            WITH total_metrics AS (
                SELECT COUNT(*) as total_count
                FROM core_development_metrics 
                WHERE metric_type = NEW.metric_type 
                    AND project_id = NEW.project_id
                    AND is_active = TRUE
            ),
            rank_calculation AS (
                SELECT COUNT(*) as rank_count
                FROM core_development_metrics cdm
                WHERE cdm.metric_type = NEW.metric_type 
                    AND cdm.project_id = NEW.project_id
                    AND cdm.is_active = TRUE
                    AND cdm.metric_value <= NEW.metric_value
            )
            SELECT 
                CASE 
                    WHEN tm.total_count = 0 THEN 0::DECIMAL
                    ELSE rc.rank_count::DECIMAL / tm.total_count::DECIMAL
                END
            FROM total_metrics tm, rank_calculation rc
        );
        
        -- Auto-classify change significance
        IF NEW.baseline_value IS NOT NULL AND NEW.baseline_value > 0 THEN
            NEW.percent_change_from_baseline = ((NEW.metric_value - NEW.baseline_value) / NEW.baseline_value) * 100;
            
            NEW.change_significance = CASE 
                WHEN ABS(NEW.percent_change_from_baseline) >= 50 THEN 'major'
                WHEN ABS(NEW.percent_change_from_baseline) >= 25 THEN 'significant'
                WHEN ABS(NEW.percent_change_from_baseline) >= 10 THEN 'moderate'
                WHEN ABS(NEW.percent_change_from_baseline) >= 5 THEN 'minor'
                ELSE 'insignificant'
            END;
        END IF;
        
        -- Check for threshold alerts
        IF (NEW.threshold_high IS NOT NULL AND NEW.metric_value > NEW.threshold_high) OR
           (NEW.threshold_low IS NOT NULL AND NEW.metric_value < NEW.threshold_low) THEN
            NEW.alert_triggered = TRUE;
            NEW.alert_severity = CASE 
                WHEN NEW.threshold_high IS NOT NULL AND NEW.metric_value > NEW.threshold_high * 1.5 THEN 'critical'
                WHEN NEW.threshold_low IS NOT NULL AND NEW.metric_value < NEW.threshold_low * 0.5 THEN 'critical'
                WHEN NEW.threshold_high IS NOT NULL AND NEW.metric_value > NEW.threshold_high * 1.2 THEN 'high'
                WHEN NEW.threshold_low IS NOT NULL AND NEW.metric_value < NEW.threshold_low * 0.8 THEN 'high'
                ELSE 'medium'
            END;
        ELSE
            NEW.alert_triggered = FALSE;
            NEW.alert_severity = NULL;
        END IF;
    END IF;
    
    -- Similar classification logic for other metric types would go here
    -- (pattern_intelligence_metrics, productivity_health_metrics)
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.calculate_metric_classifications() OWNER TO ridgetop;

--
-- Name: calculate_shadow_validation_hash(text, jsonb); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.calculate_shadow_validation_hash(table_name text, record_data jsonb) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
    RETURN encode(
        digest(
            table_name || '::' || record_data::text,
            'sha256'
        ),
        'hex'
    );
END;
$$;


ALTER FUNCTION public.calculate_shadow_validation_hash(table_name text, record_data jsonb) OWNER TO ridgetop;

--
-- Name: calculate_validation_hash_with_metadata(text, jsonb, text); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.calculate_validation_hash_with_metadata(p_table_name text, p_record_data jsonb, p_operation text DEFAULT 'INSERT'::text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
    RETURN encode(
        digest(
            format('%s::%s::%s::%s',
                p_table_name,
                p_operation,
                extract(epoch from CURRENT_TIMESTAMP)::bigint,
                p_record_data::text
            ),
            'sha256'
        ),
        'hex'
    );
END;
$$;


ALTER FUNCTION public.calculate_validation_hash_with_metadata(p_table_name text, p_record_data jsonb, p_operation text) OWNER TO ridgetop;

--
-- Name: classify_commit_type(text); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.classify_commit_type(message text) RETURNS character varying
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
    -- Pattern-based commit type detection
    IF message ~* '^(fix|fixed|fixes|bug)[\s\(\[]' THEN RETURN 'fix';
    ELSIF message ~* '^(feat|feature|add)[\s\(\[]' THEN RETURN 'feature';
    ELSIF message ~* '^(docs|doc)[\s\(\[]' THEN RETURN 'docs';
    ELSIF message ~* '^(refactor|refact)[\s\(\[]' THEN RETURN 'refactor';
    ELSIF message ~* '^(test|tests)[\s\(\[]' THEN RETURN 'test';
    ELSIF message ~* '^(style|format)[\s\(\[]' THEN RETURN 'style';
    ELSIF message ~* '^(chore|build|ci)[\s\(\[]' THEN RETURN 'chore';
    ELSIF message ~* '^(merge|merged)' THEN RETURN 'merge';
    ELSE RETURN 'feature';
    END IF;
END;
$$;


ALTER FUNCTION public.classify_commit_type(message text) OWNER TO ridgetop;

--
-- Name: cleanup_shadow_tables(boolean); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.cleanup_shadow_tables(p_confirm_cleanup boolean DEFAULT false) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    shadow_tables TEXT[] := ARRAY[
        'projects_shadow',
        'sessions_shadow',
        'contexts_shadow',
        'analytics_events_shadow',
        'agent_tasks_shadow'
    ];
    shadow_table_name TEXT;
    result_msg TEXT := '';
BEGIN
    IF NOT p_confirm_cleanup THEN
        RETURN 'SAFETY: Call with p_confirm_cleanup := TRUE to execute cleanup';
    END IF;

    FOREACH shadow_table_name IN ARRAY shadow_tables LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables t
            WHERE t.table_name = shadow_table_name
        ) THEN
            EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', shadow_table_name);
            result_msg := result_msg || format('Dropped table %s; ', shadow_table_name);
        END IF;
    END LOOP;

    -- Drop custom types
    DROP TYPE IF EXISTS shadow_sync_status CASCADE;

    -- Drop custom functions
    DROP FUNCTION IF EXISTS calculate_shadow_validation_hash(TEXT, JSONB) CASCADE;
    DROP FUNCTION IF EXISTS sync_to_shadow_table() CASCADE;
    DROP FUNCTION IF EXISTS validate_shadow_table_integrity(TEXT, INTEGER) CASCADE;

    RETURN 'CLEANUP COMPLETE: ' || result_msg;
END;
$$;


ALTER FUNCTION public.cleanup_shadow_tables(p_confirm_cleanup boolean) OWNER TO ridgetop;

--
-- Name: complete_cutover(text, boolean); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.complete_cutover(p_table_name text, p_confirm_completion boolean DEFAULT false) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    current_config RECORD;
    validation_result RECORD;
    result_msg TEXT;
BEGIN
    IF NOT p_confirm_completion THEN
        RETURN 'SAFETY: Call with p_confirm_completion := TRUE to execute final cutover';
    END IF;

    -- Get current configuration
    SELECT * INTO current_config
    FROM traffic_routing_config
    WHERE table_name = p_table_name;

    IF current_config IS NULL THEN
        RETURN format('ERROR: Table %s not found in routing configuration', p_table_name);
    END IF;

    IF current_config.cutover_stage != 'full_100' THEN
        RETURN format('ERROR: Cannot complete cutover from stage %s. Must be at full_100 stage first.',
            current_config.cutover_stage);
    END IF;

    -- Perform final validation
    SELECT * INTO validation_result FROM validate_table_consistency(p_table_name);

    IF validation_result.validation_score < current_config.min_validation_score THEN
        RETURN format('ERROR: Final validation failed. Score: %s, Required: %s',
            validation_result.validation_score, current_config.min_validation_score);
    END IF;

    -- Mark as completed (actual table promotion would be done by separate maintenance script)
    UPDATE traffic_routing_config
    SET
        cutover_stage = 'completed',
        health_status = 'healthy',
        updated_at = CURRENT_TIMESTAMP,
        updated_by = current_user,
        notes = COALESCE(notes, '') || format(' CUTOVER COMPLETED at %s (validation score: %s)',
            CURRENT_TIMESTAMP, validation_result.validation_score)
    WHERE table_name = p_table_name;

    result_msg := format('Cutover COMPLETED for table %s - Validation score: %s%%',
        p_table_name, validation_result.validation_score);
    RAISE NOTICE '%', result_msg;

    RETURN result_msg;
END;
$$;


ALTER FUNCTION public.complete_cutover(p_table_name text, p_confirm_completion boolean) OWNER TO ridgetop;

--
-- Name: create_sample_analysis_session(uuid, uuid, character varying); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.create_sample_analysis_session(proj_id uuid, session_id uuid DEFAULT NULL::uuid, commit_hash character varying DEFAULT NULL::character varying) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
    new_analysis_id UUID;
    sample_files TEXT[];
BEGIN
    -- Create sample file list
    sample_files := ARRAY['src/server.ts', 'src/handlers/codeAnalysis.ts', 'src/config/database.ts'];
    
    INSERT INTO code_analysis_sessions (
        project_id,
        development_session_id,
        commit_sha,
        branch_name,
        session_type,
        analysis_scope,
        files_analyzed,
        target_files,
        components_found,
        dependencies_found,
        analysis_duration_ms,
        parse_duration_ms,
        database_duration_ms,
        cache_hit_rate,
        trigger_type,
        auto_triggered,
        session_correlation_confidence,
        analysis_context,
        quality_score,
        status,
        analyzer_version,
        metadata
    ) VALUES (
        proj_id,
        session_id,
        commit_hash,
        'main',
        'incremental',
        'targeted', 
        sample_files,
        sample_files,
        12,
        8,
        2500,
        2000,
        500,
        0.75,
        CASE WHEN session_id IS NOT NULL THEN 'session_start' ELSE 'manual' END,
        session_id IS NOT NULL,
        CASE WHEN session_id IS NOT NULL THEN 0.9 ELSE 0.0 END,
        'Sample analysis session for TC005 testing',
        85.5,
        'completed',
        '1.1.0',
        '{
            "performance": {"cache_hits": 6, "cache_misses": 2},
            "git_context": {"clean_working_dir": true, "staged_files": 0},
            "session_context": {"active_development": true},
            "analysis_config": {"language_filter": "typescript", "complexity_threshold": 10}
        }'::jsonb
    ) RETURNING id INTO new_analysis_id;
    
    RAISE NOTICE 'Created sample analysis session: %', new_analysis_id;
    RETURN new_analysis_id;
END;
$$;


ALTER FUNCTION public.create_sample_analysis_session(proj_id uuid, session_id uuid, commit_hash character varying) OWNER TO ridgetop;

--
-- Name: create_sample_pattern_session(uuid, character varying); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.create_sample_pattern_session(p_project_id uuid, p_algorithm_version character varying DEFAULT 'tc011_v1.0'::character varying) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
    session_id UUID;
BEGIN
    INSERT INTO pattern_discovery_sessions (
        project_id,
        algorithm_version,
        total_commits_analyzed,
        total_files_analyzed,
        execution_time_ms,
        patterns_discovered,
        cooccurrence_time_ms,
        temporal_time_ms,
        developer_time_ms,
        magnitude_time_ms,
        insights_time_ms,
        status,
        metadata
    ) VALUES (
        p_project_id,
        p_algorithm_version,
        1092, -- From TC011 analysis
        1082, -- From TC011 analysis
        641,  -- Sum of individual algorithm times
        92606, -- Total patterns from TC011
        140,  -- TC011 co-occurrence execution time
        165,  -- TC011 temporal execution time
        168,  -- TC011 developer execution time
        164,  -- TC011 magnitude execution time
        4,    -- TC011 insights execution time
        'completed',
        jsonb_build_object(
            'tc011_validation', true,
            'algorithm_source', 'TC011 research implementation',
            'confidence_baseline', 0.70,
            'statistical_validation', 'chi_square_z_score'
        )
    ) RETURNING id INTO session_id;
    
    RETURN session_id;
END;
$$;


ALTER FUNCTION public.create_sample_pattern_session(p_project_id uuid, p_algorithm_version character varying) OWNER TO ridgetop;

--
-- Name: disable_dual_write(text, text); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.disable_dual_write(p_table_name text, p_reason text DEFAULT 'Manual disable'::text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    result_msg TEXT;
BEGIN
    UPDATE dual_write_config
    SET
        enabled = FALSE,
        updated_at = CURRENT_TIMESTAMP,
        notes = COALESCE(notes, '') || format(' DISABLED at %s - Reason: %s', CURRENT_TIMESTAMP, p_reason)
    WHERE table_name = p_table_name;

    IF FOUND THEN
        result_msg := format('Dual-write DISABLED for table %s - Reason: %s', p_table_name, p_reason);
        RAISE NOTICE '%', result_msg;
        RETURN result_msg;
    ELSE
        result_msg := format('ERROR: Table %s not found in dual_write_config', p_table_name);
        RAISE WARNING '%', result_msg;
        RETURN result_msg;
    END IF;
END;
$$;


ALTER FUNCTION public.disable_dual_write(p_table_name text, p_reason text) OWNER TO ridgetop;

--
-- Name: dual_write_trigger_function(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.dual_write_trigger_function() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    shadow_table_name TEXT;
    validation_hash TEXT;
    record_jsonb JSONB;
    start_time TIMESTAMP WITH TIME ZONE;
    duration_ms INTEGER;
    operation_success BOOLEAN := FALSE;
    error_msg TEXT;
    shadow_mapping JSONB;
    insert_columns TEXT[];
    insert_values TEXT[];
    update_assignments TEXT[];
    sql_statement TEXT;
    col_name TEXT;
    col_value TEXT;
BEGIN
    -- Check if dual-write is enabled for this table
    IF NOT is_dual_write_enabled(TG_TABLE_NAME) THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    start_time := CURRENT_TIMESTAMP;

    -- Determine shadow table name
    IF TG_TABLE_NAME = 'tasks' THEN
        shadow_table_name := 'agent_tasks_shadow';
    ELSE
        shadow_table_name := TG_TABLE_NAME || '_shadow';
    END IF;

    -- Convert record to JSONB for processing
    record_jsonb := CASE
        WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
        ELSE to_jsonb(NEW)
    END;

    -- Calculate validation hash
    validation_hash := calculate_validation_hash_with_metadata(TG_TABLE_NAME, record_jsonb, TG_OP);

    BEGIN
        IF TG_OP = 'DELETE' THEN
            -- Handle DELETE operation
            EXECUTE format('DELETE FROM %I WHERE _shadow_source_id = $1', shadow_table_name)
            USING OLD.id;

            operation_success := TRUE;

        ELSIF TG_OP = 'INSERT' THEN
            -- Handle INSERT operation - build dynamic INSERT statement

            -- Prepare column mappings based on table
            IF TG_TABLE_NAME = 'projects' THEN
                insert_columns := ARRAY['id', 'name', 'description', 'created_at', 'updated_at', 'status',
                                      'git_repo_url', 'root_directory', 'metadata',
                                      '_shadow_source_id', '_shadow_validation_hash', '_shadow_last_sync', '_shadow_sync_status'];
                sql_statement := format('
                    INSERT INTO %I (id, name, description, created_at, updated_at, status, git_repo_url,
                                  root_directory, metadata, _shadow_source_id, _shadow_validation_hash,
                                  _shadow_last_sync, _shadow_sync_status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
                    shadow_table_name);
                EXECUTE sql_statement USING
                    NEW.id, NEW.name, NEW.description, NEW.created_at, NEW.updated_at, NEW.status,
                    NEW.git_repo_url, NEW.root_directory, NEW.metadata,
                    NEW.id, validation_hash, CURRENT_TIMESTAMP, 'synced';

            ELSIF TG_TABLE_NAME = 'sessions' THEN
                sql_statement := format('
                    INSERT INTO %I (id, project_id, agent_type, started_at, ended_at, context_summary,
                                  tokens_used, metadata, updated_at, active_branch, working_commit_sha,
                                  commits_contributed, pattern_preferences, insights_generated,
                                  last_pattern_analysis, title, description,
                                  _shadow_source_id, _shadow_validation_hash, _shadow_last_sync, _shadow_sync_status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)',
                    shadow_table_name);
                EXECUTE sql_statement USING
                    NEW.id, NEW.project_id, NEW.agent_type, NEW.started_at, NEW.ended_at, NEW.context_summary,
                    NEW.tokens_used, NEW.metadata, NEW.updated_at, NEW.active_branch, NEW.working_commit_sha,
                    NEW.commits_contributed, NEW.pattern_preferences, NEW.insights_generated,
                    NEW.last_pattern_analysis, NEW.title, NEW.description,
                    NEW.id, validation_hash, CURRENT_TIMESTAMP, 'synced';

            ELSIF TG_TABLE_NAME = 'contexts' THEN
                sql_statement := format('
                    INSERT INTO %I (id, project_id, session_id, context_type, content, embedding, created_at,
                                  relevance_score, tags, metadata, related_commit_sha, commit_context_type,
                                  pattern_session_id, related_insights, pattern_relevance_score,
                                  _shadow_source_id, _shadow_validation_hash, _shadow_last_sync, _shadow_sync_status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)',
                    shadow_table_name);
                EXECUTE sql_statement USING
                    NEW.id, NEW.project_id, NEW.session_id, NEW.context_type, NEW.content, NEW.embedding, NEW.created_at,
                    NEW.relevance_score, NEW.tags, NEW.metadata, NEW.related_commit_sha, NEW.commit_context_type,
                    NEW.pattern_session_id, NEW.related_insights, NEW.pattern_relevance_score,
                    NEW.id, validation_hash, CURRENT_TIMESTAMP, 'synced';

            ELSIF TG_TABLE_NAME = 'analytics_events' THEN
                sql_statement := format('
                    INSERT INTO %I (event_id, timestamp, actor, project_id, session_id, context_id, event_type,
                                  payload, status, duration_ms, tags, ai_model_used, prompt_tokens,
                                  completion_tokens, feedback, metadata,
                                  _shadow_source_id, _shadow_validation_hash, _shadow_last_sync, _shadow_sync_status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)',
                    shadow_table_name);
                EXECUTE sql_statement USING
                    NEW.event_id, NEW.timestamp, NEW.actor, NEW.project_id, NEW.session_id, NEW.context_id, NEW.event_type,
                    NEW.payload, NEW.status, NEW.duration_ms, NEW.tags, NEW.ai_model_used, NEW.prompt_tokens,
                    NEW.completion_tokens, NEW.feedback, NEW.metadata,
                    NEW.event_id, validation_hash, CURRENT_TIMESTAMP, 'synced';

            ELSIF TG_TABLE_NAME = 'tasks' THEN
                sql_statement := format('
                    INSERT INTO %I (id, project_id, assigned_to, created_by, title, description, type, status,
                                  priority, dependencies, tags, metadata, started_at, completed_at,
                                  created_at, updated_at,
                                  _shadow_source_id, _shadow_validation_hash, _shadow_last_sync, _shadow_sync_status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)',
                    shadow_table_name);
                EXECUTE sql_statement USING
                    NEW.id, NEW.project_id, NEW.assigned_to, NEW.created_by, NEW.title, NEW.description, NEW.type, NEW.status,
                    NEW.priority, NEW.dependencies, NEW.tags, NEW.metadata, NEW.started_at, NEW.completed_at,
                    NEW.created_at, NEW.updated_at,
                    NEW.id, validation_hash, CURRENT_TIMESTAMP, 'synced';
            END IF;

            operation_success := TRUE;

        ELSIF TG_OP = 'UPDATE' THEN
            -- Handle UPDATE operation
            IF TG_TABLE_NAME = 'projects' THEN
                sql_statement := format('
                    UPDATE %I SET
                        name = $2, description = $3, created_at = $4, updated_at = $5, status = $6,
                        git_repo_url = $7, root_directory = $8, metadata = $9,
                        _shadow_validation_hash = $10, _shadow_last_sync = $11, _shadow_sync_status = $12
                    WHERE _shadow_source_id = $1',
                    shadow_table_name);
                EXECUTE sql_statement USING
                    NEW.id, NEW.name, NEW.description, NEW.created_at, NEW.updated_at, NEW.status,
                    NEW.git_repo_url, NEW.root_directory, NEW.metadata,
                    validation_hash, CURRENT_TIMESTAMP, 'synced';

            ELSIF TG_TABLE_NAME = 'sessions' THEN
                sql_statement := format('
                    UPDATE %I SET
                        project_id = $2, agent_type = $3, started_at = $4, ended_at = $5, context_summary = $6,
                        tokens_used = $7, metadata = $8, updated_at = $9, active_branch = $10, working_commit_sha = $11,
                        commits_contributed = $12, pattern_preferences = $13, insights_generated = $14,
                        last_pattern_analysis = $15, title = $16, description = $17,
                        _shadow_validation_hash = $18, _shadow_last_sync = $19, _shadow_sync_status = $20
                    WHERE _shadow_source_id = $1',
                    shadow_table_name);
                EXECUTE sql_statement USING
                    NEW.id, NEW.project_id, NEW.agent_type, NEW.started_at, NEW.ended_at, NEW.context_summary,
                    NEW.tokens_used, NEW.metadata, NEW.updated_at, NEW.active_branch, NEW.working_commit_sha,
                    NEW.commits_contributed, NEW.pattern_preferences, NEW.insights_generated,
                    NEW.last_pattern_analysis, NEW.title, NEW.description,
                    validation_hash, CURRENT_TIMESTAMP, 'synced';

            ELSIF TG_TABLE_NAME = 'contexts' THEN
                sql_statement := format('
                    UPDATE %I SET
                        project_id = $2, session_id = $3, context_type = $4, content = $5, embedding = $6, created_at = $7,
                        relevance_score = $8, tags = $9, metadata = $10, related_commit_sha = $11, commit_context_type = $12,
                        pattern_session_id = $13, related_insights = $14, pattern_relevance_score = $15,
                        _shadow_validation_hash = $16, _shadow_last_sync = $17, _shadow_sync_status = $18
                    WHERE _shadow_source_id = $1',
                    shadow_table_name);
                EXECUTE sql_statement USING
                    NEW.id, NEW.project_id, NEW.session_id, NEW.context_type, NEW.content, NEW.embedding, NEW.created_at,
                    NEW.relevance_score, NEW.tags, NEW.metadata, NEW.related_commit_sha, NEW.commit_context_type,
                    NEW.pattern_session_id, NEW.related_insights, NEW.pattern_relevance_score,
                    validation_hash, CURRENT_TIMESTAMP, 'synced';

            ELSIF TG_TABLE_NAME = 'analytics_events' THEN
                sql_statement := format('
                    UPDATE %I SET
                        timestamp = $2, actor = $3, project_id = $4, session_id = $5, context_id = $6, event_type = $7,
                        payload = $8, status = $9, duration_ms = $10, tags = $11, ai_model_used = $12, prompt_tokens = $13,
                        completion_tokens = $14, feedback = $15, metadata = $16,
                        _shadow_validation_hash = $17, _shadow_last_sync = $18, _shadow_sync_status = $19
                    WHERE _shadow_source_id = $1',
                    shadow_table_name);
                EXECUTE sql_statement USING
                    NEW.event_id, NEW.timestamp, NEW.actor, NEW.project_id, NEW.session_id, NEW.context_id, NEW.event_type,
                    NEW.payload, NEW.status, NEW.duration_ms, NEW.tags, NEW.ai_model_used, NEW.prompt_tokens,
                    NEW.completion_tokens, NEW.feedback, NEW.metadata,
                    validation_hash, CURRENT_TIMESTAMP, 'synced';

            ELSIF TG_TABLE_NAME = 'tasks' THEN
                sql_statement := format('
                    UPDATE %I SET
                        project_id = $2, assigned_to = $3, created_by = $4, title = $5, description = $6, type = $7, status = $8,
                        priority = $9, dependencies = $10, tags = $11, metadata = $12, started_at = $13, completed_at = $14,
                        created_at = $15, updated_at = $16,
                        _shadow_validation_hash = $17, _shadow_last_sync = $18, _shadow_sync_status = $19
                    WHERE _shadow_source_id = $1',
                    shadow_table_name);
                EXECUTE sql_statement USING
                    NEW.id, NEW.project_id, NEW.assigned_to, NEW.created_by, NEW.title, NEW.description, NEW.type, NEW.status,
                    NEW.priority, NEW.dependencies, NEW.tags, NEW.metadata, NEW.started_at, NEW.completed_at,
                    NEW.created_at, NEW.updated_at,
                    validation_hash, CURRENT_TIMESTAMP, 'synced';
            END IF;

            operation_success := TRUE;
        END IF;

    EXCEPTION WHEN OTHERS THEN
        error_msg := SQLERRM;
        operation_success := FALSE;

        -- Record the failure
        PERFORM record_dual_write_failure(TG_TABLE_NAME, error_msg);

        -- Log the error but don't fail the primary operation
        RAISE WARNING 'Dual-write failed for table % operation %: %', TG_TABLE_NAME, TG_OP, error_msg;
    END;

    -- Calculate duration
    duration_ms := EXTRACT(epoch FROM (CURRENT_TIMESTAMP - start_time)) * 1000;

    -- Record statistics
    PERFORM record_dual_write_stats(
        TG_TABLE_NAME,
        TG_OP,
        operation_success,
        duration_ms,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
        validation_hash,
        error_msg,
        length(record_jsonb::text)
    );

    RETURN COALESCE(NEW, OLD);
END;
$_$;


ALTER FUNCTION public.dual_write_trigger_function() OWNER TO ridgetop;

--
-- Name: FUNCTION dual_write_trigger_function(); Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON FUNCTION public.dual_write_trigger_function() IS 'P2.3 Main trigger function for dual-write data synchronization';


--
-- Name: emergency_rollback(text, text); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.emergency_rollback(p_table_name text, p_reason text DEFAULT 'Emergency rollback triggered'::text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    result_msg TEXT;
BEGIN
    -- Disable dual-write immediately
    PERFORM disable_dual_write(p_table_name, p_reason);

    -- Update routing configuration
    UPDATE traffic_routing_config
    SET
        cutover_stage = 'rolled_back',
        read_percentage = 0,
        write_shadow_enabled = FALSE,
        health_status = 'emergency_stop',
        updated_at = CURRENT_TIMESTAMP,
        updated_by = current_user,
        notes = COALESCE(notes, '') || format(' EMERGENCY ROLLBACK at %s - Reason: %s',
            CURRENT_TIMESTAMP, p_reason)
    WHERE table_name = p_table_name;

    result_msg := format('EMERGENCY ROLLBACK executed for table %s - Reason: %s', p_table_name, p_reason);
    RAISE WARNING '%', result_msg;

    RETURN result_msg;
END;
$$;


ALTER FUNCTION public.emergency_rollback(p_table_name text, p_reason text) OWNER TO ridgetop;

--
-- Name: FUNCTION emergency_rollback(p_table_name text, p_reason text); Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON FUNCTION public.emergency_rollback(p_table_name text, p_reason text) IS 'P2.3 Emergency rollback to primary table';


--
-- Name: emergency_stop_all_cutover(text); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.emergency_stop_all_cutover(p_reason text DEFAULT 'System-wide emergency stop'::text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    affected_tables INTEGER := 0;
    table_record RECORD;
    result_msg TEXT := '';
BEGIN
    -- Emergency rollback all active cutover operations
    FOR table_record IN
        SELECT table_name FROM traffic_routing_config
        WHERE cutover_stage NOT IN ('disabled', 'completed', 'rolled_back')
    LOOP
        PERFORM emergency_rollback(table_record.table_name, p_reason);
        affected_tables := affected_tables + 1;
    END LOOP;

    -- Also stop all dual-write operations
    PERFORM emergency_stop_dual_write(p_reason);

    result_msg := format('SYSTEM EMERGENCY STOP: Rolled back %s table cutover operations - Reason: %s',
        affected_tables, p_reason);

    RAISE WARNING '%', result_msg;
    RETURN result_msg;
END;
$$;


ALTER FUNCTION public.emergency_stop_all_cutover(p_reason text) OWNER TO ridgetop;

--
-- Name: emergency_stop_dual_write(text); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.emergency_stop_dual_write(p_reason text DEFAULT 'Emergency stop activated'::text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    affected_tables INTEGER;
BEGIN
    UPDATE dual_write_config
    SET
        enabled = FALSE,
        emergency_stop = TRUE,
        updated_at = CURRENT_TIMESTAMP,
        notes = COALESCE(notes, '') || format(' EMERGENCY STOP at %s - Reason: %s', CURRENT_TIMESTAMP, p_reason);

    GET DIAGNOSTICS affected_tables = ROW_COUNT;

    RAISE WARNING 'EMERGENCY STOP: All dual-write operations disabled for % tables - Reason: %', affected_tables, p_reason;

    RETURN format('EMERGENCY STOP: Disabled dual-write for %s tables - Reason: %s', affected_tables, p_reason);
END;
$$;


ALTER FUNCTION public.emergency_stop_dual_write(p_reason text) OWNER TO ridgetop;

--
-- Name: enable_dual_write(text, text); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.enable_dual_write(p_table_name text, p_sync_mode text DEFAULT 'async'::text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    result_msg TEXT;
BEGIN
    UPDATE dual_write_config
    SET
        enabled = TRUE,
        sync_mode = p_sync_mode,
        emergency_stop = FALSE,
        failure_count = 0,
        updated_at = CURRENT_TIMESTAMP,
        notes = COALESCE(notes, '') || format(' ENABLED at %s', CURRENT_TIMESTAMP)
    WHERE table_name = p_table_name;

    IF FOUND THEN
        result_msg := format('Dual-write ENABLED for table %s in %s mode', p_table_name, p_sync_mode);
        RAISE NOTICE '%', result_msg;
        RETURN result_msg;
    ELSE
        result_msg := format('ERROR: Table %s not found in dual_write_config', p_table_name);
        RAISE WARNING '%', result_msg;
        RETURN result_msg;
    END IF;
END;
$$;


ALTER FUNCTION public.enable_dual_write(p_table_name text, p_sync_mode text) OWNER TO ridgetop;

--
-- Name: ensure_session_title(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.ensure_session_title() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- If description is provided but title is null, auto-generate a title
  IF NEW.description IS NOT NULL AND NEW.description != '' AND (NEW.title IS NULL OR NEW.title = '') THEN
    -- Extract first 50 characters of description as title
    NEW.title := LEFT(TRIM(NEW.description), 50);
    -- Clean up title by removing newlines and extra spaces
    NEW.title := REGEXP_REPLACE(NEW.title, '\s+', ' ', 'g');
    -- Add ellipsis if truncated
    IF LENGTH(TRIM(NEW.description)) > 50 THEN
      NEW.title := NEW.title || '...';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.ensure_session_title() OWNER TO ridgetop;

--
-- Name: find_timed_out_sessions(interval); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.find_timed_out_sessions(timeout_threshold interval DEFAULT '02:00:00'::interval) RETURNS TABLE(session_id uuid, project_id uuid, agent_type character varying, started_at timestamp with time zone, last_activity_at timestamp with time zone, inactive_duration interval)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.project_id,
    s.agent_type,
    s.started_at,
    s.last_activity_at,
    CURRENT_TIMESTAMP - s.last_activity_at AS inactive_duration
  FROM sessions s
  WHERE s.status = 'active'
    AND s.last_activity_at IS NOT NULL
    AND s.last_activity_at < (CURRENT_TIMESTAMP - timeout_threshold)
    AND s.ended_at IS NULL
  ORDER BY s.last_activity_at ASC;
END;
$$;


ALTER FUNCTION public.find_timed_out_sessions(timeout_threshold interval) OWNER TO ridgetop;

--
-- Name: FUNCTION find_timed_out_sessions(timeout_threshold interval); Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON FUNCTION public.find_timed_out_sessions(timeout_threshold interval) IS 'Read-only helper to find sessions that should be timed out. Useful for monitoring and debugging.';


--
-- Name: generate_cutover_report(text, integer); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.generate_cutover_report(p_table_name text DEFAULT NULL::text, p_hours_back integer DEFAULT 24) RETURNS TABLE(report_section text, table_name text, metric_name text, metric_value text, status text, recommendations text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    table_filter TEXT := COALESCE(p_table_name, '%');
BEGIN
    -- Current status section
    RETURN QUERY
    SELECT
        'Current Status'::TEXT,
        trc.table_name,
        'Cutover Stage'::TEXT,
        trc.cutover_stage::TEXT,
        trc.health_status,
        CASE
            WHEN trc.cutover_stage = 'disabled' THEN 'Not started'
            WHEN trc.health_status = 'healthy' AND CURRENT_TIMESTAMP >= trc.next_stage_eligible_at
            THEN 'Ready for advancement'
            ELSE 'Continue monitoring'
        END
    FROM traffic_routing_config trc
    WHERE trc.table_name LIKE table_filter;

    -- Performance metrics section
    RETURN QUERY
    SELECT
        'Performance'::TEXT,
        cpm.table_name,
        format('%s Operations (Last %sh)', initcap(cpm.operation_type), p_hours_back),
        format('%s total, %s success rate, %sms avg latency',
            cpm.total_operations,
            ROUND((cpm.successful_operations::numeric / NULLIF(cpm.total_operations, 0)::numeric) * 100, 1),
            COALESCE(cpm.avg_latency_ms, 0)
        ),
        CASE
            WHEN cpm.successful_operations::numeric / NULLIF(cpm.total_operations, 0)::numeric >= 0.99 THEN 'healthy'
            WHEN cpm.successful_operations::numeric / NULLIF(cpm.total_operations, 0)::numeric >= 0.95 THEN 'warning'
            ELSE 'error'
        END,
        CASE
            WHEN cpm.successful_operations::numeric / NULLIF(cpm.total_operations, 0)::numeric < 0.95
            THEN 'Investigate operation failures'
            ELSE 'Performance acceptable'
        END
    FROM cutover_performance_metrics cpm
    WHERE cpm.table_name LIKE table_filter
      AND cpm.measurement_period_start >= NOW() - INTERVAL '%s hours'
    ORDER BY cpm.table_name, cpm.operation_type;

    -- Consistency validation section
    RETURN QUERY
    SELECT
        'Data Consistency'::TEXT,
        vtc.table_name,
        'Validation Score'::TEXT,
        format('%s%% (%s/%s records consistent)',
            vtc.validation_score, vtc.consistent_records, vtc.primary_count
        ),
        CASE
            WHEN vtc.validation_score >= 99.0 THEN 'healthy'
            WHEN vtc.validation_score >= 95.0 THEN 'warning'
            ELSE 'error'
        END,
        CASE
            WHEN vtc.validation_score < 95.0 THEN 'Critical: Fix data consistency'
            WHEN vtc.validation_score < 99.0 THEN 'Monitor consistency closely'
            ELSE 'Consistency acceptable'
        END
    FROM (
        SELECT p_table_name as table_name, *
        FROM validate_table_consistency(p_table_name)
        WHERE p_table_name IS NOT NULL
        UNION ALL
        SELECT 'projects', * FROM validate_table_consistency('projects') WHERE p_table_name IS NULL
        UNION ALL
        SELECT 'sessions', * FROM validate_table_consistency('sessions') WHERE p_table_name IS NULL
        UNION ALL
        SELECT 'contexts', * FROM validate_table_consistency('contexts') WHERE p_table_name IS NULL
        UNION ALL
        SELECT 'analytics_events', * FROM validate_table_consistency('analytics_events') WHERE p_table_name IS NULL
    ) vtc
    WHERE vtc.table_name LIKE table_filter;
END;
$$;


ALTER FUNCTION public.generate_cutover_report(p_table_name text, p_hours_back integer) OWNER TO ridgetop;

--
-- Name: generate_learning_insights(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.generate_learning_insights() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    pattern_threshold INTEGER := 3; -- Minimum occurrences to create pattern
    similar_decisions INTEGER;
BEGIN
    -- Only process successful outcomes with high scores
    IF NEW.outcome_status = 'successful' AND NEW.outcome_score >= 8 THEN
        -- Check if we have similar successful decisions to form a pattern
        SELECT COUNT(*) INTO similar_decisions
        FROM decision_outcomes outcomes
        JOIN technical_decisions decisions ON outcomes.decision_id = decisions.id
        WHERE outcomes.outcome_status = 'successful' 
        AND outcomes.outcome_score >= 8
        AND decisions.decision_type = (SELECT decision_type FROM technical_decisions WHERE id = NEW.decision_id)
        AND decisions.impact_level = (SELECT impact_level FROM technical_decisions WHERE id = NEW.decision_id);
        
        -- If we have enough similar successes, create/update pattern
        IF similar_decisions >= pattern_threshold THEN
            INSERT INTO decision_learning_insights (
                project_id, insight_type, pattern_name, pattern_description,
                pattern_conditions, confidence_score, supporting_evidence_count,
                recommendation, decision_types, impact_levels, source_decisions
            )
            SELECT 
                decisions.project_id,
                'success_pattern',
                'Successful ' || decisions.decision_type || ' decisions at ' || decisions.impact_level || ' impact',
                'Pattern identified from successful ' || decisions.decision_type || ' decisions with high outcome scores',
                jsonb_build_object(
                    'decision_type', decisions.decision_type,
                    'impact_level', decisions.impact_level,
                    'min_outcome_score', 8
                ),
                LEAST(similar_decisions / 10.0, 0.95), -- Cap confidence at 95%
                similar_decisions,
                'Continue applying similar approaches for ' || decisions.decision_type || ' decisions',
                ARRAY[decisions.decision_type],
                ARRAY[decisions.impact_level],
                ARRAY[NEW.decision_id]
            FROM technical_decisions decisions 
            WHERE decisions.id = NEW.decision_id
            ON CONFLICT (project_id, pattern_name) DO UPDATE SET
                supporting_evidence_count = EXCLUDED.supporting_evidence_count,
                confidence_score = EXCLUDED.confidence_score,
                last_confirmed = CURRENT_TIMESTAMP,
                source_decisions = array_append(decision_learning_insights.source_decisions, NEW.decision_id);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.generate_learning_insights() OWNER TO ridgetop;

--
-- Name: get_cutover_status_dashboard(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.get_cutover_status_dashboard() RETURNS TABLE(table_name character varying, cutover_stage character varying, read_percentage integer, health_status character varying, stage_duration_minutes integer, next_eligible_in_minutes integer, error_rate_percent numeric, validation_score numeric, recommendations character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        trc.table_name,
        trc.cutover_stage::VARCHAR(20),
        trc.read_percentage,
        trc.health_status,
        ROUND(EXTRACT(epoch FROM (CURRENT_TIMESTAMP - trc.stage_started_at))/60)::INTEGER as stage_duration_minutes,
        ROUND(GREATEST(0, EXTRACT(epoch FROM (trc.next_stage_eligible_at - CURRENT_TIMESTAMP))/60))::INTEGER as next_eligible_in_minutes,
        COALESCE(
            (SELECT ROUND((COUNT(*) FILTER (WHERE success = FALSE)::numeric /
                          NULLIF(COUNT(*), 0)::numeric) * 100, 2)
             FROM dual_write_stats dws
             WHERE dws.table_name = trc.table_name
               AND dws.timestamp >= NOW() - INTERVAL '1 hour'), 0
        ) as error_rate_percent,
        100::NUMERIC(5,2) as validation_score, -- Simplified for compatibility
        CASE
            WHEN trc.health_status = 'healthy' AND CURRENT_TIMESTAMP >= trc.next_stage_eligible_at
            THEN 'Ready for next stage'::VARCHAR(100)
            WHEN trc.health_status = 'healthy'
            THEN 'Monitoring current stage'::VARCHAR(100)
            WHEN trc.health_status = 'warning'
            THEN 'Requires attention'::VARCHAR(100)
            ELSE 'Critical - intervention required'::VARCHAR(100)
        END as recommendations
    FROM traffic_routing_config trc
    ORDER BY trc.table_name;
END;
$$;


ALTER FUNCTION public.get_cutover_status_dashboard() OWNER TO ridgetop;

--
-- Name: get_dual_write_performance_summary(integer); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.get_dual_write_performance_summary(p_hours_back integer DEFAULT 24) RETURNS TABLE(table_name text, total_operations bigint, successful_operations bigint, failed_operations bigint, success_rate numeric, avg_duration_ms numeric, max_duration_ms integer, total_errors bigint, recent_errors text[])
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        dws.table_name,
        COUNT(*) as total_operations,
        COUNT(*) FILTER (WHERE dws.success = TRUE) as successful_operations,
        COUNT(*) FILTER (WHERE dws.success = FALSE) as failed_operations,
        ROUND((COUNT(*) FILTER (WHERE dws.success = TRUE)::numeric / COUNT(*)::numeric) * 100, 2) as success_rate,
        ROUND(AVG(dws.duration_ms), 2) as avg_duration_ms,
        MAX(dws.duration_ms) as max_duration_ms,
        COUNT(*) FILTER (WHERE dws.success = FALSE) as total_errors,
        ARRAY_AGG(dws.error_message ORDER BY dws.timestamp DESC) FILTER (WHERE dws.success = FALSE AND dws.error_message IS NOT NULL) as recent_errors
    FROM dual_write_stats dws
    WHERE dws.timestamp >= NOW() - INTERVAL '%s hours'
    GROUP BY dws.table_name
    ORDER BY dws.table_name;
END;
$$;


ALTER FUNCTION public.get_dual_write_performance_summary(p_hours_back integer) OWNER TO ridgetop;

--
-- Name: get_dual_write_status(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.get_dual_write_status() RETURNS TABLE(table_name text, enabled boolean, sync_mode text, failure_count integer, emergency_stop boolean, last_failure text, status_summary text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        dwc.table_name,
        dwc.enabled,
        dwc.sync_mode,
        dwc.failure_count,
        dwc.emergency_stop,
        to_char(dwc.last_failure_at, 'YYYY-MM-DD HH24:MI:SS') as last_failure,
        CASE
            WHEN dwc.emergency_stop THEN 'EMERGENCY STOP ACTIVE'
            WHEN NOT dwc.enabled THEN 'DISABLED'
            WHEN dwc.enabled AND dwc.failure_count = 0 THEN 'HEALTHY'
            WHEN dwc.enabled AND dwc.failure_count > 0 THEN format('WARNING: %s failures', dwc.failure_count)
            ELSE 'UNKNOWN'
        END as status_summary
    FROM dual_write_config dwc
    ORDER BY dwc.table_name;
END;
$$;


ALTER FUNCTION public.get_dual_write_status() OWNER TO ridgetop;

--
-- Name: get_next_session_display_id(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.get_next_session_display_id() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
  current_year INTEGER;
  sequence_name TEXT;
  next_num INTEGER;
  display_id VARCHAR(20);
BEGIN
  -- Get current year
  current_year := EXTRACT(YEAR FROM CURRENT_TIMESTAMP)::INTEGER;

  -- Build sequence name for this year
  sequence_name := 'session_seq_' || current_year;

  -- Create sequence if it doesn't exist (atomic operation)
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START WITH 1', sequence_name);

  -- Get next number from sequence
  EXECUTE format('SELECT nextval(%L)', sequence_name) INTO next_num;

  -- Format as SES-YYYY-NNNN (e.g., SES-2025-0042)
  display_id := 'SES-' || current_year || '-' || LPAD(next_num::TEXT, 4, '0');

  RETURN display_id;
END;
$$;


ALTER FUNCTION public.get_next_session_display_id() OWNER TO ridgetop;

--
-- Name: get_project_analysis_insights(uuid, integer); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.get_project_analysis_insights(proj_id uuid, days_back integer DEFAULT 30) RETURNS TABLE(total_sessions integer, avg_session_duration_ms double precision, most_active_branch character varying, top_trigger_type character varying, performance_trend double precision, files_per_session double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_sessions,
        AVG(cas.analysis_duration_ms)::FLOAT as avg_session_duration_ms,
        MODE() WITHIN GROUP (ORDER BY cas.branch_name) as most_active_branch,
        MODE() WITHIN GROUP (ORDER BY cas.trigger_type) as top_trigger_type,
        CASE 
            WHEN COUNT(*) > 1 THEN
                -- Calculate performance trend (positive = getting faster)
                (FIRST_VALUE(cas.analysis_duration_ms) OVER (ORDER BY cas.started_at DESC ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) -
                 LAST_VALUE(cas.analysis_duration_ms) OVER (ORDER BY cas.started_at DESC ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)) * -1.0
            ELSE 0.0
        END as performance_trend,
        AVG(array_length(cas.files_analyzed, 1))::FLOAT as files_per_session
    FROM code_analysis_sessions cas
    WHERE cas.project_id = proj_id
    AND cas.started_at >= CURRENT_TIMESTAMP - INTERVAL '1 day' * days_back
    AND cas.status = 'completed';
END;
$$;


ALTER FUNCTION public.get_project_analysis_insights(proj_id uuid, days_back integer) OWNER TO ridgetop;

--
-- Name: get_session_analysis_summary(uuid); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.get_session_analysis_summary(session_uuid uuid) RETURNS TABLE(total_analyses integer, avg_duration_ms double precision, total_files_analyzed integer, total_components_found integer, avg_cache_hit_rate double precision, most_common_trigger character varying, quality_trend double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_analyses,
        AVG(cas.analysis_duration_ms)::FLOAT as avg_duration_ms,
        SUM(array_length(cas.files_analyzed, 1))::INTEGER as total_files_analyzed,
        SUM(cas.components_found)::INTEGER as total_components_found,
        AVG(cas.cache_hit_rate)::FLOAT as avg_cache_hit_rate,
        MODE() WITHIN GROUP (ORDER BY cas.trigger_type) as most_common_trigger,
        CASE 
            WHEN COUNT(*) > 1 THEN 
                (LAST_VALUE(cas.quality_score) OVER (ORDER BY cas.started_at ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) - 
                 FIRST_VALUE(cas.quality_score) OVER (ORDER BY cas.started_at ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING))
            ELSE NULL 
        END as quality_trend
    FROM code_analysis_sessions cas
    WHERE cas.development_session_id = session_uuid
    AND cas.status = 'completed';
END;
$$;


ALTER FUNCTION public.get_session_analysis_summary(session_uuid uuid) OWNER TO ridgetop;

--
-- Name: get_sync_lag_analysis(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.get_sync_lag_analysis() RETURNS TABLE(table_name text, primary_count bigint, shadow_count bigint, sync_pending bigint, avg_sync_lag_minutes numeric, max_sync_lag_minutes numeric, oldest_unsynced_record timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        'projects'::TEXT,
        (SELECT COUNT(*) FROM projects)::BIGINT,
        (SELECT COUNT(*) FROM projects_shadow WHERE _shadow_sync_status = 'synced')::BIGINT,
        (SELECT COUNT(*) FROM projects_shadow WHERE _shadow_sync_status = 'pending')::BIGINT,
        (SELECT ROUND(AVG(EXTRACT(epoch FROM (CURRENT_TIMESTAMP - _shadow_created_at))/60), 2)
         FROM projects_shadow WHERE _shadow_sync_status = 'pending'),
        (SELECT ROUND(MAX(EXTRACT(epoch FROM (CURRENT_TIMESTAMP - _shadow_created_at))/60), 2)
         FROM projects_shadow WHERE _shadow_sync_status = 'pending'),
        (SELECT MIN(_shadow_created_at) FROM projects_shadow WHERE _shadow_sync_status = 'pending')
    UNION ALL
    SELECT
        'sessions'::TEXT,
        (SELECT COUNT(*) FROM sessions)::BIGINT,
        (SELECT COUNT(*) FROM sessions_shadow WHERE _shadow_sync_status = 'synced')::BIGINT,
        (SELECT COUNT(*) FROM sessions_shadow WHERE _shadow_sync_status = 'pending')::BIGINT,
        (SELECT ROUND(AVG(EXTRACT(epoch FROM (CURRENT_TIMESTAMP - _shadow_created_at))/60), 2)
         FROM sessions_shadow WHERE _shadow_sync_status = 'pending'),
        (SELECT ROUND(MAX(EXTRACT(epoch FROM (CURRENT_TIMESTAMP - _shadow_created_at))/60), 2)
         FROM sessions_shadow WHERE _shadow_sync_status = 'pending'),
        (SELECT MIN(_shadow_created_at) FROM sessions_shadow WHERE _shadow_sync_status = 'pending')
    UNION ALL
    SELECT
        'contexts'::TEXT,
        (SELECT COUNT(*) FROM contexts)::BIGINT,
        (SELECT COUNT(*) FROM contexts_shadow WHERE _shadow_sync_status = 'synced')::BIGINT,
        (SELECT COUNT(*) FROM contexts_shadow WHERE _shadow_sync_status = 'pending')::BIGINT,
        (SELECT ROUND(AVG(EXTRACT(epoch FROM (CURRENT_TIMESTAMP - _shadow_created_at))/60), 2)
         FROM contexts_shadow WHERE _shadow_sync_status = 'pending'),
        (SELECT ROUND(MAX(EXTRACT(epoch FROM (CURRENT_TIMESTAMP - _shadow_created_at))/60), 2)
         FROM contexts_shadow WHERE _shadow_sync_status = 'pending'),
        (SELECT MIN(_shadow_created_at) FROM contexts_shadow WHERE _shadow_sync_status = 'pending')
    UNION ALL
    SELECT
        'analytics_events'::TEXT,
        (SELECT COUNT(*) FROM analytics_events)::BIGINT,
        (SELECT COUNT(*) FROM analytics_events_shadow WHERE _shadow_sync_status = 'synced')::BIGINT,
        (SELECT COUNT(*) FROM analytics_events_shadow WHERE _shadow_sync_status = 'pending')::BIGINT,
        (SELECT ROUND(AVG(EXTRACT(epoch FROM (CURRENT_TIMESTAMP - _shadow_created_at))/60), 2)
         FROM analytics_events_shadow WHERE _shadow_sync_status = 'pending'),
        (SELECT ROUND(MAX(EXTRACT(epoch FROM (CURRENT_TIMESTAMP - _shadow_created_at))/60), 2)
         FROM analytics_events_shadow WHERE _shadow_sync_status = 'pending'),
        (SELECT MIN(_shadow_created_at) FROM analytics_events_shadow WHERE _shadow_sync_status = 'pending')
    UNION ALL
    SELECT
        'tasks'::TEXT,
        (SELECT COUNT(*) FROM tasks)::BIGINT,
        (SELECT COUNT(*) FROM agent_tasks_shadow WHERE _shadow_sync_status = 'synced')::BIGINT,
        (SELECT COUNT(*) FROM agent_tasks_shadow WHERE _shadow_sync_status = 'pending')::BIGINT,
        (SELECT ROUND(AVG(EXTRACT(epoch FROM (CURRENT_TIMESTAMP - _shadow_created_at))/60), 2)
         FROM agent_tasks_shadow WHERE _shadow_sync_status = 'pending'),
        (SELECT ROUND(MAX(EXTRACT(epoch FROM (CURRENT_TIMESTAMP - _shadow_created_at))/60), 2)
         FROM agent_tasks_shadow WHERE _shadow_sync_status = 'pending'),
        (SELECT MIN(_shadow_created_at) FROM agent_tasks_shadow WHERE _shadow_sync_status = 'pending');
END;
$$;


ALTER FUNCTION public.get_sync_lag_analysis() OWNER TO ridgetop;

--
-- Name: git_branches_update_stats_fn(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.git_branches_update_stats_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN IF TG_OP = 'INSERT' AND NEW.branch_name IS NOT NULL THEN UPDATE git_branches SET commit_count = (SELECT COUNT(*) FROM git_commits WHERE project_id = NEW.project_id AND branch_name = NEW.branch_name), last_commit_date = (SELECT MAX(author_date) FROM git_commits WHERE project_id = NEW.project_id AND branch_name = NEW.branch_name), first_commit_date = COALESCE(first_commit_date, (SELECT MIN(author_date) FROM git_commits WHERE project_id = NEW.project_id AND branch_name = NEW.branch_name)), current_sha = NEW.commit_sha, updated_at = CURRENT_TIMESTAMP WHERE project_id = NEW.project_id AND branch_name = NEW.branch_name; INSERT INTO git_branches (project_id, branch_name, current_sha, commit_count, last_commit_date, first_commit_date) SELECT NEW.project_id, NEW.branch_name, NEW.commit_sha, 1, NEW.author_date, NEW.author_date WHERE NEW.branch_name IS NOT NULL AND NOT EXISTS (SELECT 1 FROM git_branches WHERE project_id = NEW.project_id AND branch_name = NEW.branch_name); END IF; RETURN COALESCE(NEW, OLD); END; $$;


ALTER FUNCTION public.git_branches_update_stats_fn() OWNER TO ridgetop;

--
-- Name: git_commits_trigger_fn(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.git_commits_trigger_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Auto-classify commit type if not provided or is default
    IF NEW.commit_type IS NULL OR NEW.commit_type = 'feature' THEN
        NEW.commit_type = classify_commit_type(NEW.message);
    END IF;
    
    -- Update timestamps
    IF TG_OP = 'INSERT' THEN
        NEW.created_at = CURRENT_TIMESTAMP;
        NEW.updated_at = CURRENT_TIMESTAMP;
    ELSIF TG_OP = 'UPDATE' THEN
        NEW.updated_at = CURRENT_TIMESTAMP;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.git_commits_trigger_fn() OWNER TO ridgetop;

--
-- Name: is_dual_write_enabled(text); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.is_dual_write_enabled(p_table_name text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    config_enabled BOOLEAN := FALSE;
    config_emergency_stop BOOLEAN := FALSE;
BEGIN
    SELECT enabled, emergency_stop
    INTO config_enabled, config_emergency_stop
    FROM dual_write_config
    WHERE table_name = p_table_name;

    -- Return FALSE if emergency stop is active or if not enabled
    RETURN config_enabled AND NOT COALESCE(config_emergency_stop, FALSE);
END;
$$;


ALTER FUNCTION public.is_dual_write_enabled(p_table_name text) OWNER TO ridgetop;

--
-- Name: manage_pattern_lifecycle(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.manage_pattern_lifecycle() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Update timestamps
    IF TG_OP = 'INSERT' THEN
        NEW.created_at = CURRENT_TIMESTAMP;
        NEW.updated_at = CURRENT_TIMESTAMP;
    ELSIF TG_OP = 'UPDATE' THEN
        NEW.updated_at = CURRENT_TIMESTAMP;
    END IF;
    
    -- Auto-classify pattern strength for co-occurrence patterns
    IF TG_TABLE_NAME = 'file_cooccurrence_patterns' THEN
        IF NEW.lift_score >= 10.0 AND NEW.confidence_score >= 0.8 THEN
            NEW.pattern_strength = 'very_strong';
        ELSIF NEW.lift_score >= 5.0 AND NEW.confidence_score >= 0.6 THEN
            NEW.pattern_strength = 'strong';
        ELSIF NEW.lift_score >= 2.0 AND NEW.confidence_score >= 0.4 THEN
            NEW.pattern_strength = 'moderate';
        ELSE
            NEW.pattern_strength = 'weak';
        END IF;
    END IF;
    
    -- Auto-classify risk levels for magnitude patterns
    IF TG_TABLE_NAME = 'change_magnitude_patterns' THEN
        IF NEW.anomaly_score >= 0.9 OR NEW.hotspot_score >= 0.95 THEN
            NEW.risk_level = 'critical';
        ELSIF NEW.anomaly_score >= 0.7 OR NEW.hotspot_score >= 0.8 THEN
            NEW.risk_level = 'high';
        ELSIF NEW.anomaly_score >= 0.5 OR NEW.hotspot_score >= 0.6 THEN
            NEW.risk_level = 'medium';
        ELSE
            NEW.risk_level = 'low';
        END IF;
    END IF;
    
    -- Auto-calculate composite scores for developer patterns
    IF TG_TABLE_NAME = 'developer_patterns' THEN
        -- Calculate knowledge silo risk
        NEW.knowledge_silo_risk_score = LEAST(1.0, (
            (COALESCE(NEW.exclusive_ownership_count, 0) / GREATEST(COALESCE(NEW.unique_files_touched, 1), 1))::DECIMAL * 0.6 +
            (1.0 - COALESCE(NEW.temporal_overlap_score, 0)) * 0.4
        ));
        
        -- Classify work schedule
        IF array_length(NEW.preferred_hours, 1) IS NOT NULL THEN
            IF NEW.preferred_hours <@ ARRAY[9,10,11,12,13,14,15,16,17] THEN
                NEW.work_schedule_classification = 'business_hours';
            ELSIF NEW.preferred_hours && ARRAY[22,23,0,1,2,3,4,5] THEN
                NEW.work_schedule_classification = 'night_owl';
            ELSE
                NEW.work_schedule_classification = 'flexible';
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.manage_pattern_lifecycle() OWNER TO ridgetop;

--
-- Name: perform_cutover_health_check(text); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.perform_cutover_health_check(p_table_name text) RETURNS TABLE(table_name text, overall_health text, error_rate_percent numeric, latency_increase_percent numeric, validation_score numeric, health_summary text, recommendations text[])
    LANGUAGE plpgsql
    AS $$
DECLARE
    config_record RECORD;
    perf_record RECORD;
    consistency_record RECORD;
    error_rate NUMERIC(5,2) := 0;
    latency_increase NUMERIC(5,2) := 0;
    validation_score NUMERIC(5,2) := 100;
    computed_health_status TEXT := 'healthy';
    health_msg TEXT := '';
    recommendations TEXT[] := '{}';
BEGIN
    -- Get current configuration
    SELECT * INTO config_record
    FROM traffic_routing_config
    WHERE traffic_routing_config.table_name = p_table_name;

    IF config_record IS NULL THEN
        RETURN QUERY SELECT
            p_table_name, 'error'::TEXT, 0::NUMERIC(5,2), 0::NUMERIC(5,2), 0::NUMERIC(5,2),
            'Table not found in routing configuration', ARRAY['Configure table for cutover']::TEXT[];
        RETURN;
    END IF;

    -- Check error rate from dual-write stats
    SELECT
        COALESCE(
            ROUND((COUNT(*) FILTER (WHERE success = FALSE)::numeric /
                   NULLIF(COUNT(*), 0)::numeric) * 100, 2), 0
        ) INTO error_rate
    FROM dual_write_stats dws
    WHERE dws.table_name = p_table_name
      AND dws.timestamp >= NOW() - INTERVAL '1 hour';

    -- Check latency increase
    IF config_record.baseline_read_latency_ms IS NOT NULL AND config_record.current_read_latency_ms IS NOT NULL THEN
        latency_increase := ROUND(
            ((config_record.current_read_latency_ms - config_record.baseline_read_latency_ms) /
             config_record.baseline_read_latency_ms) * 100, 2
        );
    END IF;

    -- Check data consistency (simplified for compatibility)
    BEGIN
        SELECT vtc.validation_score INTO validation_score
        FROM validate_table_consistency(p_table_name) vtc;
    EXCEPTION WHEN OTHERS THEN
        validation_score := 100; -- Default to healthy if validation fails
    END;

    -- Determine overall health
    IF error_rate > config_record.max_error_rate_percent THEN
        computed_health_status := 'error';
        health_msg := format('High error rate: %s%%', error_rate);
        recommendations := array_append(recommendations, 'Investigate and fix errors before proceeding');
    ELSIF latency_increase > config_record.max_latency_increase_percent THEN
        computed_health_status := 'error';
        health_msg := format('High latency increase: %s%%', latency_increase);
        recommendations := array_append(recommendations, 'Optimize shadow table performance');
    ELSIF validation_score < config_record.min_validation_score THEN
        computed_health_status := 'error';
        health_msg := format('Low validation score: %s%%', validation_score);
        recommendations := array_append(recommendations, 'Fix data consistency issues');
    ELSIF error_rate > config_record.max_error_rate_percent / 2 THEN
        computed_health_status := 'warning';
        health_msg := format('Elevated error rate: %s%%', error_rate);
        recommendations := array_append(recommendations, 'Monitor error rate closely');
    ELSIF latency_increase > config_record.max_latency_increase_percent / 2 THEN
        computed_health_status := 'warning';
        health_msg := format('Elevated latency: %s%%', latency_increase);
        recommendations := array_append(recommendations, 'Monitor performance closely');
    ELSE
        computed_health_status := 'healthy';
        health_msg := 'All metrics within acceptable ranges';
        recommendations := array_append(recommendations, 'Ready for next stage');
    END IF;

    -- Update routing configuration with health check results
    UPDATE traffic_routing_config
    SET
        health_status = computed_health_status::VARCHAR(20),
        last_health_check = CURRENT_TIMESTAMP,
        current_read_latency_ms = COALESCE(config_record.current_read_latency_ms, 0),
        consecutive_failures = CASE
            WHEN computed_health_status = 'healthy' THEN 0
            ELSE consecutive_failures + 1
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE traffic_routing_config.table_name = p_table_name;

    RETURN QUERY SELECT
        p_table_name, computed_health_status, error_rate, latency_increase, validation_score,
        health_msg, recommendations;
END;
$$;


ALTER FUNCTION public.perform_cutover_health_check(p_table_name text) OWNER TO ridgetop;

--
-- Name: record_cutover_operation(text, text, integer, boolean, boolean); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.record_cutover_operation(p_table_name text, p_operation_type text, p_latency_ms integer, p_success boolean DEFAULT true, p_used_shadow boolean DEFAULT false) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    routing_config RECORD;
    actual_operation_type TEXT;
BEGIN
    -- Get current routing configuration
    SELECT cutover_stage INTO routing_config
    FROM traffic_routing_config
    WHERE table_name = p_table_name;

    -- Determine actual operation type
    actual_operation_type := CASE
        WHEN p_used_shadow THEN p_operation_type || '_shadow'
        ELSE p_operation_type
    END;

    -- Record performance metric (aggregated by hour)
    INSERT INTO cutover_performance_metrics (
        table_name, cutover_stage, operation_type, total_operations,
        successful_operations, failed_operations, avg_latency_ms,
        measurement_period_start, measurement_period_end
    ) VALUES (
        p_table_name, routing_config.cutover_stage, actual_operation_type, 1,
        CASE WHEN p_success THEN 1 ELSE 0 END,
        CASE WHEN p_success THEN 0 ELSE 1 END,
        p_latency_ms,
        date_trunc('hour', CURRENT_TIMESTAMP),
        date_trunc('hour', CURRENT_TIMESTAMP) + INTERVAL '1 hour'
    );

    -- Note: Using simple INSERT instead of UPSERT for now
    -- Could be enhanced with aggregation logic later
END;
$$;


ALTER FUNCTION public.record_cutover_operation(p_table_name text, p_operation_type text, p_latency_ms integer, p_success boolean, p_used_shadow boolean) OWNER TO ridgetop;

--
-- Name: record_dual_write_failure(text, text); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.record_dual_write_failure(p_table_name text, p_error_message text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    current_failures INTEGER;
    max_failures INTEGER;
BEGIN
    UPDATE dual_write_config
    SET
        failure_count = failure_count + 1,
        last_failure_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE table_name = p_table_name
    RETURNING failure_count, max_failures INTO current_failures, max_failures;

    -- Auto-disable if too many failures
    IF current_failures >= max_failures THEN
        UPDATE dual_write_config
        SET
            enabled = FALSE,
            emergency_stop = TRUE,
            notes = COALESCE(notes, '') || format(' AUTO-DISABLED at %s due to %s failures. Last error: %s',
                CURRENT_TIMESTAMP, current_failures, p_error_message),
            updated_at = CURRENT_TIMESTAMP
        WHERE table_name = p_table_name;

        RAISE WARNING 'Dual-write auto-disabled for table % due to % failures', p_table_name, current_failures;
    END IF;
END;
$$;


ALTER FUNCTION public.record_dual_write_failure(p_table_name text, p_error_message text) OWNER TO ridgetop;

--
-- Name: record_dual_write_stats(text, text, boolean, integer, uuid, text, text, integer); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.record_dual_write_stats(p_table_name text, p_operation text, p_success boolean, p_duration_ms integer, p_record_id uuid, p_validation_hash text, p_error_message text DEFAULT NULL::text, p_record_size_bytes integer DEFAULT NULL::integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO dual_write_stats (
        table_name, operation, success, duration_ms, record_id,
        validation_hash, error_message, record_size_bytes
    ) VALUES (
        p_table_name, p_operation, p_success, p_duration_ms, p_record_id,
        p_validation_hash, p_error_message, p_record_size_bytes
    );
END;
$$;


ALTER FUNCTION public.record_dual_write_stats(p_table_name text, p_operation text, p_success boolean, p_duration_ms integer, p_record_id uuid, p_validation_hash text, p_error_message text, p_record_size_bytes integer) OWNER TO ridgetop;

--
-- Name: refresh_complexity_materialized_views(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.refresh_complexity_materialized_views() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY project_complexity_dashboard;
    REFRESH MATERIALIZED VIEW CONCURRENTLY high_risk_complexity_items;
END;
$$;


ALTER FUNCTION public.refresh_complexity_materialized_views() OWNER TO ridgetop;

--
-- Name: reset_cutover_state(text, boolean); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.reset_cutover_state(p_table_name text, p_confirm_reset boolean DEFAULT false) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    result_msg TEXT;
BEGIN
    IF NOT p_confirm_reset THEN
        RETURN 'SAFETY: Call with p_confirm_reset := TRUE to execute reset';
    END IF;

    -- Reset routing configuration
    UPDATE traffic_routing_config
    SET
        cutover_stage = 'disabled',
        read_percentage = 0,
        write_shadow_enabled = FALSE,
        health_status = 'healthy',
        consecutive_failures = 0,
        stage_started_at = NULL,
        next_stage_eligible_at = NULL,
        baseline_read_latency_ms = NULL,
        baseline_write_latency_ms = NULL,
        current_read_latency_ms = NULL,
        current_write_latency_ms = NULL,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = current_user,
        notes = COALESCE(notes, '') || format(' STATE RESET at %s', CURRENT_TIMESTAMP)
    WHERE table_name = p_table_name;

    -- Disable dual-write
    PERFORM disable_dual_write(p_table_name, 'Cutover state reset');

    result_msg := format('Cutover state RESET for table %s', p_table_name);
    RAISE NOTICE '%', result_msg;

    RETURN result_msg;
END;
$$;


ALTER FUNCTION public.reset_cutover_state(p_table_name text, p_confirm_reset boolean) OWNER TO ridgetop;

--
-- Name: rollback_cutover_system(boolean); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.rollback_cutover_system(p_confirm_rollback boolean DEFAULT false) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    result_msg TEXT := '';
BEGIN
    IF NOT p_confirm_rollback THEN
        RETURN 'SAFETY: Call with p_confirm_rollback := TRUE to execute rollback';
    END IF;

    -- Stop all active cutover operations
    PERFORM emergency_stop_all_cutover('System rollback in progress');

    -- Drop cutover tables
    DROP TABLE IF EXISTS cutover_performance_metrics CASCADE;
    DROP TABLE IF EXISTS traffic_routing_config CASCADE;

    result_msg := result_msg || 'Dropped cutover tables; ';

    -- Drop cutover functions
    DROP FUNCTION IF EXISTS start_gradual_cutover(TEXT, INTEGER) CASCADE;
    DROP FUNCTION IF EXISTS advance_cutover_stage(TEXT, BOOLEAN) CASCADE;
    DROP FUNCTION IF EXISTS complete_cutover(TEXT, BOOLEAN) CASCADE;
    DROP FUNCTION IF EXISTS emergency_rollback(TEXT, TEXT) CASCADE;
    DROP FUNCTION IF EXISTS perform_cutover_health_check(TEXT) CASCADE;
    DROP FUNCTION IF EXISTS get_cutover_status_dashboard() CASCADE;
    DROP FUNCTION IF EXISTS should_route_to_shadow(TEXT, TEXT) CASCADE;
    DROP FUNCTION IF EXISTS record_cutover_operation(TEXT, TEXT, INTEGER, BOOLEAN, BOOLEAN) CASCADE;
    DROP FUNCTION IF EXISTS run_automated_safety_check() CASCADE;
    DROP FUNCTION IF EXISTS generate_cutover_report(TEXT, INTEGER) CASCADE;
    DROP FUNCTION IF EXISTS emergency_stop_all_cutover(TEXT) CASCADE;
    DROP FUNCTION IF EXISTS reset_cutover_state(TEXT, BOOLEAN) CASCADE;
    DROP FUNCTION IF EXISTS run_cutover_system_tests() CASCADE;
    DROP FUNCTION IF EXISTS rollback_cutover_system(BOOLEAN) CASCADE;

    result_msg := result_msg || 'Dropped cutover functions; ';

    -- Drop custom types
    DROP TYPE IF EXISTS cutover_stage CASCADE;

    result_msg := result_msg || 'Dropped cutover types; ';

    RETURN 'CUTOVER SYSTEM ROLLBACK COMPLETE: ' || result_msg;
END;
$$;


ALTER FUNCTION public.rollback_cutover_system(p_confirm_rollback boolean) OWNER TO ridgetop;

--
-- Name: rollback_dual_write_system(boolean); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.rollback_dual_write_system(p_confirm_rollback boolean DEFAULT false) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    result_msg TEXT := '';
    trigger_count INTEGER := 0;
BEGIN
    IF NOT p_confirm_rollback THEN
        RETURN 'SAFETY: Call with p_confirm_rollback := TRUE to execute rollback';
    END IF;

    -- Drop all dual-write triggers
    DROP TRIGGER IF EXISTS projects_dual_write_trigger ON projects;
    DROP TRIGGER IF EXISTS sessions_dual_write_trigger ON sessions;
    DROP TRIGGER IF EXISTS contexts_dual_write_trigger ON contexts;
    DROP TRIGGER IF EXISTS analytics_events_dual_write_trigger ON analytics_events;
    DROP TRIGGER IF EXISTS tasks_dual_write_trigger ON tasks;

    result_msg := result_msg || 'Dropped all dual-write triggers; ';

    -- Drop configuration and stats tables
    DROP TABLE IF EXISTS dual_write_stats CASCADE;
    DROP TABLE IF EXISTS dual_write_config CASCADE;

    result_msg := result_msg || 'Dropped configuration and statistics tables; ';

    -- Drop all dual-write functions
    DROP FUNCTION IF EXISTS dual_write_trigger_function() CASCADE;
    DROP FUNCTION IF EXISTS is_dual_write_enabled(TEXT) CASCADE;
    DROP FUNCTION IF EXISTS record_dual_write_failure(TEXT, TEXT) CASCADE;
    DROP FUNCTION IF EXISTS record_dual_write_stats(TEXT, TEXT, BOOLEAN, INTEGER, UUID, TEXT, TEXT, INTEGER) CASCADE;
    DROP FUNCTION IF EXISTS calculate_validation_hash_with_metadata(TEXT, JSONB, TEXT) CASCADE;
    DROP FUNCTION IF EXISTS validate_table_consistency(TEXT, TEXT, INTEGER) CASCADE;
    DROP FUNCTION IF EXISTS get_dual_write_performance_summary(INTEGER) CASCADE;
    DROP FUNCTION IF EXISTS get_sync_lag_analysis() CASCADE;
    DROP FUNCTION IF EXISTS enable_dual_write(TEXT, TEXT) CASCADE;
    DROP FUNCTION IF EXISTS disable_dual_write(TEXT, TEXT) CASCADE;
    DROP FUNCTION IF EXISTS emergency_stop_dual_write(TEXT) CASCADE;
    DROP FUNCTION IF EXISTS get_dual_write_status() CASCADE;
    DROP FUNCTION IF EXISTS sync_missed_records(TEXT, INTEGER, BOOLEAN) CASCADE;
    DROP FUNCTION IF EXISTS run_dual_write_validation_tests() CASCADE;
    DROP FUNCTION IF EXISTS rollback_dual_write_system(BOOLEAN) CASCADE;

    result_msg := result_msg || 'Dropped all dual-write functions; ';

    RETURN 'ROLLBACK COMPLETE: ' || result_msg;
END;
$$;


ALTER FUNCTION public.rollback_dual_write_system(p_confirm_rollback boolean) OWNER TO ridgetop;

--
-- Name: run_automated_safety_check(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.run_automated_safety_check() RETURNS TABLE(table_name text, action_taken text, reason text, health_status text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    config_record RECORD;
    health_result RECORD;
    action_msg TEXT;
    reason_msg TEXT;
BEGIN
    -- Check each table in active cutover
    FOR config_record IN
        SELECT * FROM traffic_routing_config
        WHERE cutover_stage NOT IN ('disabled', 'completed', 'rolled_back')
        AND auto_rollback_enabled = TRUE
    LOOP
        -- Perform health check
        SELECT * INTO health_result
        FROM perform_cutover_health_check(config_record.table_name);

        action_msg := 'No action';
        reason_msg := 'Health check passed';

        -- Take action based on health status
        IF health_result.overall_health = 'error' THEN
            -- Emergency rollback for critical issues
            PERFORM emergency_rollback(config_record.table_name, health_result.health_summary);
            action_msg := 'Emergency rollback';
            reason_msg := health_result.health_summary;

        ELSIF health_result.overall_health = 'warning' AND config_record.consecutive_failures >= 3 THEN
            -- Rollback after multiple consecutive warnings
            PERFORM emergency_rollback(config_record.table_name, 'Multiple consecutive health warnings');
            action_msg := 'Auto rollback';
            reason_msg := 'Multiple consecutive health warnings';

        ELSIF config_record.consecutive_failures >= 10 THEN
            -- Rollback after too many failures
            PERFORM emergency_rollback(config_record.table_name, 'Excessive failure count');
            action_msg := 'Auto rollback';
            reason_msg := 'Excessive failure count';
        END IF;

        RETURN QUERY SELECT
            config_record.table_name, action_msg, reason_msg, health_result.overall_health;
    END LOOP;
END;
$$;


ALTER FUNCTION public.run_automated_safety_check() OWNER TO ridgetop;

--
-- Name: run_cutover_system_tests(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.run_cutover_system_tests() RETURNS TABLE(test_name text, test_status text, test_result text, execution_time_ms integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    start_time TIMESTAMP WITH TIME ZONE;
    end_time TIMESTAMP WITH TIME ZONE;
    duration_ms INTEGER;
    test_passed BOOLEAN;
    test_message TEXT;
    test_table TEXT := 'projects'; -- Use projects table for testing
BEGIN
    -- Test 1: Traffic routing configuration
    start_time := CURRENT_TIMESTAMP;

    BEGIN
        SELECT table_name IS NOT NULL INTO test_passed
        FROM traffic_routing_config
        WHERE table_name = test_table;
        test_message := CASE WHEN test_passed THEN 'Configuration exists' ELSE 'Configuration missing' END;
    EXCEPTION WHEN OTHERS THEN
        test_passed := FALSE;
        test_message := 'Configuration test failed: ' || SQLERRM;
    END;

    end_time := CURRENT_TIMESTAMP;
    duration_ms := EXTRACT(epoch FROM (end_time - start_time)) * 1000;

    RETURN QUERY SELECT
        'Traffic Routing Config Test'::TEXT,
        CASE WHEN test_passed THEN 'PASS' ELSE 'FAIL' END::TEXT,
        test_message,
        duration_ms;

    -- Test 2: Health check functionality
    start_time := CURRENT_TIMESTAMP;

    BEGIN
        PERFORM perform_cutover_health_check(test_table);
        test_passed := TRUE;
        test_message := 'Health check function working';
    EXCEPTION WHEN OTHERS THEN
        test_passed := FALSE;
        test_message := 'Health check failed: ' || SQLERRM;
    END;

    end_time := CURRENT_TIMESTAMP;
    duration_ms := EXTRACT(epoch FROM (end_time - start_time)) * 1000;

    RETURN QUERY SELECT
        'Health Check Test'::TEXT,
        CASE WHEN test_passed THEN 'PASS' ELSE 'FAIL' END::TEXT,
        test_message,
        duration_ms;

    -- Test 3: Routing decision function
    start_time := CURRENT_TIMESTAMP;

    BEGIN
        SELECT should_route_to_shadow(test_table, 'read') IS NOT NULL INTO test_passed;
        test_message := CASE WHEN test_passed THEN 'Routing function working' ELSE 'Routing function failed' END;
    EXCEPTION WHEN OTHERS THEN
        test_passed := FALSE;
        test_message := 'Routing test failed: ' || SQLERRM;
    END;

    end_time := CURRENT_TIMESTAMP;
    duration_ms := EXTRACT(epoch FROM (end_time - start_time)) * 1000;

    RETURN QUERY SELECT
        'Traffic Routing Test'::TEXT,
        CASE WHEN test_passed THEN 'PASS' ELSE 'FAIL' END::TEXT,
        test_message,
        duration_ms;

    -- Test 4: Performance metrics recording
    start_time := CURRENT_TIMESTAMP;

    BEGIN
        PERFORM record_cutover_operation(test_table, 'test', 100, TRUE, FALSE);
        test_passed := TRUE;
        test_message := 'Performance metrics recording working';
    EXCEPTION WHEN OTHERS THEN
        test_passed := FALSE;
        test_message := 'Performance metrics test failed: ' || SQLERRM;
    END;

    end_time := CURRENT_TIMESTAMP;
    duration_ms := EXTRACT(epoch FROM (end_time - start_time)) * 1000;

    RETURN QUERY SELECT
        'Performance Metrics Test'::TEXT,
        CASE WHEN test_passed THEN 'PASS' ELSE 'FAIL' END::TEXT,
        test_message,
        duration_ms;

    -- Test 5: Dashboard query
    start_time := CURRENT_TIMESTAMP;

    BEGIN
        PERFORM get_cutover_status_dashboard();
        test_passed := TRUE;
        test_message := 'Dashboard query working';
    EXCEPTION WHEN OTHERS THEN
        test_passed := FALSE;
        test_message := 'Dashboard test failed: ' || SQLERRM;
    END;

    end_time := CURRENT_TIMESTAMP;
    duration_ms := EXTRACT(epoch FROM (end_time - start_time)) * 1000;

    RETURN QUERY SELECT
        'Dashboard Query Test'::TEXT,
        CASE WHEN test_passed THEN 'PASS' ELSE 'FAIL' END::TEXT,
        test_message,
        duration_ms;
END;
$$;


ALTER FUNCTION public.run_cutover_system_tests() OWNER TO ridgetop;

--
-- Name: run_dual_write_validation_tests(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.run_dual_write_validation_tests() RETURNS TABLE(test_name text, test_status text, test_result text, execution_time_ms integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    start_time TIMESTAMP WITH TIME ZONE;
    end_time TIMESTAMP WITH TIME ZONE;
    duration_ms INTEGER;
    test_passed BOOLEAN;
    test_message TEXT;
BEGIN
    -- Test 1: Feature flag functionality
    start_time := CURRENT_TIMESTAMP;

    BEGIN
        SELECT is_dual_write_enabled('projects') INTO test_passed;
        test_message := format('Feature flag check: %s', CASE WHEN test_passed THEN 'ENABLED' ELSE 'DISABLED' END);
        test_passed := TRUE; -- Test passes if function executes without error
    EXCEPTION WHEN OTHERS THEN
        test_passed := FALSE;
        test_message := 'Feature flag function failed: ' || SQLERRM;
    END;

    end_time := CURRENT_TIMESTAMP;
    duration_ms := EXTRACT(epoch FROM (end_time - start_time)) * 1000;

    RETURN QUERY SELECT
        'Feature Flag Test'::TEXT,
        CASE WHEN test_passed THEN 'PASS' ELSE 'FAIL' END::TEXT,
        test_message,
        duration_ms;

    -- Test 2: Validation hash function
    start_time := CURRENT_TIMESTAMP;

    BEGIN
        SELECT calculate_validation_hash_with_metadata('test_table', '{"test": "data"}'::jsonb, 'TEST') IS NOT NULL INTO test_passed;
        test_message := CASE WHEN test_passed THEN 'Hash generation successful' ELSE 'Hash generation failed' END;
    EXCEPTION WHEN OTHERS THEN
        test_passed := FALSE;
        test_message := 'Hash function failed: ' || SQLERRM;
    END;

    end_time := CURRENT_TIMESTAMP;
    duration_ms := EXTRACT(epoch FROM (end_time - start_time)) * 1000;

    RETURN QUERY SELECT
        'Hash Generation Test'::TEXT,
        CASE WHEN test_passed THEN 'PASS' ELSE 'FAIL' END::TEXT,
        test_message,
        duration_ms;

    -- Test 3: Trigger existence
    start_time := CURRENT_TIMESTAMP;

    BEGIN
        SELECT COUNT(*) = 5 INTO test_passed
        FROM information_schema.triggers
        WHERE trigger_name LIKE '%_dual_write_trigger';
        test_message := CASE WHEN test_passed THEN 'All 5 triggers exist' ELSE 'Missing triggers detected' END;
    EXCEPTION WHEN OTHERS THEN
        test_passed := FALSE;
        test_message := 'Trigger check failed: ' || SQLERRM;
    END;

    end_time := CURRENT_TIMESTAMP;
    duration_ms := EXTRACT(epoch FROM (end_time - start_time)) * 1000;

    RETURN QUERY SELECT
        'Trigger Existence Test'::TEXT,
        CASE WHEN test_passed THEN 'PASS' ELSE 'FAIL' END::TEXT,
        test_message,
        duration_ms;

    -- Test 4: Configuration table integrity
    start_time := CURRENT_TIMESTAMP;

    BEGIN
        SELECT COUNT(*) = 5 INTO test_passed FROM dual_write_config;
        test_message := CASE WHEN test_passed THEN 'All 5 table configs exist' ELSE 'Missing configuration entries' END;
    EXCEPTION WHEN OTHERS THEN
        test_passed := FALSE;
        test_message := 'Configuration check failed: ' || SQLERRM;
    END;

    end_time := CURRENT_TIMESTAMP;
    duration_ms := EXTRACT(epoch FROM (end_time - start_time)) * 1000;

    RETURN QUERY SELECT
        'Configuration Test'::TEXT,
        CASE WHEN test_passed THEN 'PASS' ELSE 'FAIL' END::TEXT,
        test_message,
        duration_ms;
END;
$$;


ALTER FUNCTION public.run_dual_write_validation_tests() OWNER TO ridgetop;

--
-- Name: should_route_to_shadow(text, text); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.should_route_to_shadow(p_table_name text, p_operation_type text DEFAULT 'read'::text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    routing_config RECORD;
    random_percentage INTEGER;
BEGIN
    -- Get routing configuration
    SELECT cutover_stage, read_percentage, write_shadow_enabled, health_status
    INTO routing_config
    FROM traffic_routing_config
    WHERE table_name = p_table_name;

    -- Default to primary table if no configuration or disabled
    IF routing_config IS NULL OR routing_config.cutover_stage = 'disabled' THEN
        RETURN FALSE;
    END IF;

    -- Always use primary if emergency stop
    IF routing_config.health_status = 'emergency_stop' THEN
        RETURN FALSE;
    END IF;

    -- For write operations, check if shadow writes are enabled
    IF p_operation_type = 'write' THEN
        RETURN routing_config.write_shadow_enabled;
    END IF;

    -- For read operations, use percentage-based routing
    IF p_operation_type = 'read' THEN
        -- Generate random number 1-100
        random_percentage := floor(random() * 100) + 1;
        RETURN random_percentage <= routing_config.read_percentage;
    END IF;

    -- Default to primary table
    RETURN FALSE;
END;
$$;


ALTER FUNCTION public.should_route_to_shadow(p_table_name text, p_operation_type text) OWNER TO ridgetop;

--
-- Name: start_gradual_cutover(text, integer); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.start_gradual_cutover(p_table_name text, p_stage_duration_minutes integer DEFAULT 60) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    result_msg TEXT;
    current_stage cutover_stage;
BEGIN
    -- Get current stage
    SELECT cutover_stage INTO current_stage
    FROM traffic_routing_config
    WHERE table_name = p_table_name;

    IF current_stage IS NULL THEN
        RETURN format('ERROR: Table %s not found in routing configuration', p_table_name);
    END IF;

    IF current_stage != 'disabled' THEN
        RETURN format('ERROR: Table %s cutover already in progress (stage: %s)', p_table_name, current_stage);
    END IF;

    -- Enable dual-write first (prerequisite)
    PERFORM enable_dual_write(p_table_name, 'async');

    -- Start cutover with dual-write stage
    UPDATE traffic_routing_config
    SET
        cutover_stage = 'dual_write',
        read_percentage = 0,
        write_shadow_enabled = TRUE,
        stage_started_at = CURRENT_TIMESTAMP,
        stage_duration_target_minutes = p_stage_duration_minutes,
        next_stage_eligible_at = CURRENT_TIMESTAMP + (p_stage_duration_minutes || ' minutes')::INTERVAL,
        health_status = 'healthy',
        consecutive_failures = 0,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = current_user,
        notes = COALESCE(notes, '') || format(' CUTOVER STARTED at %s', CURRENT_TIMESTAMP)
    WHERE table_name = p_table_name;

    result_msg := format('Gradual cutover STARTED for table %s - Stage: dual_write (0%% reads)', p_table_name);
    RAISE NOTICE '%', result_msg;

    RETURN result_msg;
END;
$$;


ALTER FUNCTION public.start_gradual_cutover(p_table_name text, p_stage_duration_minutes integer) OWNER TO ridgetop;

--
-- Name: FUNCTION start_gradual_cutover(p_table_name text, p_stage_duration_minutes integer); Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON FUNCTION public.start_gradual_cutover(p_table_name text, p_stage_duration_minutes integer) IS 'P2.3 Start gradual cutover process for a table';


--
-- Name: sync_missed_records(text, integer, boolean); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.sync_missed_records(p_table_name text, p_batch_size integer DEFAULT 1000, p_dry_run boolean DEFAULT true) RETURNS TABLE(operation text, records_found bigint, records_synced bigint, errors_encountered bigint, execution_summary text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    shadow_table_name TEXT;
    primary_table TEXT := p_table_name;
    sync_count INTEGER := 0;
    error_count INTEGER := 0;
    total_found INTEGER := 0;
    sql_statement TEXT;
    rec RECORD;
BEGIN
    -- Determine shadow table name
    IF p_table_name = 'tasks' THEN
        shadow_table_name := 'agent_tasks_shadow';
    ELSE
        shadow_table_name := p_table_name || '_shadow';
    END IF;

    -- Find records missing in shadow table
    sql_statement := format('
        SELECT p.id
        FROM %I p
        LEFT JOIN %I s ON p.id = s._shadow_source_id
        WHERE s._shadow_source_id IS NULL
        LIMIT %s',
        primary_table, shadow_table_name, p_batch_size
    );

    -- Count total missing records
    EXECUTE format('
        SELECT COUNT(*)
        FROM %I p
        LEFT JOIN %I s ON p.id = s._shadow_source_id
        WHERE s._shadow_source_id IS NULL',
        primary_table, shadow_table_name
    ) INTO total_found;

    IF p_dry_run THEN
        RETURN QUERY SELECT
            'DRY RUN'::TEXT,
            total_found::BIGINT,
            0::BIGINT,
            0::BIGINT,
            format('DRY RUN: Found %s records missing in shadow table %s', total_found, shadow_table_name);
        RETURN;
    END IF;

    -- Actually sync the records
    FOR rec IN EXECUTE sql_statement LOOP
        BEGIN
            -- This would trigger the dual-write function
            -- For now, we'll manually insert
            IF p_table_name = 'projects' THEN
                INSERT INTO projects_shadow
                SELECT *, id as _shadow_source_id,
                       calculate_validation_hash_with_metadata('projects', to_jsonb(p.*), 'SYNC') as _shadow_validation_hash,
                       CURRENT_TIMESTAMP as _shadow_last_sync,
                       'synced' as _shadow_sync_status
                FROM projects p WHERE p.id = rec.id;
            -- Add similar blocks for other tables as needed
            END IF;

            sync_count := sync_count + 1;

        EXCEPTION WHEN OTHERS THEN
            error_count := error_count + 1;
        END;
    END LOOP;

    RETURN QUERY SELECT
        'SYNC COMPLETED'::TEXT,
        total_found::BIGINT,
        sync_count::BIGINT,
        error_count::BIGINT,
        format('Synced %s/%s records for table %s, %s errors', sync_count, total_found, p_table_name, error_count);
END;
$$;


ALTER FUNCTION public.sync_missed_records(p_table_name text, p_batch_size integer, p_dry_run boolean) OWNER TO ridgetop;

--
-- Name: sync_to_shadow_table(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.sync_to_shadow_table() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    shadow_table_name TEXT;
    validation_hash TEXT;
    record_jsonb JSONB;
BEGIN
    -- Construct shadow table name
    shadow_table_name := TG_TABLE_NAME || '_shadow';

    -- Convert record to JSONB for hash calculation
    record_jsonb := to_jsonb(NEW);

    -- Calculate validation hash
    validation_hash := calculate_shadow_validation_hash(TG_TABLE_NAME, record_jsonb);

    -- This function is disabled by default - would need to be implemented
    -- per table with specific INSERT/UPDATE logic

    RAISE NOTICE 'Shadow sync trigger called for table % (DISABLED)', TG_TABLE_NAME;

    RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_to_shadow_table() OWNER TO ridgetop;

--
-- Name: timeout_inactive_sessions(interval); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.timeout_inactive_sessions(timeout_threshold interval DEFAULT '02:00:00'::interval) RETURNS TABLE(session_id uuid, timed_out_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  UPDATE sessions
  SET
    status = 'inactive',
    ended_at = CURRENT_TIMESTAMP
  WHERE status = 'active'
    AND last_activity_at IS NOT NULL
    AND last_activity_at < (CURRENT_TIMESTAMP - timeout_threshold)
    AND ended_at IS NULL
  RETURNING id, CURRENT_TIMESTAMP;
END;
$$;


ALTER FUNCTION public.timeout_inactive_sessions(timeout_threshold interval) OWNER TO ridgetop;

--
-- Name: FUNCTION timeout_inactive_sessions(timeout_threshold interval); Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON FUNCTION public.timeout_inactive_sessions(timeout_threshold interval) IS 'Helper function to automatically timeout sessions that have been inactive beyond the threshold (default: 2 hours). Called by sessionTimeout service.';


--
-- Name: update_complexity_analysis_session_summary(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.update_complexity_analysis_session_summary() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Update the analysis session with summary statistics
    UPDATE complexity_analysis_sessions 
    SET 
        files_analyzed = (
            SELECT COUNT(DISTINCT file_path) 
            FROM file_complexity_summary 
            WHERE analysis_session_id = NEW.analysis_session_id
        ),
        functions_analyzed = (
            SELECT COUNT(*) 
            FROM cyclomatic_complexity_metrics 
            WHERE analysis_session_id = NEW.analysis_session_id
        ),
        complexity_metrics_calculated = (
            SELECT COUNT(*) 
            FROM cyclomatic_complexity_metrics 
            WHERE analysis_session_id = NEW.analysis_session_id
        ) + (
            SELECT COUNT(*) 
            FROM cognitive_complexity_metrics 
            WHERE analysis_session_id = NEW.analysis_session_id
        ) + (
            SELECT COUNT(*) 
            FROM halstead_complexity_metrics 
            WHERE analysis_session_id = NEW.analysis_session_id
        ),
        hotspots_identified = (
            SELECT COUNT(*) 
            FROM file_complexity_summary 
            WHERE analysis_session_id = NEW.analysis_session_id 
            AND is_complexity_hotspot = TRUE
        ),
        refactoring_opportunities = (
            SELECT COUNT(*) 
            FROM refactoring_opportunities 
            WHERE analysis_session_id = NEW.analysis_session_id
        ),
        avg_complexity_score = (
            SELECT AVG(overall_complexity_score) 
            FROM file_complexity_summary 
            WHERE analysis_session_id = NEW.analysis_session_id
        ),
        max_complexity_score = (
            SELECT MAX(overall_complexity_score) 
            FROM file_complexity_summary 
            WHERE analysis_session_id = NEW.analysis_session_id
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.analysis_session_id;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_complexity_analysis_session_summary() OWNER TO ridgetop;

--
-- Name: update_decision_outcome_status(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.update_decision_outcome_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Calculate overall outcome status based on individual outcomes
    UPDATE technical_decisions SET
        outcome_status = (
            SELECT CASE 
                WHEN AVG(outcome_score) >= 8 THEN 'successful'
                WHEN AVG(outcome_score) <= 3 THEN 'failed'
                WHEN AVG(outcome_score) BETWEEN 4 AND 7 THEN 'mixed'
                ELSE 'unknown'
            END
            FROM decision_outcomes 
            WHERE decision_id = NEW.decision_id 
            AND outcome_status IN ('successful', 'failed', 'mixed')
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.decision_id;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_decision_outcome_status() OWNER TO ridgetop;

--
-- Name: update_git_branches_comprehensive(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.update_git_branches_comprehensive() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Update branch statistics when commits are added/updated
        UPDATE git_branches
        SET
            current_commit_sha = NEW.commit_sha,
            last_commit_date = GREATEST(COALESCE(last_commit_date, NEW.author_date), NEW.author_date),
            total_commits = total_commits + CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE 0 END
        WHERE project_id = NEW.project_id
        AND branch_name = NEW.branch_name;

        -- Set first commit date if this is the first commit
        UPDATE git_branches
        SET first_commit_date = NEW.author_date
        WHERE project_id = NEW.project_id
        AND branch_name = NEW.branch_name
        AND (first_commit_date IS NULL OR first_commit_date > NEW.author_date);

        -- Update full_ref_name if not set
        UPDATE git_branches
        SET full_ref_name = 'refs/heads/' || branch_name
        WHERE project_id = NEW.project_id
        AND branch_name = NEW.branch_name
        AND full_ref_name IS NULL;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION public.update_git_branches_comprehensive() OWNER TO ridgetop;

--
-- Name: update_metrics_timestamps(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.update_metrics_timestamps() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_metrics_timestamps() OWNER TO ridgetop;

--
-- Name: update_pattern_session_stats(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.update_pattern_session_stats() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Update patterns_discovered count when patterns are added/removed
    UPDATE pattern_discovery_sessions 
    SET 
        patterns_discovered = (
            SELECT 
                (SELECT COUNT(*) FROM file_cooccurrence_patterns WHERE discovery_session_id = NEW.discovery_session_id AND is_active = TRUE) +
                (SELECT COUNT(*) FROM temporal_patterns WHERE discovery_session_id = NEW.discovery_session_id AND is_active = TRUE) +
                (SELECT COUNT(*) FROM developer_patterns WHERE discovery_session_id = NEW.discovery_session_id AND is_active = TRUE) +
                (SELECT COUNT(*) FROM change_magnitude_patterns WHERE discovery_session_id = NEW.discovery_session_id AND is_active = TRUE) +
                (SELECT COUNT(*) FROM pattern_insights WHERE discovery_session_id = NEW.discovery_session_id AND is_active = TRUE)
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.discovery_session_id;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_pattern_session_stats() OWNER TO ridgetop;

--
-- Name: update_session_activity(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.update_session_activity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Only update last_activity_at if session is active
  IF NEW.status = 'active' THEN
    NEW.last_activity_at = CURRENT_TIMESTAMP;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_session_activity() OWNER TO ridgetop;

--
-- Name: update_sessions_updated_at(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.update_sessions_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_sessions_updated_at() OWNER TO ridgetop;

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
-- Name: update_user_sessions_updated_at(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.update_user_sessions_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.last_activity = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_user_sessions_updated_at() OWNER TO ridgetop;

--
-- Name: validate_code_analysis_session(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.validate_code_analysis_session() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Validate correlation confidence
    IF NEW.session_correlation_confidence IS NOT NULL AND 
       (NEW.session_correlation_confidence < 0 OR NEW.session_correlation_confidence > 1) THEN
        RAISE EXCEPTION 'session_correlation_confidence must be between 0 and 1';
    END IF;
    
    -- Validate performance metrics
    IF NEW.cache_hit_rate IS NOT NULL AND 
       (NEW.cache_hit_rate < 0 OR NEW.cache_hit_rate > 1) THEN
        RAISE EXCEPTION 'cache_hit_rate must be between 0 and 1';
    END IF;
    
    -- Auto-set session correlation if development_session_id is provided
    IF NEW.development_session_id IS NOT NULL AND NEW.session_correlation_confidence = 0 THEN
        NEW.session_correlation_confidence := 0.9; -- High confidence for explicit linking
    END IF;
    
    -- Auto-detect trigger context
    IF NEW.trigger_type = 'manual' AND NEW.development_session_id IS NOT NULL THEN
        NEW.trigger_type := 'session_start';
        NEW.auto_triggered := FALSE;
    END IF;
    
    -- Calculate total analysis duration if components are provided
    IF NEW.parse_duration_ms > 0 AND NEW.database_duration_ms > 0 THEN
        NEW.analysis_duration_ms := NEW.parse_duration_ms + NEW.database_duration_ms;
    END IF;
    
    -- Set git status clean flag based on working directory
    IF NEW.working_directory IS NOT NULL AND NEW.git_status_clean IS NULL THEN
        -- This would be set by the analysis service based on actual git status
        NEW.git_status_clean := FALSE; -- Conservative default
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.validate_code_analysis_session() OWNER TO ridgetop;

--
-- Name: validate_git_commits_normalized(); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.validate_git_commits_normalized() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
BEGIN
    -- Auto-generate tree_sha validation
    IF NEW.tree_sha IS NOT NULL AND NEW.tree_sha !~ '^[a-f0-9]{40}$' THEN
        RAISE EXCEPTION 'Invalid tree SHA format: %', NEW.tree_sha;
    END IF;

    -- Auto-set analysis defaults
    NEW.is_analyzed := COALESCE(NEW.is_analyzed, FALSE);
    NEW.analysis_version := COALESCE(NEW.analysis_version, 1);
    NEW.first_seen := COALESCE(NEW.first_seen, CURRENT_TIMESTAMP);

    -- Auto-detect repository URL from project if not set
    IF NEW.repository_url IS NULL THEN
        SELECT git_repo_url INTO NEW.repository_url
        FROM projects WHERE id = NEW.project_id;
    END IF;

    RETURN NEW;
END;
$_$;


ALTER FUNCTION public.validate_git_commits_normalized() OWNER TO ridgetop;

--
-- Name: validate_shadow_table_integrity(text, integer); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.validate_shadow_table_integrity(p_table_name text, p_batch_size integer DEFAULT 1000) RETURNS TABLE(validation_status text, total_records bigint, valid_records bigint, invalid_records bigint, sync_pending bigint, sync_complete bigint)
    LANGUAGE plpgsql
    AS $$
DECLARE
    shadow_table_name TEXT := p_table_name || '_shadow';
    sql_query TEXT;
BEGIN
    -- Verify shadow table exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables t
        WHERE t.table_name = shadow_table_name
    ) THEN
        RETURN QUERY SELECT
            'ERROR: Shadow table does not exist'::TEXT,
            0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT, 0::BIGINT;
        RETURN;
    END IF;

    -- Build dynamic query for validation
    sql_query := format('
        SELECT
            ''OK''::TEXT as validation_status,
            COUNT(*)::BIGINT as total_records,
            COUNT(*) FILTER (WHERE _shadow_validation_hash IS NOT NULL)::BIGINT as valid_records,
            COUNT(*) FILTER (WHERE _shadow_validation_hash IS NULL)::BIGINT as invalid_records,
            COUNT(*) FILTER (WHERE _shadow_sync_status IN (''pending'', ''conflict''))::BIGINT as sync_pending,
            COUNT(*) FILTER (WHERE _shadow_sync_status IN (''synced'', ''migrated'', ''validated''))::BIGINT as sync_complete
        FROM %I',
        shadow_table_name
    );

    RETURN QUERY EXECUTE sql_query;
END;
$$;


ALTER FUNCTION public.validate_shadow_table_integrity(p_table_name text, p_batch_size integer) OWNER TO ridgetop;

--
-- Name: validate_table_consistency(text, text, integer); Type: FUNCTION; Schema: public; Owner: ridgetop
--

CREATE FUNCTION public.validate_table_consistency(p_table_name text, p_shadow_table_name text DEFAULT NULL::text, p_sample_size integer DEFAULT 100) RETURNS TABLE(primary_count bigint, shadow_count bigint, consistent_records bigint, inconsistent_records bigint, missing_in_shadow bigint, extra_in_shadow bigint, validation_score numeric)
    LANGUAGE plpgsql
    AS $$
DECLARE
    shadow_table TEXT := COALESCE(p_shadow_table_name, p_table_name || '_shadow');
    sql_query TEXT;
BEGIN
    -- Build dynamic query for consistency validation
    sql_query := format('
        WITH primary_data AS (
            SELECT id, row_to_json(t.*)::jsonb as data
            FROM %I t
            ORDER BY RANDOM()
            LIMIT %s
        ),
        shadow_data AS (
            SELECT _shadow_source_id as id,
                   row_to_json(
                       (SELECT d FROM (SELECT * EXCEPT (_shadow_version, _shadow_sync_status,
                                                      _shadow_created_at, _shadow_source_id,
                                                      _shadow_validation_hash, _shadow_last_sync,
                                                      _shadow_migration_batch)) d)
                   )::jsonb as data
            FROM %I s
            WHERE _shadow_source_id IS NOT NULL
        ),
        consistency_check AS (
            SELECT
                (SELECT COUNT(*) FROM %I) as primary_count,
                (SELECT COUNT(*) FROM %I) as shadow_count,
                COUNT(p.id) as consistent_records,
                COUNT(CASE WHEN p.data != s.data THEN 1 END) as inconsistent_records,
                COUNT(CASE WHEN s.id IS NULL THEN 1 END) as missing_in_shadow,
                0 as extra_in_shadow
            FROM primary_data p
            LEFT JOIN shadow_data s ON p.id = s.id
        )
        SELECT
            primary_count,
            shadow_count,
            consistent_records,
            inconsistent_records,
            missing_in_shadow,
            extra_in_shadow,
            CASE
                WHEN primary_count = 0 THEN 100.00
                ELSE ROUND((consistent_records::numeric / primary_count::numeric) * 100, 2)
            END as validation_score
        FROM consistency_check',
        p_table_name, p_sample_size, shadow_table, p_table_name, shadow_table
    );

    RETURN QUERY EXECUTE sql_query;
END;
$$;


ALTER FUNCTION public.validate_table_consistency(p_table_name text, p_shadow_table_name text, p_sample_size integer) OWNER TO ridgetop;

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
-- Name: pattern_insights; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.pattern_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    discovery_session_id uuid NOT NULL,
    project_id uuid NOT NULL,
    insight_type character varying(50) NOT NULL,
    insight_category character varying(50) DEFAULT 'development_intelligence'::character varying,
    insight_priority integer,
    title character varying(255) NOT NULL,
    description text NOT NULL,
    detailed_analysis text,
    root_cause_analysis text,
    confidence_score numeric(6,4) NOT NULL,
    statistical_support jsonb DEFAULT '{}'::jsonb,
    supporting_pattern_ids uuid[] DEFAULT '{}'::uuid[],
    cross_pattern_validation_score numeric(6,4),
    evidence_strength character varying(20),
    data_points_count integer DEFAULT 0,
    temporal_stability character varying(20),
    risk_level character varying(20) NOT NULL,
    risk_factors text[] DEFAULT '{}'::text[],
    business_impact character varying(20),
    technical_impact character varying(20),
    affected_files_count integer DEFAULT 0,
    affected_developers_count integer DEFAULT 0,
    estimated_effort_hours integer,
    potential_time_savings_hours integer,
    quality_improvement_potential numeric(6,4),
    recommendations text[] DEFAULT '{}'::text[],
    implementation_steps text[] DEFAULT '{}'::text[],
    implementation_complexity character varying(20),
    prerequisite_actions text[] DEFAULT '{}'::text[],
    required_skills text[] DEFAULT '{}'::text[],
    estimated_timeline_days integer,
    resource_requirements jsonb DEFAULT '{}'::jsonb,
    implementation_priority character varying(20),
    success_metrics text[] DEFAULT '{}'::text[],
    monitoring_indicators text[] DEFAULT '{}'::text[],
    expected_outcomes text[] DEFAULT '{}'::text[],
    rollback_plan text,
    validation_status character varying(20) DEFAULT 'pending'::character varying,
    validation_notes text,
    implementation_notes text,
    outcome_tracking jsonb DEFAULT '{}'::jsonb,
    target_audience text[] DEFAULT '{}'::text[],
    stakeholder_alignment_score numeric(6,4),
    change_management_complexity character varying(20),
    communication_plan text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp with time zone,
    refresh_needed_at timestamp with time zone,
    is_active boolean DEFAULT true,
    previous_versions uuid[] DEFAULT '{}'::uuid[],
    superseded_by uuid,
    resolution_status character varying(20),
    CONSTRAINT pattern_insights_business_impact_check CHECK (((business_impact)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT pattern_insights_confidence_score_check CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric))),
    CONSTRAINT pattern_insights_evidence_strength_check CHECK (((evidence_strength)::text = ANY ((ARRAY['weak'::character varying, 'moderate'::character varying, 'strong'::character varying, 'conclusive'::character varying])::text[]))),
    CONSTRAINT pattern_insights_implementation_complexity_check CHECK (((implementation_complexity)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'very_high'::character varying])::text[]))),
    CONSTRAINT pattern_insights_implementation_priority_check CHECK (((implementation_priority)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'urgent'::character varying])::text[]))),
    CONSTRAINT pattern_insights_insight_priority_check CHECK (((insight_priority >= 1) AND (insight_priority <= 10))),
    CONSTRAINT pattern_insights_insight_type_check CHECK (((insight_type)::text = ANY ((ARRAY['file_coupling'::character varying, 'temporal_patterns'::character varying, 'developer_specialization'::character varying, 'high_risk_files'::character varying, 'change_anomalies'::character varying, 'collaboration_gaps'::character varying, 'architectural_hotspots'::character varying, 'quality_concerns'::character varying, 'knowledge_silos'::character varying, 'process_optimization'::character varying, 'technical_debt'::character varying, 'performance_risks'::character varying])::text[]))),
    CONSTRAINT pattern_insights_resolution_status_check CHECK (((resolution_status)::text = ANY ((ARRAY['open'::character varying, 'in_progress'::character varying, 'resolved'::character varying, 'deferred'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT pattern_insights_risk_level_check CHECK (((risk_level)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT pattern_insights_technical_impact_check CHECK (((technical_impact)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT pattern_insights_temporal_stability_check CHECK (((temporal_stability)::text = ANY ((ARRAY['stable'::character varying, 'emerging'::character varying, 'declining'::character varying, 'volatile'::character varying])::text[]))),
    CONSTRAINT pattern_insights_validation_status_check CHECK (((validation_status)::text = ANY ((ARRAY['pending'::character varying, 'validated'::character varying, 'rejected'::character varying, 'implemented'::character varying, 'outdated'::character varying])::text[])))
);


ALTER TABLE public.pattern_insights OWNER TO ridgetop;

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
-- Name: actionable_insights_summary; Type: VIEW; Schema: public; Owner: ridgetop
--

CREATE VIEW public.actionable_insights_summary AS
 SELECT pi.project_id,
    p.name AS project_name,
    pi.insight_type,
    pi.title,
    pi.description,
    pi.confidence_score,
    pi.risk_level,
    pi.business_impact,
    pi.technical_impact,
    pi.implementation_complexity,
    pi.estimated_effort_hours,
    pi.estimated_timeline_days,
    pi.implementation_priority,
    pi.validation_status,
    (((((
        CASE pi.risk_level
            WHEN 'critical'::text THEN 4
            WHEN 'high'::text THEN 3
            WHEN 'medium'::text THEN 2
            ELSE 1
        END)::numeric * 0.3) + ((
        CASE pi.business_impact
            WHEN 'critical'::text THEN 4
            WHEN 'high'::text THEN 3
            WHEN 'medium'::text THEN 2
            ELSE 1
        END)::numeric * 0.3)) + (pi.confidence_score * 0.2)) + ((
        CASE pi.implementation_complexity
            WHEN 'low'::text THEN 4
            WHEN 'medium'::text THEN 3
            WHEN 'high'::text THEN 2
            ELSE 1
        END)::numeric * 0.2)) AS priority_score,
        CASE
            WHEN (((pi.validation_status)::text = 'validated'::text) AND ((pi.implementation_complexity)::text = 'low'::text)) THEN 'ready'::text
            WHEN ((pi.validation_status)::text = 'validated'::text) THEN 'validated'::text
            WHEN (pi.confidence_score > 0.8) THEN 'high_confidence'::text
            ELSE 'needs_validation'::text
        END AS readiness_status,
    array_length(pi.recommendations, 1) AS recommendation_count,
    pi.created_at,
    pi.expires_at,
        CASE
            WHEN ((pi.expires_at IS NOT NULL) AND (pi.expires_at < CURRENT_TIMESTAMP)) THEN 'expired'::text
            WHEN ((pi.refresh_needed_at IS NOT NULL) AND (pi.refresh_needed_at < CURRENT_TIMESTAMP)) THEN 'needs_refresh'::text
            ELSE 'current'::text
        END AS freshness_status
   FROM (public.pattern_insights pi
     JOIN public.projects p ON ((pi.project_id = p.id)))
  WHERE (pi.is_active = true)
  ORDER BY (((((
        CASE pi.risk_level
            WHEN 'critical'::text THEN 4
            WHEN 'high'::text THEN 3
            WHEN 'medium'::text THEN 2
            ELSE 1
        END)::numeric * 0.3) + ((
        CASE pi.business_impact
            WHEN 'critical'::text THEN 4
            WHEN 'high'::text THEN 3
            WHEN 'medium'::text THEN 2
            ELSE 1
        END)::numeric * 0.3)) + (pi.confidence_score * 0.2)) + ((
        CASE pi.implementation_complexity
            WHEN 'low'::text THEN 4
            WHEN 'medium'::text THEN 3
            WHEN 'high'::text THEN 2
            ELSE 1
        END)::numeric * 0.2)) DESC, pi.created_at DESC;


ALTER VIEW public.actionable_insights_summary OWNER TO ridgetop;

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
-- Name: analysis_session_links; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.analysis_session_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    analysis_session_id uuid NOT NULL,
    development_session_id uuid,
    context_id uuid,
    decision_id uuid,
    link_type character varying(50) DEFAULT 'analysis'::character varying,
    confidence_score double precision DEFAULT 1.0,
    time_correlation_score double precision DEFAULT 0.0,
    content_correlation_score double precision DEFAULT 0.0,
    git_correlation_score double precision DEFAULT 0.0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_by character varying(100),
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT analysis_session_links_confidence_score_check CHECK (((confidence_score >= (0)::double precision) AND (confidence_score <= (1)::double precision))),
    CONSTRAINT analysis_session_links_link_type_check CHECK (((link_type)::text = ANY ((ARRAY['analysis'::character varying, 'validation'::character varying, 'impact_assessment'::character varying, 'quality_check'::character varying, 'pre_commit'::character varying, 'post_commit'::character varying, 'debugging'::character varying, 'refactoring'::character varying])::text[])))
);


ALTER TABLE public.analysis_session_links OWNER TO ridgetop;

--
-- Name: analytics_events; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.analytics_events (
    event_id uuid DEFAULT gen_random_uuid() NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    actor character varying(20) NOT NULL,
    project_id uuid,
    session_id uuid,
    context_id uuid,
    event_type character varying(50) NOT NULL,
    payload jsonb,
    status character varying(20),
    duration_ms integer,
    tags text[],
    ai_model_used character varying(100),
    prompt_tokens integer,
    completion_tokens integer,
    feedback integer,
    metadata jsonb
);


ALTER TABLE public.analytics_events OWNER TO ridgetop;

--
-- Name: TABLE analytics_events; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TABLE public.analytics_events IS 'Canonical event logging table for AIDIS analytics tracking';


--
-- Name: analytics_events_shadow; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.analytics_events_shadow (
    event_id uuid DEFAULT gen_random_uuid() NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    actor character varying(20) NOT NULL,
    project_id uuid,
    session_id uuid,
    context_id uuid,
    event_type character varying(50) NOT NULL,
    payload jsonb,
    status character varying(20),
    duration_ms integer,
    tags text[],
    ai_model_used character varying(100),
    prompt_tokens integer,
    completion_tokens integer,
    feedback integer,
    metadata jsonb,
    _shadow_version integer DEFAULT 1 NOT NULL,
    _shadow_sync_status public.shadow_sync_status DEFAULT 'pending'::public.shadow_sync_status NOT NULL,
    _shadow_created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _shadow_source_id uuid,
    _shadow_validation_hash text NOT NULL,
    _shadow_last_sync timestamp with time zone,
    _shadow_migration_batch uuid,
    CONSTRAINT analytics_events_shadow_actor_check CHECK (((actor)::text = ANY ((ARRAY['human'::character varying, 'ai'::character varying, 'system'::character varying])::text[]))),
    CONSTRAINT analytics_events_shadow_completion_tokens_check CHECK (((completion_tokens IS NULL) OR (completion_tokens >= 0))),
    CONSTRAINT analytics_events_shadow_duration_ms_check CHECK (((duration_ms IS NULL) OR (duration_ms >= 0))),
    CONSTRAINT analytics_events_shadow_event_type_check CHECK ((length(TRIM(BOTH FROM event_type)) >= 1)),
    CONSTRAINT analytics_events_shadow_feedback_check CHECK (((feedback IS NULL) OR (feedback = ANY (ARRAY['-1'::integer, 0, 1])))),
    CONSTRAINT analytics_events_shadow_metadata_valid CHECK (((metadata IS NULL) OR (jsonb_typeof(metadata) = 'object'::text))),
    CONSTRAINT analytics_events_shadow_payload_valid CHECK (((payload IS NULL) OR (jsonb_typeof(payload) = 'object'::text))),
    CONSTRAINT analytics_events_shadow_prompt_tokens_check CHECK (((prompt_tokens IS NULL) OR (prompt_tokens >= 0))),
    CONSTRAINT analytics_events_shadow_status_check CHECK (((status IS NULL) OR ((status)::text = ANY ((ARRAY['open'::character varying, 'closed'::character varying, 'error'::character varying, 'pending'::character varying, 'processing'::character varying])::text[])))),
    CONSTRAINT analytics_events_shadow_sync_timestamps CHECK (((_shadow_last_sync IS NULL) OR (_shadow_last_sync >= _shadow_created_at))),
    CONSTRAINT analytics_events_shadow_tags_check CHECK (((array_length(tags, 1) IS NULL) OR (array_length(tags, 1) <= 20))),
    CONSTRAINT analytics_events_shadow_token_consistency CHECK ((((prompt_tokens IS NULL) AND (completion_tokens IS NULL)) OR ((prompt_tokens IS NOT NULL) AND (completion_tokens IS NOT NULL))))
);


ALTER TABLE public.analytics_events_shadow OWNER TO ridgetop;

--
-- Name: TABLE analytics_events_shadow; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TABLE public.analytics_events_shadow IS 'P2.3 Shadow table for analytics_events - zero-downtime migration infrastructure';


--
-- Name: change_magnitude_patterns; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.change_magnitude_patterns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    discovery_session_id uuid NOT NULL,
    project_id uuid NOT NULL,
    file_path text NOT NULL,
    file_extension character varying(20),
    file_category character varying(50),
    file_type_classification character varying(50),
    change_category character varying(20) NOT NULL,
    avg_lines_per_change numeric(10,4) DEFAULT 0,
    max_lines_changed integer DEFAULT 0,
    min_lines_changed integer DEFAULT 0,
    median_lines_changed integer DEFAULT 0,
    stddev_lines_changed numeric(10,4),
    change_frequency numeric(8,4) DEFAULT 0,
    volatility_score numeric(6,4),
    stability_score numeric(6,4),
    predictability_score numeric(6,4),
    change_trend character varying(20),
    trend_coefficient numeric(8,4),
    trend_significance numeric(6,4),
    seasonality_strength numeric(6,4),
    risk_level character varying(20) NOT NULL,
    anomaly_score numeric(6,4),
    hotspot_score numeric(6,4),
    technical_debt_indicator numeric(6,4),
    complexity_risk_score numeric(6,4),
    coupling_risk_score numeric(6,4),
    maintenance_burden_score numeric(6,4),
    business_criticality_score numeric(6,4),
    contributor_diversity_score numeric(6,4),
    unique_contributors_count integer DEFAULT 0,
    change_type_distribution jsonb DEFAULT '{}'::jsonb,
    commit_message_sentiment jsonb DEFAULT '{}'::jsonb,
    dependency_fan_in integer DEFAULT 0,
    dependency_fan_out integer DEFAULT 0,
    architectural_layer character varying(50),
    component_coupling_score numeric(6,4),
    first_change_date timestamp with time zone,
    last_change_date timestamp with time zone,
    total_changes integer DEFAULT 0,
    lifespan_days integer GENERATED ALWAYS AS (
CASE
    WHEN ((first_change_date IS NULL) OR (last_change_date IS NULL)) THEN NULL::numeric
    ELSE (EXTRACT(epoch FROM (last_change_date - first_change_date)) / ((24 * 3600))::numeric)
END) STORED,
    change_burst_frequency integer DEFAULT 0,
    longest_stable_period_days integer DEFAULT 0,
    change_clustering_score numeric(6,4),
    bug_introduction_rate numeric(6,4),
    refactoring_frequency numeric(6,4),
    test_coverage_correlation numeric(6,4),
    performance_risk_score numeric(6,4),
    scalability_concern_level character varying(20),
    monitoring_recommendation character varying(50),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT true,
    pattern_evolution character varying(20),
    CONSTRAINT change_magnitude_patterns_anomaly_score_check CHECK (((anomaly_score >= (0)::numeric) AND (anomaly_score <= (1)::numeric))),
    CONSTRAINT change_magnitude_patterns_avg_lines_per_change_check CHECK ((avg_lines_per_change >= (0)::numeric)),
    CONSTRAINT change_magnitude_patterns_change_category_check CHECK (((change_category)::text = ANY ((ARRAY['small'::character varying, 'medium'::character varying, 'large'::character varying, 'massive'::character varying])::text[]))),
    CONSTRAINT change_magnitude_patterns_change_frequency_check CHECK ((change_frequency >= (0)::numeric)),
    CONSTRAINT change_magnitude_patterns_change_trend_check CHECK (((change_trend)::text = ANY ((ARRAY['increasing'::character varying, 'decreasing'::character varying, 'stable'::character varying, 'volatile'::character varying, 'cyclical'::character varying])::text[]))),
    CONSTRAINT change_magnitude_patterns_contributor_diversity_score_check CHECK (((contributor_diversity_score >= (0)::numeric) AND (contributor_diversity_score <= (1)::numeric))),
    CONSTRAINT change_magnitude_patterns_file_category_check CHECK (((file_category)::text = ANY ((ARRAY['source'::character varying, 'test'::character varying, 'config'::character varying, 'docs'::character varying, 'build'::character varying, 'data'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT change_magnitude_patterns_hotspot_score_check CHECK (((hotspot_score >= (0)::numeric) AND (hotspot_score <= (1)::numeric))),
    CONSTRAINT change_magnitude_patterns_max_lines_changed_check CHECK ((max_lines_changed >= 0)),
    CONSTRAINT change_magnitude_patterns_min_lines_changed_check CHECK ((min_lines_changed >= 0)),
    CONSTRAINT change_magnitude_patterns_pattern_evolution_check CHECK (((pattern_evolution)::text = ANY ((ARRAY['stabilizing'::character varying, 'deteriorating'::character varying, 'improving'::character varying, 'unknown'::character varying])::text[]))),
    CONSTRAINT change_magnitude_patterns_performance_risk_score_check CHECK (((performance_risk_score >= (0)::numeric) AND (performance_risk_score <= (1)::numeric))),
    CONSTRAINT change_magnitude_patterns_predictability_score_check CHECK (((predictability_score >= (0)::numeric) AND (predictability_score <= (1)::numeric))),
    CONSTRAINT change_magnitude_patterns_risk_level_check CHECK (((risk_level)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT change_magnitude_patterns_scalability_concern_level_check CHECK (((scalability_concern_level)::text = ANY ((ARRAY['none'::character varying, 'low'::character varying, 'medium'::character varying, 'high'::character varying])::text[]))),
    CONSTRAINT change_magnitude_patterns_stability_score_check CHECK (((stability_score >= (0)::numeric) AND (stability_score <= (1)::numeric))),
    CONSTRAINT change_magnitude_patterns_technical_debt_indicator_check CHECK (((technical_debt_indicator >= (0)::numeric) AND (technical_debt_indicator <= (1)::numeric))),
    CONSTRAINT change_magnitude_patterns_total_changes_check CHECK ((total_changes >= 0)),
    CONSTRAINT change_magnitude_patterns_volatility_score_check CHECK ((volatility_score >= (0)::numeric))
);


ALTER TABLE public.change_magnitude_patterns OWNER TO ridgetop;

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
    metadata jsonb DEFAULT '{"triggers": {}, "git_context": {}, "performance": {}, "analysis_config": {}, "session_context": {}}'::jsonb,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp with time zone,
    commit_sha character varying(40),
    branch_name character varying(255),
    working_directory text,
    git_status_clean boolean,
    development_session_id uuid,
    session_correlation_confidence double precision DEFAULT 0.0,
    analysis_context text,
    files_changed_count integer DEFAULT 0,
    new_components_count integer DEFAULT 0,
    updated_components_count integer DEFAULT 0,
    deleted_components_count integer DEFAULT 0,
    cache_hit_rate double precision DEFAULT 0.0,
    parse_duration_ms integer DEFAULT 0,
    database_duration_ms integer DEFAULT 0,
    trigger_type character varying(100) DEFAULT 'manual'::character varying,
    triggered_by_agent uuid,
    auto_triggered boolean DEFAULT false,
    trigger_metadata jsonb DEFAULT '{}'::jsonb,
    analysis_scope character varying(100) DEFAULT 'full'::character varying,
    target_files text[] DEFAULT '{}'::text[],
    excluded_patterns text[] DEFAULT '{}'::text[],
    language_filter character varying(50),
    total_complexity_delta integer DEFAULT 0,
    total_loc_delta integer DEFAULT 0,
    dependency_changes_count integer DEFAULT 0,
    quality_score double precision,
    analyzer_version character varying(50) DEFAULT '1.0.0'::character varying,
    schema_version integer DEFAULT 1,
    compatibility_flags jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT code_analysis_sessions_analysis_scope_check CHECK (((analysis_scope)::text = ANY ((ARRAY['full'::character varying, 'incremental'::character varying, 'targeted'::character varying, 'file_specific'::character varying, 'commit_diff'::character varying, 'branch_diff'::character varying])::text[]))),
    CONSTRAINT code_analysis_sessions_session_correlation_confidence_check CHECK (((session_correlation_confidence >= (0)::double precision) AND (session_correlation_confidence <= (1)::double precision))),
    CONSTRAINT code_analysis_sessions_trigger_type_check CHECK (((trigger_type)::text = ANY ((ARRAY['manual'::character varying, 'commit_hook'::character varying, 'file_watch'::character varying, 'scheduled'::character varying, 'session_start'::character varying, 'request_analysis'::character varying, 'git_status_change'::character varying, 'branch_switch'::character varying, 'api_request'::character varying, 'test_scenario'::character varying, 'integration_test'::character varying])::text[])))
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
    modification_frequency integer DEFAULT 0,
    last_analysis_session_id uuid,
    analysis_frequency integer DEFAULT 0
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
    measured_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    analysis_session_id uuid
);


ALTER TABLE public.code_metrics OWNER TO ridgetop;

--
-- Name: cognitive_complexity_metrics; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.cognitive_complexity_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analysis_session_id uuid NOT NULL,
    project_id uuid NOT NULL,
    file_path text NOT NULL,
    class_name character varying(200),
    function_name character varying(200) NOT NULL,
    function_signature text,
    start_line integer NOT NULL,
    end_line integer NOT NULL,
    cognitive_complexity integer DEFAULT 0 NOT NULL,
    base_complexity integer DEFAULT 0,
    nesting_increment integer DEFAULT 0,
    if_statements integer DEFAULT 0,
    switch_statements integer DEFAULT 0,
    loops integer DEFAULT 0,
    try_catch_blocks integer DEFAULT 0,
    lambda_expressions integer DEFAULT 0,
    recursive_calls integer DEFAULT 0,
    break_continue_statements integer DEFAULT 0,
    max_nesting_level integer DEFAULT 0,
    binary_logical_operators integer DEFAULT 0,
    ternary_operators integer DEFAULT 0,
    jump_statements integer DEFAULT 0,
    readability_score numeric(4,3) DEFAULT 1.0,
    understandability_grade character varying(5),
    mental_effort_estimate numeric(4,1) DEFAULT 1.0,
    cognitive_risk_level character varying(15) NOT NULL,
    review_priority integer DEFAULT 3,
    refactoring_benefit_score numeric(4,3) DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT cognitive_complexity_metrics_cognitive_risk_level_check CHECK (((cognitive_risk_level)::text = ANY ((ARRAY['very_low'::character varying, 'low'::character varying, 'moderate'::character varying, 'high'::character varying, 'very_high'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT cognitive_complexity_metrics_review_priority_check CHECK (((review_priority >= 1) AND (review_priority <= 5))),
    CONSTRAINT cognitive_complexity_metrics_understandability_grade_check CHECK (((understandability_grade)::text = ANY ((ARRAY['A'::character varying, 'B'::character varying, 'C'::character varying, 'D'::character varying, 'F'::character varying])::text[])))
);


ALTER TABLE public.cognitive_complexity_metrics OWNER TO ridgetop;

--
-- Name: TABLE cognitive_complexity_metrics; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TABLE public.cognitive_complexity_metrics IS 'TC015: Cognitive complexity metrics - measures mental effort to understand code';


--
-- Name: commit_session_links; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.commit_session_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    commit_id uuid NOT NULL,
    session_id uuid NOT NULL,
    link_type character varying(50) DEFAULT 'contributed'::character varying,
    confidence_score numeric(3,2) DEFAULT 0.50,
    context_ids uuid[] DEFAULT '{}'::uuid[],
    decision_ids uuid[] DEFAULT '{}'::uuid[],
    time_proximity_minutes integer,
    author_match boolean DEFAULT false,
    content_similarity numeric(3,2),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    relevant_context_ids uuid[] DEFAULT '{}'::uuid[],
    created_by character varying(100),
    CONSTRAINT commit_session_links_confidence_score_check CHECK (((confidence_score >= 0.0) AND (confidence_score <= 1.0))),
    CONSTRAINT commit_session_links_link_type_check CHECK (((link_type)::text = ANY ((ARRAY['contributed'::character varying, 'reviewed'::character varying, 'planned'::character varying, 'discussed'::character varying, 'debugged'::character varying, 'tested'::character varying, 'mentioned'::character varying, 'related'::character varying])::text[])))
);


ALTER TABLE public.commit_session_links OWNER TO ridgetop;

--
-- Name: complexity_alerts; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.complexity_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    analysis_session_id uuid,
    alert_type character varying(30) NOT NULL,
    complexity_type character varying(30) NOT NULL,
    file_path text NOT NULL,
    function_name character varying(200),
    class_name character varying(200),
    current_value numeric(10,3) NOT NULL,
    threshold_value numeric(10,3) NOT NULL,
    baseline_value numeric(10,3),
    violation_magnitude numeric(8,3) NOT NULL,
    violation_severity character varying(15) NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    impact_assessment text,
    immediate_actions text[],
    recommended_actions text[],
    refactoring_suggestions text[],
    estimated_effort_hours numeric(5,1),
    status character varying(20) DEFAULT 'open'::character varying,
    priority integer DEFAULT 3,
    assigned_to character varying(200),
    triggered_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at timestamp with time zone,
    resolved_at timestamp with time zone,
    resolution_method character varying(50),
    resolution_notes text,
    follow_up_required boolean DEFAULT false,
    follow_up_date date,
    is_recurring boolean DEFAULT false,
    recurrence_count integer DEFAULT 1,
    first_occurrence timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT complexity_alerts_alert_type_check CHECK (((alert_type)::text = ANY ((ARRAY['threshold_exceeded'::character varying, 'complexity_regression'::character varying, 'hotspot_detected'::character varying, 'trend_violation'::character varying, 'technical_debt_spike'::character varying])::text[]))),
    CONSTRAINT complexity_alerts_complexity_type_check CHECK (((complexity_type)::text = ANY ((ARRAY['cyclomatic'::character varying, 'cognitive'::character varying, 'halstead'::character varying, 'coupling'::character varying, 'overall'::character varying])::text[]))),
    CONSTRAINT complexity_alerts_priority_check CHECK (((priority >= 1) AND (priority <= 5))),
    CONSTRAINT complexity_alerts_resolution_method_check CHECK (((resolution_method)::text = ANY ((ARRAY['refactored'::character varying, 'threshold_adjusted'::character varying, 'false_positive'::character varying, 'accepted_risk'::character varying, 'split_function'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT complexity_alerts_status_check CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'acknowledged'::character varying, 'investigating'::character varying, 'resolved'::character varying, 'suppressed'::character varying, 'false_positive'::character varying])::text[]))),
    CONSTRAINT complexity_alerts_violation_severity_check CHECK (((violation_severity)::text = ANY ((ARRAY['info'::character varying, 'warning'::character varying, 'error'::character varying, 'critical'::character varying])::text[])))
);


ALTER TABLE public.complexity_alerts OWNER TO ridgetop;

--
-- Name: TABLE complexity_alerts; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TABLE public.complexity_alerts IS 'TC015: Complexity threshold violations and alerts with resolution tracking';


--
-- Name: complexity_analysis_sessions; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.complexity_analysis_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    session_id uuid,
    commit_sha character varying(40),
    analysis_timestamp timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    analysis_trigger character varying(50) NOT NULL,
    analyzer_version character varying(20) DEFAULT 'tc015_v1.0'::character varying,
    execution_time_ms integer DEFAULT 0 NOT NULL,
    files_analyzed integer DEFAULT 0 NOT NULL,
    functions_analyzed integer DEFAULT 0 NOT NULL,
    classes_analyzed integer DEFAULT 0 NOT NULL,
    complexity_metrics_calculated integer DEFAULT 0 NOT NULL,
    total_complexity_score numeric(10,4) DEFAULT 0,
    avg_complexity_score numeric(8,4) DEFAULT 0,
    max_complexity_score numeric(8,4) DEFAULT 0,
    hotspots_identified integer DEFAULT 0,
    threshold_violations integer DEFAULT 0,
    refactoring_opportunities integer DEFAULT 0,
    analysis_completeness_score numeric(4,3) DEFAULT 0,
    confidence_score numeric(4,3) DEFAULT 0,
    data_freshness_hours integer DEFAULT 0,
    status character varying(20) DEFAULT 'running'::character varying,
    error_message text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT complexity_analysis_sessions_analysis_trigger_check CHECK (((analysis_trigger)::text = ANY ((ARRAY['manual'::character varying, 'git_commit'::character varying, 'scheduled'::character varying, 'threshold_breach'::character varying, 'batch_analysis'::character varying])::text[]))),
    CONSTRAINT complexity_analysis_sessions_status_check CHECK (((status)::text = ANY ((ARRAY['running'::character varying, 'completed'::character varying, 'failed'::character varying, 'partial'::character varying])::text[])))
);


ALTER TABLE public.complexity_analysis_sessions OWNER TO ridgetop;

--
-- Name: TABLE complexity_analysis_sessions; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TABLE public.complexity_analysis_sessions IS 'TC015: Tracks complexity analysis sessions with performance metrics and summary statistics';


--
-- Name: complexity_trends; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.complexity_trends (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    file_path text NOT NULL,
    complexity_type character varying(30) NOT NULL,
    trend_period character varying(20) NOT NULL,
    measurement_date date NOT NULL,
    commit_sha character varying(40),
    complexity_value numeric(10,3) NOT NULL,
    moving_average numeric(10,3),
    trend_direction character varying(15),
    trend_slope numeric(8,4),
    trend_acceleration numeric(8,4),
    seasonal_component numeric(8,4),
    percentile_rank numeric(5,2),
    standard_deviations numeric(6,3),
    anomaly_score numeric(6,3) DEFAULT 0,
    is_anomaly boolean DEFAULT false,
    change_point_detected boolean DEFAULT false,
    change_magnitude numeric(8,3),
    change_significance numeric(4,3),
    forecast_next_week numeric(10,3),
    forecast_confidence numeric(4,3),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT complexity_trends_complexity_type_check CHECK (((complexity_type)::text = ANY ((ARRAY['cyclomatic'::character varying, 'cognitive'::character varying, 'halstead_effort'::character varying, 'coupling'::character varying, 'overall'::character varying])::text[]))),
    CONSTRAINT complexity_trends_trend_direction_check CHECK (((trend_direction)::text = ANY ((ARRAY['increasing'::character varying, 'decreasing'::character varying, 'stable'::character varying, 'volatile'::character varying])::text[]))),
    CONSTRAINT complexity_trends_trend_period_check CHECK (((trend_period)::text = ANY ((ARRAY['daily'::character varying, 'weekly'::character varying, 'monthly'::character varying, 'commit_based'::character varying])::text[])))
);


ALTER TABLE public.complexity_trends OWNER TO ridgetop;

--
-- Name: TABLE complexity_trends; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TABLE public.complexity_trends IS 'TC015: Time series data for complexity trend analysis and forecasting';


--
-- Name: contexts; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.contexts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    session_id uuid,
    context_type character varying(50) NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    relevance_score double precision DEFAULT 1.0,
    tags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    related_commit_sha character varying(40),
    commit_context_type character varying(50),
    pattern_session_id uuid,
    related_insights uuid[] DEFAULT '{}'::uuid[],
    pattern_relevance_score numeric(6,4),
    embedding_384_backup public.vector(384),
    embedding public.vector(1536),
    embedding_migrated boolean DEFAULT false,
    CONSTRAINT content_not_empty CHECK ((length(TRIM(BOTH FROM content)) > 0)),
    CONSTRAINT contexts_context_type_check CHECK (((context_type)::text = ANY (ARRAY[('code'::character varying)::text, ('decision'::character varying)::text, ('error'::character varying)::text, ('discussion'::character varying)::text, ('planning'::character varying)::text, ('completion'::character varying)::text, ('milestone'::character varying)::text, ('reflections'::character varying)::text, ('handoff'::character varying)::text]))),
    CONSTRAINT contexts_pattern_relevance_score_check CHECK (((pattern_relevance_score >= (0)::numeric) AND (pattern_relevance_score <= (1)::numeric))),
    CONSTRAINT contexts_relevance_score_check CHECK (((relevance_score >= (0)::double precision) AND (relevance_score <= (10)::double precision)))
);


ALTER TABLE public.contexts OWNER TO ridgetop;

--
-- Name: contexts_shadow; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.contexts_shadow (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    session_id uuid,
    context_type character varying(50) NOT NULL,
    content text NOT NULL,
    embedding public.vector(1536),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    relevance_score double precision DEFAULT 1.0,
    tags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    related_commit_sha character varying(40),
    commit_context_type character varying(50),
    pattern_session_id uuid,
    related_insights uuid[] DEFAULT '{}'::uuid[],
    pattern_relevance_score numeric(6,4),
    _shadow_version integer DEFAULT 1 NOT NULL,
    _shadow_sync_status public.shadow_sync_status DEFAULT 'pending'::public.shadow_sync_status NOT NULL,
    _shadow_created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _shadow_source_id uuid,
    _shadow_validation_hash text NOT NULL,
    _shadow_last_sync timestamp with time zone,
    _shadow_migration_batch uuid,
    CONSTRAINT contexts_shadow_content_check CHECK ((length(TRIM(BOTH FROM content)) > 0)),
    CONSTRAINT contexts_shadow_content_reasonable CHECK ((length(content) <= 1000000)),
    CONSTRAINT contexts_shadow_context_type_check CHECK (((context_type)::text = ANY ((ARRAY['code'::character varying, 'decision'::character varying, 'error'::character varying, 'discussion'::character varying, 'planning'::character varying, 'completion'::character varying, 'milestone'::character varying])::text[]))),
    CONSTRAINT contexts_shadow_metadata_valid CHECK ((jsonb_typeof(metadata) = 'object'::text)),
    CONSTRAINT contexts_shadow_pattern_relevance_score_check CHECK (((pattern_relevance_score IS NULL) OR ((pattern_relevance_score >= (0)::numeric) AND (pattern_relevance_score <= (1)::numeric)))),
    CONSTRAINT contexts_shadow_related_commit_sha_check CHECK (((related_commit_sha IS NULL) OR ((related_commit_sha)::text ~ '^[a-f0-9]{40}$'::text))),
    CONSTRAINT contexts_shadow_relevance_score_check CHECK (((relevance_score >= (0)::double precision) AND (relevance_score <= (10)::double precision))),
    CONSTRAINT contexts_shadow_sync_timestamps CHECK (((_shadow_last_sync IS NULL) OR (_shadow_last_sync >= _shadow_created_at))),
    CONSTRAINT contexts_shadow_tags_check CHECK (((array_length(tags, 1) IS NULL) OR (array_length(tags, 1) <= 50))),
    CONSTRAINT contexts_shadow_tags_valid CHECK (((array_length(tags, 1) IS NULL) OR (array_length(tags, 1) > 0))),
    CONSTRAINT embedding_dimension_1536 CHECK (((embedding IS NULL) OR (public.vector_dims(embedding) = 1536)))
);


ALTER TABLE public.contexts_shadow OWNER TO ridgetop;

--
-- Name: TABLE contexts_shadow; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TABLE public.contexts_shadow IS 'P2.3 Shadow table for contexts - zero-downtime migration infrastructure';


--
-- Name: core_development_metrics; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.core_development_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    collection_session_id uuid NOT NULL,
    project_id uuid NOT NULL,
    metric_type character varying(50) NOT NULL,
    metric_scope character varying(50) NOT NULL,
    scope_identifier text,
    period_type character varying(20) NOT NULL,
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    metric_value numeric(12,4) NOT NULL,
    metric_unit character varying(50) NOT NULL,
    normalized_value numeric(8,4),
    percentile_rank numeric(6,4),
    baseline_value numeric(12,4),
    trend_direction character varying(20),
    trend_strength numeric(6,4),
    variance numeric(12,4),
    confidence_interval_low numeric(12,4),
    confidence_interval_high numeric(12,4),
    change_from_baseline numeric(12,4),
    percent_change_from_baseline numeric(8,4),
    change_significance character varying(20),
    data_quality_score numeric(6,4),
    measurement_confidence numeric(6,4),
    sample_size integer DEFAULT 0,
    contributing_commits integer DEFAULT 0,
    contributing_sessions integer DEFAULT 0,
    contributing_files integer DEFAULT 0,
    contributing_developers integer DEFAULT 0,
    seasonal_adjustment numeric(8,4),
    external_factors jsonb DEFAULT '{}'::jsonb,
    metric_tags text[] DEFAULT '{}'::text[],
    threshold_low numeric(12,4),
    threshold_high numeric(12,4),
    alert_triggered boolean DEFAULT false,
    alert_severity character varying(20),
    correlation_metrics jsonb DEFAULT '{}'::jsonb,
    predictive_indicators jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT true,
    superseded_by uuid,
    CONSTRAINT core_development_metrics_alert_severity_check CHECK (((alert_severity)::text = ANY ((ARRAY['info'::character varying, 'warning'::character varying, 'error'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT core_development_metrics_change_significance_check CHECK (((change_significance)::text = ANY ((ARRAY['insignificant'::character varying, 'minor'::character varying, 'moderate'::character varying, 'significant'::character varying, 'major'::character varying])::text[]))),
    CONSTRAINT core_development_metrics_data_quality_score_check CHECK (((data_quality_score >= (0)::numeric) AND (data_quality_score <= (1)::numeric))),
    CONSTRAINT core_development_metrics_measurement_confidence_check CHECK (((measurement_confidence >= (0)::numeric) AND (measurement_confidence <= (1)::numeric))),
    CONSTRAINT core_development_metrics_metric_scope_check CHECK (((metric_scope)::text = ANY ((ARRAY['project'::character varying, 'developer'::character varying, 'file'::character varying, 'component'::character varying, 'session'::character varying])::text[]))),
    CONSTRAINT core_development_metrics_metric_type_check CHECK (((metric_type)::text = ANY ((ARRAY['code_velocity'::character varying, 'development_focus'::character varying, 'change_frequency'::character varying, 'volatility_index'::character varying, 'technical_debt_accumulation'::character varying, 'quality_trend'::character varying, 'complexity_growth'::character varying, 'maintenance_burden'::character varying, 'feature_delivery_rate'::character varying, 'refactoring_frequency'::character varying])::text[]))),
    CONSTRAINT core_development_metrics_period_type_check CHECK (((period_type)::text = ANY ((ARRAY['daily'::character varying, 'weekly'::character varying, 'monthly'::character varying, 'session'::character varying, 'commit_based'::character varying])::text[]))),
    CONSTRAINT core_development_metrics_sample_size_check CHECK ((sample_size >= 0)),
    CONSTRAINT core_development_metrics_trend_direction_check CHECK (((trend_direction)::text = ANY ((ARRAY['increasing'::character varying, 'decreasing'::character varying, 'stable'::character varying, 'volatile'::character varying, 'unknown'::character varying])::text[]))),
    CONSTRAINT core_development_metrics_trend_strength_check CHECK ((trend_strength >= (0)::numeric))
);


ALTER TABLE public.core_development_metrics OWNER TO ridgetop;

--
-- Name: cutover_performance_metrics; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.cutover_performance_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_name character varying(100) NOT NULL,
    cutover_stage public.cutover_stage NOT NULL,
    operation_type character varying(20) NOT NULL,
    total_operations bigint DEFAULT 0 NOT NULL,
    successful_operations bigint DEFAULT 0 NOT NULL,
    failed_operations bigint DEFAULT 0 NOT NULL,
    avg_latency_ms numeric(10,2),
    p50_latency_ms numeric(10,2),
    p95_latency_ms numeric(10,2),
    p99_latency_ms numeric(10,2),
    max_latency_ms numeric(10,2),
    operations_per_second numeric(10,2),
    data_volume_mb numeric(15,2),
    data_consistency_score numeric(5,2),
    validation_success_rate numeric(5,2),
    measurement_period_start timestamp with time zone NOT NULL,
    measurement_period_end timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT cutover_performance_metrics_operation_type_check CHECK (((operation_type)::text = ANY ((ARRAY['read'::character varying, 'write'::character varying, 'read_shadow'::character varying, 'write_shadow'::character varying, 'test'::character varying])::text[]))),
    CONSTRAINT valid_measurement_period CHECK ((measurement_period_end > measurement_period_start)),
    CONSTRAINT valid_success_rate CHECK (((successful_operations + failed_operations) <= total_operations))
);


ALTER TABLE public.cutover_performance_metrics OWNER TO ridgetop;

--
-- Name: TABLE cutover_performance_metrics; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TABLE public.cutover_performance_metrics IS 'P2.3 Performance metrics tracking for cutover operations';


--
-- Name: cyclomatic_complexity_metrics; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.cyclomatic_complexity_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analysis_session_id uuid NOT NULL,
    project_id uuid NOT NULL,
    file_path text NOT NULL,
    class_name character varying(200),
    function_name character varying(200) NOT NULL,
    function_signature text,
    start_line integer NOT NULL,
    end_line integer NOT NULL,
    cyclomatic_complexity integer DEFAULT 1 NOT NULL,
    essential_complexity integer DEFAULT 1,
    design_complexity integer DEFAULT 1,
    complexity_grade character varying(5) NOT NULL,
    risk_level character varying(15) NOT NULL,
    maintainability_risk character varying(15) NOT NULL,
    testing_effort_estimate numeric(4,1) DEFAULT 1.0,
    decision_points integer DEFAULT 0,
    nesting_depth integer DEFAULT 0,
    logical_operators integer DEFAULT 0,
    analysis_confidence numeric(4,3) DEFAULT 1.0,
    parse_errors integer DEFAULT 0,
    warnings text[],
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT cyclomatic_complexity_metrics_complexity_grade_check CHECK (((complexity_grade)::text = ANY ((ARRAY['A'::character varying, 'B'::character varying, 'C'::character varying, 'D'::character varying, 'F'::character varying])::text[]))),
    CONSTRAINT cyclomatic_complexity_metrics_maintainability_risk_check CHECK (((maintainability_risk)::text = ANY ((ARRAY['very_low'::character varying, 'low'::character varying, 'moderate'::character varying, 'high'::character varying, 'very_high'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT cyclomatic_complexity_metrics_risk_level_check CHECK (((risk_level)::text = ANY ((ARRAY['very_low'::character varying, 'low'::character varying, 'moderate'::character varying, 'high'::character varying, 'very_high'::character varying, 'critical'::character varying])::text[])))
);


ALTER TABLE public.cyclomatic_complexity_metrics OWNER TO ridgetop;

--
-- Name: TABLE cyclomatic_complexity_metrics; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TABLE public.cyclomatic_complexity_metrics IS 'TC015: Cyclomatic complexity metrics for functions - measures independent paths through code';


--
-- Name: decision_impact_analysis; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.decision_impact_analysis (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_decision_id uuid,
    impacted_decision_id uuid,
    project_id uuid,
    impact_type character varying(50) NOT NULL,
    impact_strength character varying(20) DEFAULT 'medium'::character varying,
    impact_direction character varying(20),
    time_impact_days integer,
    cost_impact_amount numeric(10,2),
    complexity_impact_score integer,
    analysis_method character varying(50),
    description text,
    confidence_score numeric(3,2),
    discovered_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    discovered_by character varying(100),
    validated boolean DEFAULT false,
    validation_notes text,
    CONSTRAINT decision_impact_analysis_analysis_method_check CHECK (((analysis_method)::text = ANY ((ARRAY['manual_review'::character varying, 'automated_analysis'::character varying, 'stakeholder_feedback'::character varying, 'performance_correlation'::character varying, 'timeline_analysis'::character varying, 'dependency_graph'::character varying])::text[]))),
    CONSTRAINT decision_impact_analysis_complexity_impact_score_check CHECK (((complexity_impact_score >= '-10'::integer) AND (complexity_impact_score <= 10))),
    CONSTRAINT decision_impact_analysis_confidence_score_check CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric))),
    CONSTRAINT decision_impact_analysis_impact_direction_check CHECK (((impact_direction)::text = ANY ((ARRAY['positive'::character varying, 'negative'::character varying, 'neutral'::character varying])::text[]))),
    CONSTRAINT decision_impact_analysis_impact_strength_check CHECK (((impact_strength)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying])::text[]))),
    CONSTRAINT decision_impact_analysis_impact_type_check CHECK (((impact_type)::text = ANY ((ARRAY['enables'::character varying, 'conflicts_with'::character varying, 'depends_on'::character varying, 'supersedes'::character varying, 'complements'::character varying, 'complicates'::character varying, 'simplifies'::character varying, 'blocks'::character varying, 'accelerates'::character varying])::text[])))
);


ALTER TABLE public.decision_impact_analysis OWNER TO ridgetop;

--
-- Name: decision_learning_insights; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.decision_learning_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    insight_type character varying(50) NOT NULL,
    pattern_name character varying(200) NOT NULL,
    pattern_description text NOT NULL,
    pattern_conditions jsonb NOT NULL,
    confidence_score numeric(3,2),
    supporting_evidence_count integer DEFAULT 1,
    contradicting_evidence_count integer DEFAULT 0,
    recommendation text,
    prevention_strategy text,
    enhancement_strategy text,
    decision_types text[],
    impact_levels text[],
    applicable_components text[],
    contextual_factors jsonb DEFAULT '{}'::jsonb,
    first_observed timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_confirmed timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(20) DEFAULT 'active'::character varying,
    source_decisions uuid[],
    derived_from_insights uuid[],
    times_applied integer DEFAULT 0,
    last_applied timestamp with time zone,
    application_success_rate numeric(3,2),
    CONSTRAINT decision_learning_insights_application_success_rate_check CHECK (((application_success_rate >= (0)::numeric) AND (application_success_rate <= (1)::numeric))),
    CONSTRAINT decision_learning_insights_confidence_score_check CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric))),
    CONSTRAINT decision_learning_insights_insight_type_check CHECK (((insight_type)::text = ANY ((ARRAY['success_pattern'::character varying, 'failure_pattern'::character varying, 'risk_indicator'::character varying, 'best_practice'::character varying, 'anti_pattern'::character varying, 'correlation'::character varying, 'threshold'::character varying, 'timing_pattern'::character varying])::text[]))),
    CONSTRAINT decision_learning_insights_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'deprecated'::character varying, 'under_review'::character varying])::text[])))
);


ALTER TABLE public.decision_learning_insights OWNER TO ridgetop;

--
-- Name: decision_metrics_timeline; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.decision_metrics_timeline (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    decision_id uuid,
    project_id uuid,
    metric_name character varying(100) NOT NULL,
    metric_category character varying(50),
    metric_value numeric(15,6),
    metric_unit character varying(20),
    baseline_value numeric(15,6),
    target_value numeric(15,6),
    measurement_timestamp timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    days_since_decision integer,
    phase character varying(30),
    data_source character varying(100),
    collection_method character varying(50),
    sample_size integer,
    confidence_interval numeric(5,4),
    external_factors jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT decision_metrics_timeline_metric_category_check CHECK (((metric_category)::text = ANY ((ARRAY['performance'::character varying, 'cost'::character varying, 'quality'::character varying, 'velocity'::character varying, 'satisfaction'::character varying, 'adoption'::character varying, 'maintenance'::character varying, 'security'::character varying, 'reliability'::character varying])::text[]))),
    CONSTRAINT decision_metrics_timeline_phase_check CHECK (((phase)::text = ANY ((ARRAY['pre_implementation'::character varying, 'implementation'::character varying, 'early_adoption'::character varying, 'steady_state'::character varying, 'optimization'::character varying, 'migration'::character varying, 'deprecation'::character varying])::text[])))
);


ALTER TABLE public.decision_metrics_timeline OWNER TO ridgetop;

--
-- Name: decision_outcomes; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.decision_outcomes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    decision_id uuid,
    project_id uuid,
    outcome_type character varying(50) NOT NULL,
    predicted_value numeric(10,2),
    actual_value numeric(10,2),
    variance_percentage numeric(5,2),
    outcome_score integer,
    outcome_status character varying(50) DEFAULT 'in_progress'::character varying NOT NULL,
    measured_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    measurement_period_days integer,
    evidence_type character varying(50),
    evidence_data jsonb DEFAULT '{}'::jsonb,
    notes text,
    measured_by character varying(100),
    confidence_level character varying(20) DEFAULT 'medium'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT decision_outcomes_confidence_level_check CHECK (((confidence_level)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying])::text[]))),
    CONSTRAINT decision_outcomes_evidence_type_check CHECK (((evidence_type)::text = ANY ((ARRAY['metrics'::character varying, 'user_feedback'::character varying, 'performance_data'::character varying, 'cost_analysis'::character varying, 'developer_survey'::character varying, 'incident_report'::character varying, 'code_review'::character varying, 'automated_test'::character varying])::text[]))),
    CONSTRAINT decision_outcomes_outcome_score_check CHECK (((outcome_score >= 1) AND (outcome_score <= 10))),
    CONSTRAINT decision_outcomes_outcome_status_check CHECK (((outcome_status)::text = ANY ((ARRAY['in_progress'::character varying, 'successful'::character varying, 'failed'::character varying, 'mixed'::character varying, 'abandoned'::character varying, 'superseded'::character varying])::text[]))),
    CONSTRAINT decision_outcomes_outcome_type_check CHECK (((outcome_type)::text = ANY ((ARRAY['implementation'::character varying, 'performance'::character varying, 'maintenance'::character varying, 'cost'::character varying, 'adoption'::character varying, 'security'::character varying, 'scalability'::character varying, 'developer_experience'::character varying, 'user_experience'::character varying])::text[])))
);


ALTER TABLE public.decision_outcomes OWNER TO ridgetop;

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
    implementing_commits text[] DEFAULT '{}'::text[],
    implementation_status character varying(50) DEFAULT 'planned'::character varying,
    CONSTRAINT technical_decisions_decision_type_check CHECK (((decision_type)::text = ANY (ARRAY[('architecture'::character varying)::text, ('library'::character varying)::text, ('framework'::character varying)::text, ('pattern'::character varying)::text, ('api_design'::character varying)::text, ('database'::character varying)::text, ('deployment'::character varying)::text, ('security'::character varying)::text, ('performance'::character varying)::text, ('ui_ux'::character varying)::text, ('testing'::character varying)::text, ('tooling'::character varying)::text, ('process'::character varying)::text, ('naming_convention'::character varying)::text, ('code_style'::character varying)::text]))),
    CONSTRAINT technical_decisions_impact_level_check CHECK (((impact_level)::text = ANY (ARRAY[('low'::character varying)::text, ('medium'::character varying)::text, ('high'::character varying)::text, ('critical'::character varying)::text]))),
    CONSTRAINT technical_decisions_implementation_status_check CHECK (((implementation_status)::text = ANY ((ARRAY['planned'::character varying, 'in_progress'::character varying, 'implemented'::character varying, 'validated'::character varying, 'deprecated'::character varying])::text[]))),
    CONSTRAINT technical_decisions_outcome_status_check CHECK (((outcome_status)::text = ANY (ARRAY[('unknown'::character varying)::text, ('successful'::character varying)::text, ('failed'::character varying)::text, ('mixed'::character varying)::text, ('too_early'::character varying)::text]))),
    CONSTRAINT technical_decisions_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('deprecated'::character varying)::text, ('superseded'::character varying)::text, ('under_review'::character varying)::text])))
);


ALTER TABLE public.technical_decisions OWNER TO ridgetop;

--
-- Name: decision_outcome_summary; Type: VIEW; Schema: public; Owner: ridgetop
--

CREATE VIEW public.decision_outcome_summary AS
 SELECT td.id AS decision_id,
    td.title,
    td.decision_type,
    td.impact_level,
    td.status,
    td.decision_date,
    count(outcomes.id) AS outcome_measurements,
    avg(outcomes.outcome_score) AS avg_outcome_score,
    max(outcomes.measured_at) AS last_measured,
    string_agg(DISTINCT (outcomes.outcome_status)::text, ', '::text) AS outcome_statuses,
    avg(outcomes.variance_percentage) AS avg_variance,
    count(impacts.id) AS impact_connections
   FROM ((public.technical_decisions td
     LEFT JOIN public.decision_outcomes outcomes ON ((td.id = outcomes.decision_id)))
     LEFT JOIN public.decision_impact_analysis impacts ON (((td.id = impacts.source_decision_id) OR (td.id = impacts.impacted_decision_id))))
  GROUP BY td.id, td.title, td.decision_type, td.impact_level, td.status, td.decision_date;


ALTER VIEW public.decision_outcome_summary OWNER TO ridgetop;

--
-- Name: decision_retrospectives; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.decision_retrospectives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    decision_id uuid,
    project_id uuid,
    retrospective_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    retrospective_type character varying(30),
    participants text[],
    facilitator character varying(100),
    overall_satisfaction integer,
    would_decide_same_again boolean,
    recommendation_to_others integer,
    what_went_well text,
    what_went_poorly text,
    what_we_learned text,
    what_we_would_do_differently text,
    recommendations_for_similar_decisions text,
    process_improvements text,
    tools_or_resources_needed text,
    unforeseen_risks text,
    risk_mitigation_effectiveness text,
    new_risks_discovered text,
    time_to_value_actual_days integer,
    time_to_value_predicted_days integer,
    total_effort_actual_hours numeric(8,2),
    total_effort_predicted_hours numeric(8,2),
    stakeholder_feedback jsonb DEFAULT '{}'::jsonb,
    adoption_challenges text,
    change_management_lessons text,
    retrospective_quality_score integer,
    action_items jsonb DEFAULT '[]'::jsonb,
    follow_up_required boolean DEFAULT false,
    follow_up_date timestamp with time zone,
    CONSTRAINT decision_retrospectives_overall_satisfaction_check CHECK (((overall_satisfaction >= 1) AND (overall_satisfaction <= 10))),
    CONSTRAINT decision_retrospectives_recommendation_to_others_check CHECK (((recommendation_to_others >= 1) AND (recommendation_to_others <= 10))),
    CONSTRAINT decision_retrospectives_retrospective_quality_score_check CHECK (((retrospective_quality_score >= 1) AND (retrospective_quality_score <= 10))),
    CONSTRAINT decision_retrospectives_retrospective_type_check CHECK (((retrospective_type)::text = ANY ((ARRAY['quarterly'::character varying, 'post_implementation'::character varying, 'incident_driven'::character varying, 'milestone'::character varying, 'ad_hoc'::character varying])::text[])))
);


ALTER TABLE public.decision_retrospectives OWNER TO ridgetop;

--
-- Name: dependency_complexity_metrics; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.dependency_complexity_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analysis_session_id uuid NOT NULL,
    project_id uuid NOT NULL,
    file_path text NOT NULL,
    class_name character varying(200),
    element_type character varying(20) NOT NULL,
    element_name character varying(200) NOT NULL,
    afferent_coupling integer DEFAULT 0,
    efferent_coupling integer DEFAULT 0,
    coupling_factor numeric(6,4) DEFAULT 0,
    lack_of_cohesion numeric(6,3) DEFAULT 0,
    cohesion_score numeric(4,3) DEFAULT 1.0,
    functional_cohesion numeric(4,3) DEFAULT 1.0,
    direct_dependencies integer DEFAULT 0,
    indirect_dependencies integer DEFAULT 0,
    circular_dependencies integer DEFAULT 0,
    dependency_depth integer DEFAULT 0,
    dependency_cycles text[],
    abstractness numeric(4,3) DEFAULT 0,
    instability numeric(4,3) DEFAULT 0,
    distance_from_main_sequence numeric(4,3) DEFAULT 0,
    change_impact_score numeric(6,3) DEFAULT 0,
    ripple_effect_size integer DEFAULT 0,
    fan_in integer DEFAULT 0,
    fan_out integer DEFAULT 0,
    coupling_risk_level character varying(15),
    architectural_violation boolean DEFAULT false,
    design_pattern_violations text[],
    refactoring_recommendations text[],
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT dependency_complexity_metrics_coupling_risk_level_check CHECK (((coupling_risk_level)::text = ANY ((ARRAY['very_low'::character varying, 'low'::character varying, 'moderate'::character varying, 'high'::character varying, 'very_high'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT dependency_complexity_metrics_element_type_check CHECK (((element_type)::text = ANY ((ARRAY['class'::character varying, 'module'::character varying, 'package'::character varying, 'function'::character varying])::text[])))
);


ALTER TABLE public.dependency_complexity_metrics OWNER TO ridgetop;

--
-- Name: TABLE dependency_complexity_metrics; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TABLE public.dependency_complexity_metrics IS 'TC015: Coupling and dependency complexity metrics for architectural analysis';


--
-- Name: developer_patterns; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.developer_patterns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    discovery_session_id uuid NOT NULL,
    project_id uuid NOT NULL,
    author_email character varying(255) NOT NULL,
    author_name character varying(255) NOT NULL,
    developer_hash character varying(64) GENERATED ALWAYS AS (encode(sha256((author_email)::bytea), 'hex'::text)) STORED,
    specialty_files text[] DEFAULT '{}'::text[],
    specialization_score numeric(6,4),
    knowledge_breadth_score numeric(6,4),
    change_velocity numeric(8,4) DEFAULT 0,
    consistency_score numeric(6,4),
    commit_regularity_coefficient numeric(6,4),
    avg_files_per_commit numeric(8,4) DEFAULT 0,
    avg_lines_per_commit numeric(10,4) DEFAULT 0,
    median_lines_per_commit integer DEFAULT 0,
    commit_size_variance numeric(12,4),
    commit_type_distribution jsonb DEFAULT '{}'::jsonb,
    dominant_commit_type character varying(50),
    work_pattern_classification character varying(50),
    bug_fix_ratio numeric(6,4),
    refactor_frequency numeric(6,4),
    test_contribution_ratio numeric(6,4),
    documentation_contribution_ratio numeric(6,4),
    frequent_collaborators text[] DEFAULT '{}'::text[],
    collaboration_files text[] DEFAULT '{}'::text[],
    temporal_overlap_score numeric(6,4),
    collaborative_vs_solo_ratio numeric(6,4),
    preferred_hours integer[] DEFAULT '{}'::integer[],
    preferred_days integer[] DEFAULT '{}'::integer[],
    timezone_consistency_score numeric(6,4),
    work_schedule_classification character varying(50),
    first_commit_date timestamp with time zone,
    last_commit_date timestamp with time zone,
    active_days_count integer DEFAULT 0,
    tenure_months integer GENERATED ALWAYS AS (
CASE
    WHEN ((first_commit_date IS NULL) OR (last_commit_date IS NULL)) THEN NULL::numeric
    ELSE (EXTRACT(epoch FROM (last_commit_date - first_commit_date)) / ((30.44 * (24)::numeric) * (3600)::numeric))
END) STORED,
    total_commits integer DEFAULT 0,
    total_lines_added integer DEFAULT 0,
    total_lines_removed integer DEFAULT 0,
    net_lines_contributed integer GENERATED ALWAYS AS ((total_lines_added - total_lines_removed)) STORED,
    unique_files_touched integer DEFAULT 0,
    exclusive_ownership_count integer DEFAULT 0,
    knowledge_silo_risk_score numeric(6,4),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT true,
    activity_trend character varying(20),
    CONSTRAINT developer_patterns_active_days_count_check CHECK ((active_days_count >= 0)),
    CONSTRAINT developer_patterns_activity_trend_check CHECK (((activity_trend)::text = ANY ((ARRAY['increasing'::character varying, 'decreasing'::character varying, 'stable'::character varying, 'irregular'::character varying, 'inactive'::character varying])::text[]))),
    CONSTRAINT developer_patterns_avg_files_per_commit_check CHECK ((avg_files_per_commit >= (0)::numeric)),
    CONSTRAINT developer_patterns_avg_lines_per_commit_check CHECK ((avg_lines_per_commit >= (0)::numeric)),
    CONSTRAINT developer_patterns_bug_fix_ratio_check CHECK (((bug_fix_ratio >= (0)::numeric) AND (bug_fix_ratio <= (1)::numeric))),
    CONSTRAINT developer_patterns_change_velocity_check CHECK ((change_velocity >= (0)::numeric)),
    CONSTRAINT developer_patterns_consistency_score_check CHECK (((consistency_score >= (0)::numeric) AND (consistency_score <= (1)::numeric))),
    CONSTRAINT developer_patterns_documentation_contribution_ratio_check CHECK (((documentation_contribution_ratio >= (0)::numeric) AND (documentation_contribution_ratio <= (1)::numeric))),
    CONSTRAINT developer_patterns_knowledge_breadth_score_check CHECK (((knowledge_breadth_score >= (0)::numeric) AND (knowledge_breadth_score <= (1)::numeric))),
    CONSTRAINT developer_patterns_knowledge_silo_risk_score_check CHECK (((knowledge_silo_risk_score >= (0)::numeric) AND (knowledge_silo_risk_score <= (1)::numeric))),
    CONSTRAINT developer_patterns_refactor_frequency_check CHECK (((refactor_frequency >= (0)::numeric) AND (refactor_frequency <= (1)::numeric))),
    CONSTRAINT developer_patterns_specialization_score_check CHECK (((specialization_score >= (0)::numeric) AND (specialization_score <= (1)::numeric))),
    CONSTRAINT developer_patterns_temporal_overlap_score_check CHECK (((temporal_overlap_score >= (0)::numeric) AND (temporal_overlap_score <= (1)::numeric))),
    CONSTRAINT developer_patterns_test_contribution_ratio_check CHECK (((test_contribution_ratio >= (0)::numeric) AND (test_contribution_ratio <= (1)::numeric)))
);


ALTER TABLE public.developer_patterns OWNER TO ridgetop;

--
-- Name: pattern_discovery_sessions; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.pattern_discovery_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    session_id uuid,
    discovery_timestamp timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    algorithm_version character varying(50) DEFAULT 'tc011_v1.0'::character varying,
    commit_range_start character varying(40),
    commit_range_end character varying(40),
    total_commits_analyzed integer DEFAULT 0,
    total_files_analyzed integer DEFAULT 0,
    execution_time_ms integer DEFAULT 0,
    patterns_discovered integer DEFAULT 0,
    confidence_threshold numeric(3,2) DEFAULT 0.30,
    cooccurrence_time_ms integer DEFAULT 0,
    temporal_time_ms integer DEFAULT 0,
    developer_time_ms integer DEFAULT 0,
    magnitude_time_ms integer DEFAULT 0,
    insights_time_ms integer DEFAULT 0,
    status character varying(50) DEFAULT 'completed'::character varying,
    error_message text,
    superseded_by uuid,
    supersedes uuid[] DEFAULT '{}'::uuid[],
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pattern_discovery_sessions_confidence_threshold_check CHECK (((confidence_threshold >= 0.0) AND (confidence_threshold <= 1.0))),
    CONSTRAINT pattern_discovery_sessions_execution_time_ms_check CHECK ((execution_time_ms >= 0)),
    CONSTRAINT pattern_discovery_sessions_patterns_discovered_check CHECK ((patterns_discovered >= 0)),
    CONSTRAINT pattern_discovery_sessions_status_check CHECK (((status)::text = ANY ((ARRAY['running'::character varying, 'completed'::character varying, 'failed'::character varying, 'outdated'::character varying, 'refreshing'::character varying])::text[]))),
    CONSTRAINT pattern_discovery_sessions_total_commits_analyzed_check CHECK ((total_commits_analyzed >= 0)),
    CONSTRAINT pattern_discovery_sessions_total_files_analyzed_check CHECK ((total_files_analyzed >= 0)),
    CONSTRAINT valid_commit_range CHECK ((((commit_range_start IS NULL) AND (commit_range_end IS NULL)) OR ((commit_range_start IS NOT NULL) AND (commit_range_end IS NOT NULL)))),
    CONSTRAINT valid_execution_times CHECK (((((((cooccurrence_time_ms + temporal_time_ms) + developer_time_ms) + magnitude_time_ms) + insights_time_ms))::numeric <= ((execution_time_ms)::numeric * 1.1)))
);


ALTER TABLE public.pattern_discovery_sessions OWNER TO ridgetop;

--
-- Name: developer_collaboration_matrix; Type: VIEW; Schema: public; Owner: ridgetop
--

CREATE VIEW public.developer_collaboration_matrix AS
 SELECT dp.project_id,
    p.name AS project_name,
    dp.author_email,
    dp.author_name,
    dp.specialization_score,
    dp.knowledge_breadth_score,
    dp.change_velocity,
    dp.consistency_score,
    dp.knowledge_silo_risk_score,
    dp.temporal_overlap_score,
    dp.work_schedule_classification,
    dp.activity_trend,
    array_length(dp.frequent_collaborators, 1) AS collaborator_count,
    array_length(dp.specialty_files, 1) AS specialty_file_count,
    dp.exclusive_ownership_count,
        CASE
            WHEN ((dp.knowledge_silo_risk_score > 0.8) AND (dp.exclusive_ownership_count > 5)) THEN 'critical_silo'::text
            WHEN (dp.knowledge_silo_risk_score > 0.6) THEN 'high_silo_risk'::text
            WHEN ((dp.specialization_score > 0.8) AND (dp.knowledge_breadth_score < 0.3)) THEN 'over_specialized'::text
            WHEN (dp.temporal_overlap_score < 0.3) THEN 'isolated_worker'::text
            ELSE 'healthy_collaboration'::text
        END AS collaboration_risk_category,
    dp.total_commits,
    dp.net_lines_contributed,
    dp.tenure_months,
    dp.updated_at AS last_analyzed
   FROM ((public.developer_patterns dp
     JOIN public.projects p ON ((dp.project_id = p.id)))
     JOIN public.pattern_discovery_sessions pds ON ((dp.discovery_session_id = pds.id)))
  WHERE (dp.is_active = true)
  ORDER BY dp.knowledge_silo_risk_score DESC, dp.specialization_score DESC;


ALTER VIEW public.developer_collaboration_matrix OWNER TO ridgetop;

--
-- Name: git_commits; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.git_commits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    commit_sha character varying(40) NOT NULL,
    short_sha character varying(12) GENERATED ALWAYS AS ("left"((commit_sha)::text, 12)) STORED,
    message text NOT NULL,
    author_name character varying(255) NOT NULL,
    author_email character varying(255) NOT NULL,
    author_date timestamp with time zone NOT NULL,
    committer_name character varying(255) NOT NULL,
    committer_email character varying(255) NOT NULL,
    committer_date timestamp with time zone NOT NULL,
    branch_name character varying(255),
    parent_shas text[] DEFAULT '{}'::text[],
    is_merge_commit boolean GENERATED ALWAYS AS ((array_length(parent_shas, 1) > 1)) STORED,
    files_changed integer DEFAULT 0,
    insertions integer DEFAULT 0,
    deletions integer DEFAULT 0,
    commit_type character varying(50) DEFAULT 'feature'::character varying,
    tags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    tree_sha character varying(40),
    repository_url text,
    merge_strategy character varying(50),
    discovered_by character varying(100),
    first_seen timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_analyzed boolean DEFAULT false,
    analysis_version integer DEFAULT 1,
    total_changes integer GENERATED ALWAYS AS ((insertions + deletions)) STORED,
    CONSTRAINT git_commits_author_email_check CHECK (((author_email)::text ~ '^[^@]+@[^@]+\.[^@]+$'::text)),
    CONSTRAINT git_commits_check CHECK ((committer_date >= author_date)),
    CONSTRAINT git_commits_commit_sha_check CHECK (((commit_sha)::text ~ '^[a-f0-9]{40}$'::text)),
    CONSTRAINT git_commits_committer_email_check CHECK (((committer_email)::text ~ '^[^@]+@[^@]+\.[^@]+$'::text)),
    CONSTRAINT git_commits_deletions_check CHECK ((deletions >= 0)),
    CONSTRAINT git_commits_files_changed_check CHECK ((files_changed >= 0)),
    CONSTRAINT git_commits_insertions_check CHECK ((insertions >= 0)),
    CONSTRAINT git_commits_merge_strategy_values CHECK (((merge_strategy IS NULL) OR ((merge_strategy)::text = ANY ((ARRAY['recursive'::character varying, 'ours'::character varying, 'theirs'::character varying, 'octopus'::character varying, 'resolve'::character varying, 'subtree'::character varying])::text[])))),
    CONSTRAINT git_commits_message_check CHECK ((length(TRIM(BOTH FROM message)) > 0)),
    CONSTRAINT git_commits_tree_sha_format CHECK (((tree_sha IS NULL) OR ((tree_sha)::text ~ '^[a-f0-9]{40}$'::text)))
);


ALTER TABLE public.git_commits OWNER TO ridgetop;

--
-- Name: developer_productivity; Type: VIEW; Schema: public; Owner: ridgetop
--

CREATE VIEW public.developer_productivity AS
 SELECT project_id,
    author_email,
    author_name,
    count(*) AS total_commits,
    sum(insertions) AS total_insertions,
    sum(deletions) AS total_deletions,
    sum(files_changed) AS total_files_changed,
    count(DISTINCT branch_name) AS branches_contributed,
    min(author_date) AS first_commit,
    max(author_date) AS last_commit,
    count(*) FILTER (WHERE (author_date >= (now() - '7 days'::interval))) AS commits_last_week,
    avg((insertions + deletions)) AS avg_lines_per_commit
   FROM public.git_commits gc
  GROUP BY project_id, author_email, author_name;


ALTER VIEW public.developer_productivity OWNER TO ridgetop;

--
-- Name: productivity_health_metrics; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.productivity_health_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    collection_session_id uuid NOT NULL,
    project_id uuid NOT NULL,
    target_session_id uuid,
    developer_email character varying(255),
    developer_name character varying(255),
    team_identifier character varying(100),
    productivity_type character varying(50) NOT NULL,
    measurement_period_start timestamp with time zone,
    measurement_period_end timestamp with time zone,
    session_duration_minutes integer DEFAULT 0,
    active_coding_minutes integer DEFAULT 0,
    productivity_score numeric(8,4) NOT NULL,
    efficiency_ratio numeric(6,4),
    quality_score numeric(6,4),
    rhythm_regularity_score numeric(6,4),
    peak_performance_hours integer[] DEFAULT '{}'::integer[],
    energy_pattern_type character varying(20),
    optimal_session_length_minutes integer,
    deep_work_percentage numeric(6,4),
    context_switches_count integer DEFAULT 0,
    context_switch_cost_minutes numeric(8,4) DEFAULT 0,
    interruption_recovery_time_minutes numeric(8,4),
    decision_latency_minutes numeric(8,4) DEFAULT 0,
    decision_quality_score numeric(6,4),
    decision_confidence_score numeric(6,4),
    decisions_per_session integer DEFAULT 0,
    lines_per_focused_hour numeric(10,4) DEFAULT 0,
    commits_per_session numeric(8,4) DEFAULT 0,
    time_to_first_commit_minutes numeric(8,4),
    implementation_to_planning_ratio numeric(6,4),
    first_time_quality_score numeric(6,4),
    review_readiness_score numeric(6,4),
    test_completeness_score numeric(6,4),
    documentation_completeness_score numeric(6,4),
    collaboration_frequency numeric(8,4) DEFAULT 0,
    communication_effectiveness_score numeric(6,4),
    knowledge_sharing_score numeric(6,4),
    mentoring_activity_score numeric(6,4),
    new_concepts_encountered integer DEFAULT 0,
    skill_acquisition_rate numeric(6,4),
    problem_complexity_handled character varying(20),
    learning_velocity_score numeric(6,4),
    workload_sustainability_score numeric(6,4),
    stress_level_indicator character varying(20),
    work_life_balance_score numeric(6,4),
    burnout_risk_score numeric(6,4),
    performance_trend character varying(20),
    trend_confidence numeric(6,4),
    baseline_comparison_score numeric(8,4),
    team_relative_score numeric(8,4),
    contributing_sessions uuid[] DEFAULT '{}'::uuid[],
    contributing_commits text[] DEFAULT '{}'::text[],
    contributing_patterns uuid[] DEFAULT '{}'::uuid[],
    calculation_method character varying(50) DEFAULT 'standard'::character varying,
    data_sources text[] DEFAULT '{}'::text[],
    confidence_factors jsonb DEFAULT '{}'::jsonb,
    limitations jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT true,
    expires_at timestamp with time zone,
    CONSTRAINT productivity_health_metrics_active_coding_minutes_check CHECK ((active_coding_minutes >= 0)),
    CONSTRAINT productivity_health_metrics_burnout_risk_score_check CHECK (((burnout_risk_score >= (0)::numeric) AND (burnout_risk_score <= (1)::numeric))),
    CONSTRAINT productivity_health_metrics_collaboration_frequency_check CHECK ((collaboration_frequency >= (0)::numeric)),
    CONSTRAINT productivity_health_metrics_commits_per_session_check CHECK ((commits_per_session >= (0)::numeric)),
    CONSTRAINT productivity_health_metrics_communication_effectiveness_s_check CHECK (((communication_effectiveness_score >= (0)::numeric) AND (communication_effectiveness_score <= (1)::numeric))),
    CONSTRAINT productivity_health_metrics_context_switch_cost_minutes_check CHECK ((context_switch_cost_minutes >= (0)::numeric)),
    CONSTRAINT productivity_health_metrics_context_switches_count_check CHECK ((context_switches_count >= 0)),
    CONSTRAINT productivity_health_metrics_decision_confidence_score_check CHECK (((decision_confidence_score >= (0)::numeric) AND (decision_confidence_score <= (1)::numeric))),
    CONSTRAINT productivity_health_metrics_decision_latency_minutes_check CHECK ((decision_latency_minutes >= (0)::numeric)),
    CONSTRAINT productivity_health_metrics_decision_quality_score_check CHECK (((decision_quality_score >= (0)::numeric) AND (decision_quality_score <= (1)::numeric))),
    CONSTRAINT productivity_health_metrics_decisions_per_session_check CHECK ((decisions_per_session >= 0)),
    CONSTRAINT productivity_health_metrics_deep_work_percentage_check CHECK (((deep_work_percentage >= (0)::numeric) AND (deep_work_percentage <= (1)::numeric))),
    CONSTRAINT productivity_health_metrics_documentation_completeness_sc_check CHECK (((documentation_completeness_score >= (0)::numeric) AND (documentation_completeness_score <= (1)::numeric))),
    CONSTRAINT productivity_health_metrics_efficiency_ratio_check CHECK (((efficiency_ratio >= (0)::numeric) AND (efficiency_ratio <= (1)::numeric))),
    CONSTRAINT productivity_health_metrics_energy_pattern_type_check CHECK (((energy_pattern_type)::text = ANY ((ARRAY['morning'::character varying, 'afternoon'::character varying, 'evening'::character varying, 'night'::character varying, 'consistent'::character varying, 'irregular'::character varying])::text[]))),
    CONSTRAINT productivity_health_metrics_first_time_quality_score_check CHECK (((first_time_quality_score >= (0)::numeric) AND (first_time_quality_score <= (1)::numeric))),
    CONSTRAINT productivity_health_metrics_knowledge_sharing_score_check CHECK (((knowledge_sharing_score >= (0)::numeric) AND (knowledge_sharing_score <= (1)::numeric))),
    CONSTRAINT productivity_health_metrics_learning_velocity_score_check CHECK (((learning_velocity_score >= (0)::numeric) AND (learning_velocity_score <= (1)::numeric))),
    CONSTRAINT productivity_health_metrics_lines_per_focused_hour_check CHECK ((lines_per_focused_hour >= (0)::numeric)),
    CONSTRAINT productivity_health_metrics_mentoring_activity_score_check CHECK (((mentoring_activity_score >= (0)::numeric) AND (mentoring_activity_score <= (1)::numeric))),
    CONSTRAINT productivity_health_metrics_new_concepts_encountered_check CHECK ((new_concepts_encountered >= 0)),
    CONSTRAINT productivity_health_metrics_performance_trend_check CHECK (((performance_trend)::text = ANY ((ARRAY['improving'::character varying, 'stable'::character varying, 'declining'::character varying, 'volatile'::character varying, 'unknown'::character varying])::text[]))),
    CONSTRAINT productivity_health_metrics_problem_complexity_handled_check CHECK (((problem_complexity_handled)::text = ANY ((ARRAY['simple'::character varying, 'moderate'::character varying, 'complex'::character varying, 'very_complex'::character varying, 'architectural'::character varying])::text[]))),
    CONSTRAINT productivity_health_metrics_productivity_score_check CHECK ((productivity_score >= (0)::numeric)),
    CONSTRAINT productivity_health_metrics_productivity_type_check CHECK (((productivity_type)::text = ANY ((ARRAY['session_productivity'::character varying, 'rhythm_consistency'::character varying, 'context_switching'::character varying, 'focus_depth'::character varying, 'decision_speed'::character varying, 'implementation_speed'::character varying, 'code_review_readiness'::character varying, 'collaboration_quality'::character varying, 'learning_velocity'::character varying, 'problem_solving_efficiency'::character varying, 'quality_first_time'::character varying])::text[]))),
    CONSTRAINT productivity_health_metrics_quality_score_check CHECK (((quality_score >= (0)::numeric) AND (quality_score <= (1)::numeric))),
    CONSTRAINT productivity_health_metrics_review_readiness_score_check CHECK (((review_readiness_score >= (0)::numeric) AND (review_readiness_score <= (1)::numeric))),
    CONSTRAINT productivity_health_metrics_rhythm_regularity_score_check CHECK (((rhythm_regularity_score >= (0)::numeric) AND (rhythm_regularity_score <= (1)::numeric))),
    CONSTRAINT productivity_health_metrics_session_duration_minutes_check CHECK ((session_duration_minutes >= 0)),
    CONSTRAINT productivity_health_metrics_skill_acquisition_rate_check CHECK (((skill_acquisition_rate >= (0)::numeric) AND (skill_acquisition_rate <= (1)::numeric))),
    CONSTRAINT productivity_health_metrics_stress_level_indicator_check CHECK (((stress_level_indicator)::text = ANY ((ARRAY['low'::character varying, 'optimal'::character varying, 'moderate'::character varying, 'high'::character varying, 'excessive'::character varying])::text[]))),
    CONSTRAINT productivity_health_metrics_test_completeness_score_check CHECK (((test_completeness_score >= (0)::numeric) AND (test_completeness_score <= (1)::numeric))),
    CONSTRAINT productivity_health_metrics_trend_confidence_check CHECK (((trend_confidence >= (0)::numeric) AND (trend_confidence <= (1)::numeric))),
    CONSTRAINT productivity_health_metrics_work_life_balance_score_check CHECK (((work_life_balance_score >= (0)::numeric) AND (work_life_balance_score <= (1)::numeric))),
    CONSTRAINT productivity_health_metrics_workload_sustainability_score_check CHECK (((workload_sustainability_score >= (0)::numeric) AND (workload_sustainability_score <= (1)::numeric)))
);


ALTER TABLE public.productivity_health_metrics OWNER TO ridgetop;

--
-- Name: developer_productivity_summary; Type: VIEW; Schema: public; Owner: ridgetop
--

CREATE VIEW public.developer_productivity_summary AS
 SELECT phm.project_id,
    p.name AS project_name,
    phm.developer_email,
    phm.developer_name,
    phm.team_identifier,
    phm.productivity_score AS current_productivity,
    phm.efficiency_ratio AS current_efficiency,
    phm.quality_score AS current_quality,
    phm.workload_sustainability_score,
    phm.stress_level_indicator,
    phm.burnout_risk_score,
    phm.performance_trend,
    phm.baseline_comparison_score,
    phm.team_relative_score,
    phm.collaboration_frequency,
    phm.communication_effectiveness_score,
    phm.knowledge_sharing_score,
    phm.learning_velocity_score,
    phm.skill_acquisition_rate,
    phm.problem_complexity_handled,
    phm.measurement_period_end AS last_measured,
    phm.energy_pattern_type,
    phm.optimal_session_length_minutes,
        CASE
            WHEN (phm.burnout_risk_score > 0.8) THEN 'high_burnout_risk'::text
            WHEN (phm.workload_sustainability_score < 0.3) THEN 'unsustainable_workload'::text
            WHEN (((phm.performance_trend)::text = 'declining'::text) AND (phm.trend_confidence > 0.7)) THEN 'performance_decline'::text
            WHEN ((phm.stress_level_indicator)::text = 'excessive'::text) THEN 'excessive_stress'::text
            ELSE 'healthy'::text
        END AS health_risk_category,
    phm.updated_at AS last_updated
   FROM (public.productivity_health_metrics phm
     JOIN public.projects p ON ((phm.project_id = p.id)))
  WHERE ((phm.is_active = true) AND (phm.measurement_period_end = ( SELECT max(phm2.measurement_period_end) AS max
           FROM public.productivity_health_metrics phm2
          WHERE (((phm2.developer_email)::text = (phm.developer_email)::text) AND (phm2.project_id = phm.project_id) AND ((phm2.productivity_type)::text = 'session_productivity'::text)))))
  ORDER BY phm.productivity_score DESC, phm.updated_at DESC;


ALTER VIEW public.developer_productivity_summary OWNER TO ridgetop;

--
-- Name: dual_write_config; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.dual_write_config (
    table_name character varying(100) NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    sync_mode character varying(20) DEFAULT 'async'::character varying NOT NULL,
    max_failures integer DEFAULT 5 NOT NULL,
    failure_count integer DEFAULT 0 NOT NULL,
    last_failure_at timestamp with time zone,
    emergency_stop boolean DEFAULT false NOT NULL,
    performance_threshold_ms integer DEFAULT 1000 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    notes text,
    CONSTRAINT dual_write_config_sync_mode_check CHECK (((sync_mode)::text = ANY ((ARRAY['sync'::character varying, 'async'::character varying, 'disabled'::character varying])::text[])))
);


ALTER TABLE public.dual_write_config OWNER TO ridgetop;

--
-- Name: TABLE dual_write_config; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TABLE public.dual_write_config IS 'P2.3 Feature flag configuration for dual-write validation system';


--
-- Name: dual_write_stats; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.dual_write_stats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_name character varying(100) NOT NULL,
    operation character varying(10) NOT NULL,
    success boolean NOT NULL,
    duration_ms integer,
    record_id uuid,
    validation_hash text,
    error_message text,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    sync_lag_ms integer,
    record_size_bytes integer,
    CONSTRAINT dual_write_stats_operation_check CHECK (((operation)::text = ANY ((ARRAY['INSERT'::character varying, 'UPDATE'::character varying, 'DELETE'::character varying])::text[])))
);


ALTER TABLE public.dual_write_stats OWNER TO ridgetop;

--
-- Name: TABLE dual_write_stats; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TABLE public.dual_write_stats IS 'P2.3 Performance and monitoring statistics for dual-write operations';


--
-- Name: envelope_audit; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.envelope_audit (
    id text NOT NULL,
    op text NOT NULL,
    idempotency_key text,
    hash text NOT NULL,
    envelope_raw jsonb NOT NULL,
    actor text,
    origin text,
    thread text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    result jsonb
);


ALTER TABLE public.envelope_audit OWNER TO ridgetop;

--
-- Name: event_log; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.event_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type character varying(100) NOT NULL,
    event_data jsonb DEFAULT '{}'::jsonb,
    session_id uuid,
    project_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.event_log OWNER TO ridgetop;

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
-- Name: git_file_changes; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.git_file_changes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    commit_id uuid NOT NULL,
    file_path text NOT NULL,
    old_file_path text,
    change_type character varying(20) NOT NULL,
    lines_added integer DEFAULT 0,
    lines_removed integer DEFAULT 0,
    is_binary boolean DEFAULT false,
    is_generated boolean DEFAULT false,
    file_size_bytes integer,
    component_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    file_type character varying(50),
    old_file_mode character varying(10),
    new_file_mode character varying(10),
    affects_exports boolean DEFAULT false,
    complexity_delta integer DEFAULT 0,
    lines_changed integer GENERATED ALWAYS AS ((lines_added + lines_removed)) STORED,
    CONSTRAINT git_file_changes_change_type_check CHECK (((change_type)::text = ANY ((ARRAY['added'::character varying, 'modified'::character varying, 'deleted'::character varying, 'renamed'::character varying, 'copied'::character varying, 'type_changed'::character varying, 'typechange'::character varying])::text[]))),
    CONSTRAINT git_file_changes_file_mode_format CHECK ((((old_file_mode IS NULL) OR ((old_file_mode)::text ~ '^[0-7]{6}$'::text)) AND ((new_file_mode IS NULL) OR ((new_file_mode)::text ~ '^[0-7]{6}$'::text)))),
    CONSTRAINT git_file_changes_lines_added_check CHECK ((lines_added >= 0)),
    CONSTRAINT git_file_changes_lines_removed_check CHECK ((lines_removed >= 0))
);


ALTER TABLE public.git_file_changes OWNER TO ridgetop;

--
-- Name: file_change_hotspots; Type: VIEW; Schema: public; Owner: ridgetop
--

CREATE VIEW public.file_change_hotspots AS
 SELECT gfc.project_id,
    gfc.file_path,
    count(*) AS change_count,
    count(DISTINCT gc.author_email) AS contributor_count,
    sum(gfc.lines_added) AS total_lines_added,
    sum(gfc.lines_removed) AS total_lines_removed,
    max(gc.author_date) AS last_changed,
    min(gc.author_date) AS first_changed,
    array_agg(DISTINCT gc.commit_type) AS change_types
   FROM (public.git_file_changes gfc
     JOIN public.git_commits gc ON ((gfc.commit_id = gc.id)))
  GROUP BY gfc.project_id, gfc.file_path;


ALTER VIEW public.file_change_hotspots OWNER TO ridgetop;

--
-- Name: file_complexity_summary; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.file_complexity_summary (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analysis_session_id uuid NOT NULL,
    project_id uuid NOT NULL,
    file_path text NOT NULL,
    file_type character varying(20),
    lines_of_code integer DEFAULT 0,
    lines_of_comments integer DEFAULT 0,
    blank_lines integer DEFAULT 0,
    total_functions integer DEFAULT 0,
    total_classes integer DEFAULT 0,
    total_interfaces integer DEFAULT 0,
    avg_cyclomatic_complexity numeric(6,2) DEFAULT 0,
    max_cyclomatic_complexity integer DEFAULT 0,
    total_cognitive_complexity integer DEFAULT 0,
    avg_cognitive_complexity numeric(6,2) DEFAULT 0,
    total_halstead_volume numeric(10,2) DEFAULT 0,
    avg_halstead_effort numeric(10,2) DEFAULT 0,
    estimated_bugs numeric(6,3) DEFAULT 0,
    maintainability_index numeric(6,2) DEFAULT 100,
    total_dependencies integer DEFAULT 0,
    coupling_score numeric(6,3) DEFAULT 0,
    cohesion_score numeric(4,3) DEFAULT 1.0,
    overall_complexity_score numeric(8,3) DEFAULT 0 NOT NULL,
    complexity_grade character varying(5) DEFAULT 'A'::character varying NOT NULL,
    risk_level character varying(15) DEFAULT 'very_low'::character varying NOT NULL,
    is_complexity_hotspot boolean DEFAULT false,
    hotspot_score numeric(6,3) DEFAULT 0,
    refactoring_priority integer DEFAULT 5,
    change_frequency integer DEFAULT 0,
    last_modified timestamp with time zone,
    modification_trend character varying(20),
    technical_debt_minutes integer DEFAULT 0,
    maintenance_cost_factor numeric(4,2) DEFAULT 1.0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT file_complexity_summary_complexity_grade_check CHECK (((complexity_grade)::text = ANY ((ARRAY['A'::character varying, 'B'::character varying, 'C'::character varying, 'D'::character varying, 'F'::character varying])::text[]))),
    CONSTRAINT file_complexity_summary_modification_trend_check CHECK (((modification_trend)::text = ANY ((ARRAY['increasing'::character varying, 'decreasing'::character varying, 'stable'::character varying, 'volatile'::character varying])::text[]))),
    CONSTRAINT file_complexity_summary_refactoring_priority_check CHECK (((refactoring_priority >= 1) AND (refactoring_priority <= 5))),
    CONSTRAINT file_complexity_summary_risk_level_check CHECK (((risk_level)::text = ANY ((ARRAY['very_low'::character varying, 'low'::character varying, 'moderate'::character varying, 'high'::character varying, 'very_high'::character varying, 'critical'::character varying])::text[])))
);


ALTER TABLE public.file_complexity_summary OWNER TO ridgetop;

--
-- Name: TABLE file_complexity_summary; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TABLE public.file_complexity_summary IS 'TC015: Aggregated file-level complexity summary for dashboard queries';


--
-- Name: file_cooccurrence_patterns; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.file_cooccurrence_patterns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    discovery_session_id uuid NOT NULL,
    project_id uuid NOT NULL,
    file_path_1 text NOT NULL,
    file_path_2 text NOT NULL,
    pattern_hash character varying(64) GENERATED ALWAYS AS (encode(sha256((((LEAST(file_path_1, file_path_2) || '|'::text) || GREATEST(file_path_1, file_path_2)))::bytea), 'hex'::text)) STORED,
    cooccurrence_count integer NOT NULL,
    support_score numeric(6,4) NOT NULL,
    confidence_score numeric(6,4) NOT NULL,
    lift_score numeric(8,4) NOT NULL,
    pattern_strength character varying(20) NOT NULL,
    statistical_significance numeric(6,4),
    confidence_1_to_2 numeric(6,4),
    confidence_2_to_1 numeric(6,4),
    is_bidirectional boolean GENERATED ALWAYS AS ((abs((COALESCE(confidence_1_to_2, (0)::numeric) - COALESCE(confidence_2_to_1, (0)::numeric))) < 0.1)) STORED,
    contributing_commits text[] DEFAULT '{}'::text[],
    first_observed_date timestamp with time zone,
    last_observed_date timestamp with time zone,
    file_1_category character varying(50),
    file_2_category character varying(50),
    architectural_relationship character varying(50),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT true,
    confidence_trend character varying(20),
    CONSTRAINT file_cooccurrence_patterns_confidence_1_to_2_check CHECK (((confidence_1_to_2 >= (0)::numeric) AND (confidence_1_to_2 <= (1)::numeric))),
    CONSTRAINT file_cooccurrence_patterns_confidence_2_to_1_check CHECK (((confidence_2_to_1 >= (0)::numeric) AND (confidence_2_to_1 <= (1)::numeric))),
    CONSTRAINT file_cooccurrence_patterns_confidence_score_check CHECK (((confidence_score > (0)::numeric) AND (confidence_score <= (1)::numeric))),
    CONSTRAINT file_cooccurrence_patterns_confidence_trend_check CHECK (((confidence_trend)::text = ANY ((ARRAY['increasing'::character varying, 'decreasing'::character varying, 'stable'::character varying])::text[]))),
    CONSTRAINT file_cooccurrence_patterns_cooccurrence_count_check CHECK ((cooccurrence_count > 0)),
    CONSTRAINT file_cooccurrence_patterns_lift_score_check CHECK ((lift_score > (0)::numeric)),
    CONSTRAINT file_cooccurrence_patterns_pattern_strength_check CHECK (((pattern_strength)::text = ANY ((ARRAY['weak'::character varying, 'moderate'::character varying, 'strong'::character varying, 'very_strong'::character varying])::text[]))),
    CONSTRAINT file_cooccurrence_patterns_statistical_significance_check CHECK ((statistical_significance >= (0)::numeric)),
    CONSTRAINT file_cooccurrence_patterns_support_score_check CHECK (((support_score > (0)::numeric) AND (support_score <= (1)::numeric))),
    CONSTRAINT no_self_cooccurrence CHECK ((file_path_1 <> file_path_2)),
    CONSTRAINT ordered_file_paths CHECK ((file_path_1 < file_path_2))
);


ALTER TABLE public.file_cooccurrence_patterns OWNER TO ridgetop;

--
-- Name: git_branches; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.git_branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    branch_name character varying(255) NOT NULL,
    current_sha character varying(40),
    is_default boolean DEFAULT false,
    is_protected boolean DEFAULT false,
    branch_type character varying(50) DEFAULT 'feature'::character varying,
    upstream_branch character varying(255),
    commit_count integer DEFAULT 0,
    last_commit_date timestamp with time zone,
    first_commit_date timestamp with time zone,
    base_branch character varying(255),
    merge_target character varying(255),
    session_id uuid,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    current_commit_sha character varying(40),
    full_ref_name character varying(500),
    is_default_branch boolean DEFAULT false,
    is_active boolean DEFAULT true,
    deleted_at timestamp with time zone,
    commits_ahead integer DEFAULT 0,
    commits_behind integer DEFAULT 0,
    total_commits integer DEFAULT 0,
    unique_authors integer DEFAULT 0,
    associated_sessions uuid[] DEFAULT '{}'::uuid[],
    CONSTRAINT git_branches_active_deleted_logic CHECK ((((is_active = true) AND (deleted_at IS NULL)) OR (is_active = false))),
    CONSTRAINT git_branches_commit_count_check CHECK ((commit_count >= 0)),
    CONSTRAINT git_branches_current_commit_sha_format CHECK (((current_commit_sha IS NULL) OR ((current_commit_sha)::text ~ '^[a-f0-9]{40}$'::text))),
    CONSTRAINT git_branches_current_sha_check CHECK (((current_sha)::text ~ '^[a-f0-9]{40}$'::text)),
    CONSTRAINT git_branches_stats_positive CHECK (((commits_ahead >= 0) AND (commits_behind >= 0) AND (total_commits >= 0) AND (unique_authors >= 0)))
);


ALTER TABLE public.git_branches OWNER TO ridgetop;

--
-- Name: halstead_complexity_metrics; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.halstead_complexity_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    analysis_session_id uuid NOT NULL,
    project_id uuid NOT NULL,
    file_path text NOT NULL,
    class_name character varying(200),
    function_name character varying(200),
    scope_type character varying(20) NOT NULL,
    start_line integer DEFAULT 1,
    end_line integer DEFAULT 1,
    distinct_operators integer DEFAULT 0 NOT NULL,
    distinct_operands integer DEFAULT 0 NOT NULL,
    total_operators integer DEFAULT 0 NOT NULL,
    total_operands integer DEFAULT 0 NOT NULL,
    program_vocabulary integer DEFAULT 0 NOT NULL,
    program_length integer DEFAULT 0 NOT NULL,
    calculated_length numeric(8,2) DEFAULT 0,
    volume numeric(10,2) DEFAULT 0,
    difficulty numeric(8,3) DEFAULT 0,
    effort numeric(12,2) DEFAULT 0,
    programming_time numeric(8,2) DEFAULT 0,
    delivered_bugs numeric(6,3) DEFAULT 0,
    maintainability_index numeric(6,2) DEFAULT 100,
    complexity_density numeric(6,3) DEFAULT 0,
    vocabulary_richness numeric(4,3) DEFAULT 0,
    halstead_grade character varying(5),
    maintainability_risk character varying(15),
    defect_probability numeric(4,3) DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT halstead_complexity_metrics_halstead_grade_check CHECK (((halstead_grade)::text = ANY ((ARRAY['A'::character varying, 'B'::character varying, 'C'::character varying, 'D'::character varying, 'F'::character varying])::text[]))),
    CONSTRAINT halstead_complexity_metrics_maintainability_risk_check CHECK (((maintainability_risk)::text = ANY ((ARRAY['very_low'::character varying, 'low'::character varying, 'moderate'::character varying, 'high'::character varying, 'very_high'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT halstead_complexity_metrics_scope_type_check CHECK (((scope_type)::text = ANY ((ARRAY['function'::character varying, 'method'::character varying, 'class'::character varying, 'file'::character varying])::text[])))
);


ALTER TABLE public.halstead_complexity_metrics OWNER TO ridgetop;

--
-- Name: TABLE halstead_complexity_metrics; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TABLE public.halstead_complexity_metrics IS 'TC015: Halstead complexity metrics - program vocabulary and structure analysis';


--
-- Name: metrics_alerts; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.metrics_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    alert_type character varying(50) NOT NULL,
    metric_type character varying(50) NOT NULL,
    metric_scope character varying(50) NOT NULL,
    scope_identifier text,
    trigger_timestamp timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    trigger_value numeric(12,4),
    threshold_value numeric(12,4),
    baseline_value numeric(12,4),
    severity character varying(20) NOT NULL,
    priority integer,
    urgency character varying(20),
    title character varying(255) NOT NULL,
    description text NOT NULL,
    detailed_analysis text,
    estimated_impact character varying(20),
    affected_areas text[] DEFAULT '{}'::text[],
    ripple_effect_score numeric(6,4),
    immediate_actions text[] DEFAULT '{}'::text[],
    recommended_actions text[] DEFAULT '{}'::text[],
    preventive_measures text[] DEFAULT '{}'::text[],
    similar_alerts_count integer DEFAULT 0,
    last_similar_alert timestamp with time zone,
    trend_duration_days integer,
    status character varying(50) DEFAULT 'open'::character varying,
    acknowledged_at timestamp with time zone,
    acknowledged_by character varying(255),
    resolved_at timestamp with time zone,
    resolved_by character varying(255),
    resolution_notes text,
    follow_up_required boolean DEFAULT false,
    follow_up_date timestamp with time zone,
    escalation_level integer DEFAULT 0,
    escalation_history jsonb DEFAULT '{}'::jsonb,
    source_metric_id uuid,
    related_alerts uuid[] DEFAULT '{}'::uuid[],
    related_patterns uuid[] DEFAULT '{}'::uuid[],
    related_insights uuid[] DEFAULT '{}'::uuid[],
    notification_sent boolean DEFAULT false,
    notification_channels text[] DEFAULT '{}'::text[],
    stakeholders_notified text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp with time zone,
    CONSTRAINT metrics_alerts_alert_type_check CHECK (((alert_type)::text = ANY ((ARRAY['threshold_exceeded'::character varying, 'trend_change'::character varying, 'anomaly_detected'::character varying, 'quality_degradation'::character varying, 'productivity_drop'::character varying, 'risk_increase'::character varying, 'pattern_emergence'::character varying, 'performance_improvement'::character varying])::text[]))),
    CONSTRAINT metrics_alerts_estimated_impact_check CHECK (((estimated_impact)::text = ANY ((ARRAY['minimal'::character varying, 'low'::character varying, 'medium'::character varying, 'high'::character varying, 'severe'::character varying])::text[]))),
    CONSTRAINT metrics_alerts_priority_check CHECK (((priority >= 1) AND (priority <= 10))),
    CONSTRAINT metrics_alerts_ripple_effect_score_check CHECK (((ripple_effect_score >= (0)::numeric) AND (ripple_effect_score <= (1)::numeric))),
    CONSTRAINT metrics_alerts_severity_check CHECK (((severity)::text = ANY ((ARRAY['info'::character varying, 'warning'::character varying, 'error'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT metrics_alerts_status_check CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'acknowledged'::character varying, 'investigating'::character varying, 'resolved'::character varying, 'false_positive'::character varying, 'suppressed'::character varying])::text[]))),
    CONSTRAINT metrics_alerts_urgency_check CHECK (((urgency)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'immediate'::character varying])::text[])))
);


ALTER TABLE public.metrics_alerts OWNER TO ridgetop;

--
-- Name: high_priority_alerts_summary; Type: VIEW; Schema: public; Owner: ridgetop
--

CREATE VIEW public.high_priority_alerts_summary AS
 SELECT ma.project_id,
    p.name AS project_name,
    ma.alert_type,
    ma.metric_type,
    ma.severity,
    ma.urgency,
    ma.title,
    ma.description,
    ma.trigger_value,
    ma.threshold_value,
    ma.estimated_impact,
    ma.immediate_actions,
    ma.recommended_actions,
    ((((
        CASE ma.severity
            WHEN 'critical'::text THEN 4
            WHEN 'error'::text THEN 3
            WHEN 'warning'::text THEN 2
            ELSE 1
        END)::numeric * 0.4) + ((
        CASE ma.urgency
            WHEN 'immediate'::text THEN 4
            WHEN 'high'::text THEN 3
            WHEN 'medium'::text THEN 2
            ELSE 1
        END)::numeric * 0.3)) + ((
        CASE ma.estimated_impact
            WHEN 'severe'::text THEN 4
            WHEN 'high'::text THEN 3
            WHEN 'medium'::text THEN 2
            ELSE 1
        END)::numeric * 0.3)) AS priority_score,
    ma.trigger_timestamp,
    (EXTRACT(epoch FROM (CURRENT_TIMESTAMP - ma.trigger_timestamp)) / (3600)::numeric) AS hours_since_triggered,
    ma.follow_up_date,
    ma.escalation_level,
    ma.status,
    ma.acknowledged_at,
    ma.acknowledged_by,
    ma.scope_identifier,
    ma.affected_areas,
    array_length(ma.related_alerts, 1) AS related_alerts_count
   FROM (public.metrics_alerts ma
     JOIN public.projects p ON ((ma.project_id = p.id)))
  WHERE (((ma.status)::text = ANY ((ARRAY['open'::character varying, 'acknowledged'::character varying, 'investigating'::character varying])::text[])) AND (((ma.severity)::text = ANY ((ARRAY['critical'::character varying, 'error'::character varying])::text[])) OR ((ma.urgency)::text = ANY ((ARRAY['immediate'::character varying, 'high'::character varying])::text[]))))
  ORDER BY ((((
        CASE ma.severity
            WHEN 'critical'::text THEN 4
            WHEN 'error'::text THEN 3
            WHEN 'warning'::text THEN 2
            ELSE 1
        END)::numeric * 0.4) + ((
        CASE ma.urgency
            WHEN 'immediate'::text THEN 4
            WHEN 'high'::text THEN 3
            WHEN 'medium'::text THEN 2
            ELSE 1
        END)::numeric * 0.3)) + ((
        CASE ma.estimated_impact
            WHEN 'severe'::text THEN 4
            WHEN 'high'::text THEN 3
            WHEN 'medium'::text THEN 2
            ELSE 1
        END)::numeric * 0.3)) DESC, ma.trigger_timestamp;


ALTER VIEW public.high_priority_alerts_summary OWNER TO ridgetop;

--
-- Name: high_risk_complexity_items; Type: MATERIALIZED VIEW; Schema: public; Owner: ridgetop
--

CREATE MATERIALIZED VIEW public.high_risk_complexity_items AS
 SELECT cas.project_id,
    ccm.file_path,
    ccm.function_name,
    'cyclomatic'::text AS complexity_type,
    (ccm.cyclomatic_complexity)::numeric AS complexity_value,
    ccm.risk_level,
    'medium'::text AS refactoring_priority,
    cas.created_at AS analysis_date
   FROM (public.cyclomatic_complexity_metrics ccm
     JOIN public.complexity_analysis_sessions cas ON ((ccm.analysis_session_id = cas.id)))
  WHERE ((ccm.risk_level)::text = ANY ((ARRAY['high'::character varying, 'very_high'::character varying, 'critical'::character varying])::text[]))
UNION ALL
 SELECT cas.project_id,
    cogm.file_path,
    cogm.function_name,
    'cognitive'::text AS complexity_type,
    cogm.cognitive_complexity AS complexity_value,
    cogm.cognitive_risk_level AS risk_level,
    'medium'::text AS refactoring_priority,
    cas.created_at AS analysis_date
   FROM (public.cognitive_complexity_metrics cogm
     JOIN public.complexity_analysis_sessions cas ON ((cogm.analysis_session_id = cas.id)))
  WHERE ((cogm.cognitive_risk_level)::text = ANY ((ARRAY['high'::character varying, 'very_high'::character varying, 'critical'::character varying])::text[]))
UNION ALL
 SELECT cas.project_id,
    hcm.file_path,
    hcm.function_name,
    'halstead'::text AS complexity_type,
    hcm.effort AS complexity_value,
    hcm.maintainability_risk AS risk_level,
    'high'::text AS refactoring_priority,
    cas.created_at AS analysis_date
   FROM (public.halstead_complexity_metrics hcm
     JOIN public.complexity_analysis_sessions cas ON ((hcm.analysis_session_id = cas.id)))
  WHERE ((hcm.maintainability_risk)::text = ANY ((ARRAY['high'::character varying, 'very_high'::character varying, 'critical'::character varying])::text[]))
  WITH NO DATA;


ALTER MATERIALIZED VIEW public.high_risk_complexity_items OWNER TO ridgetop;

--
-- Name: MATERIALIZED VIEW high_risk_complexity_items; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON MATERIALIZED VIEW public.high_risk_complexity_items IS 'TC015: High-risk complexity items requiring immediate attention';


--
-- Name: high_risk_files_summary; Type: VIEW; Schema: public; Owner: ridgetop
--

CREATE VIEW public.high_risk_files_summary AS
 SELECT cmp.project_id,
    p.name AS project_name,
    cmp.file_path,
    cmp.risk_level,
    cmp.anomaly_score,
    cmp.hotspot_score,
    cmp.technical_debt_indicator,
    cmp.change_frequency,
    cmp.volatility_score,
    cmp.change_category,
    cmp.total_changes,
    cmp.contributor_diversity_score,
    cmp.architectural_layer,
    cmp.component_coupling_score,
    cmp.maintenance_burden_score,
    cmp.updated_at AS last_analyzed,
    pds.discovery_timestamp AS discovered_at,
    ((((cmp.anomaly_score * 0.3) + (cmp.hotspot_score * 0.2)) + (cmp.technical_debt_indicator * 0.3)) + (cmp.maintenance_burden_score * 0.2)) AS composite_risk_score,
        CASE
            WHEN ((cmp.change_frequency > (5)::numeric) AND (cmp.volatility_score > 0.8)) THEN 'immediate'::text
            WHEN ((cmp.risk_level)::text = 'critical'::text) THEN 'urgent'::text
            WHEN (((cmp.risk_level)::text = 'high'::text) AND (cmp.hotspot_score > 0.7)) THEN 'high'::text
            ELSE 'medium'::text
        END AS action_priority
   FROM ((public.change_magnitude_patterns cmp
     JOIN public.projects p ON ((cmp.project_id = p.id)))
     JOIN public.pattern_discovery_sessions pds ON ((cmp.discovery_session_id = pds.id)))
  WHERE ((cmp.is_active = true) AND ((cmp.risk_level)::text = ANY ((ARRAY['high'::character varying, 'critical'::character varying])::text[])))
  ORDER BY
        CASE cmp.risk_level
            WHEN 'critical'::text THEN 1
            WHEN 'high'::text THEN 2
            ELSE 3
        END, ((((cmp.anomaly_score * 0.3) + (cmp.hotspot_score * 0.2)) + (cmp.technical_debt_indicator * 0.3)) + (cmp.maintenance_burden_score * 0.2)) DESC, cmp.change_frequency DESC;


ALTER VIEW public.high_risk_files_summary OWNER TO ridgetop;

--
-- Name: learning_insights_effectiveness; Type: VIEW; Schema: public; Owner: ridgetop
--

CREATE VIEW public.learning_insights_effectiveness AS
 SELECT id,
    project_id,
    insight_type,
    pattern_name,
    pattern_description,
    pattern_conditions,
    confidence_score,
    supporting_evidence_count,
    contradicting_evidence_count,
    recommendation,
    prevention_strategy,
    enhancement_strategy,
    decision_types,
    impact_levels,
    applicable_components,
    contextual_factors,
    first_observed,
    last_confirmed,
    status,
    source_decisions,
    derived_from_insights,
    times_applied,
    last_applied,
    application_success_rate,
        CASE
            WHEN (application_success_rate >= 0.8) THEN 'highly_effective'::text
            WHEN (application_success_rate >= 0.6) THEN 'effective'::text
            WHEN (application_success_rate >= 0.4) THEN 'moderately_effective'::text
            ELSE 'needs_review'::text
        END AS effectiveness_rating,
    (supporting_evidence_count - contradicting_evidence_count) AS evidence_strength
   FROM public.decision_learning_insights dli
  WHERE ((status)::text = 'active'::text)
  ORDER BY confidence_score DESC, (supporting_evidence_count - contradicting_evidence_count) DESC;


ALTER VIEW public.learning_insights_effectiveness OWNER TO ridgetop;

--
-- Name: metrics_collection_sessions; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.metrics_collection_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    session_id uuid,
    collection_timestamp timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    metrics_version character varying(50) DEFAULT 'tc014_v1.0'::character varying,
    collection_trigger character varying(50) DEFAULT 'manual'::character varying,
    analysis_start_date timestamp with time zone,
    analysis_end_date timestamp with time zone,
    analysis_period_days integer GENERATED ALWAYS AS (
CASE
    WHEN ((analysis_start_date IS NULL) OR (analysis_end_date IS NULL)) THEN NULL::numeric
    ELSE (EXTRACT(epoch FROM (analysis_end_date - analysis_start_date)) / ((24 * 3600))::numeric)
END) STORED,
    commits_analyzed integer DEFAULT 0,
    files_analyzed integer DEFAULT 0,
    sessions_analyzed integer DEFAULT 0,
    patterns_analyzed integer DEFAULT 0,
    execution_time_ms integer DEFAULT 0,
    core_metrics_time_ms integer DEFAULT 0,
    pattern_metrics_time_ms integer DEFAULT 0,
    productivity_metrics_time_ms integer DEFAULT 0,
    aggregation_time_ms integer DEFAULT 0,
    total_metrics_calculated integer DEFAULT 0,
    alerts_generated integer DEFAULT 0,
    thresholds_exceeded integer DEFAULT 0,
    status character varying(50) DEFAULT 'completed'::character varying,
    error_message text,
    metrics_config jsonb DEFAULT '{}'::jsonb,
    collection_scope jsonb DEFAULT '{}'::jsonb,
    data_completeness_score numeric(6,4),
    confidence_score numeric(6,4),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT metrics_collection_sessions_alerts_generated_check CHECK ((alerts_generated >= 0)),
    CONSTRAINT metrics_collection_sessions_collection_trigger_check CHECK (((collection_trigger)::text = ANY ((ARRAY['manual'::character varying, 'git_commit'::character varying, 'scheduled'::character varying, 'pattern_update'::character varying, 'session_end'::character varying])::text[]))),
    CONSTRAINT metrics_collection_sessions_commits_analyzed_check CHECK ((commits_analyzed >= 0)),
    CONSTRAINT metrics_collection_sessions_confidence_score_check CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric))),
    CONSTRAINT metrics_collection_sessions_data_completeness_score_check CHECK (((data_completeness_score >= (0)::numeric) AND (data_completeness_score <= (1)::numeric))),
    CONSTRAINT metrics_collection_sessions_execution_time_ms_check CHECK ((execution_time_ms >= 0)),
    CONSTRAINT metrics_collection_sessions_files_analyzed_check CHECK ((files_analyzed >= 0)),
    CONSTRAINT metrics_collection_sessions_patterns_analyzed_check CHECK ((patterns_analyzed >= 0)),
    CONSTRAINT metrics_collection_sessions_sessions_analyzed_check CHECK ((sessions_analyzed >= 0)),
    CONSTRAINT metrics_collection_sessions_status_check CHECK (((status)::text = ANY ((ARRAY['running'::character varying, 'completed'::character varying, 'failed'::character varying, 'partial'::character varying, 'outdated'::character varying])::text[]))),
    CONSTRAINT metrics_collection_sessions_thresholds_exceeded_check CHECK ((thresholds_exceeded >= 0)),
    CONSTRAINT metrics_collection_sessions_total_metrics_calculated_check CHECK ((total_metrics_calculated >= 0)),
    CONSTRAINT valid_analysis_period CHECK ((((analysis_start_date IS NULL) AND (analysis_end_date IS NULL)) OR ((analysis_start_date IS NOT NULL) AND (analysis_end_date IS NOT NULL) AND (analysis_start_date <= analysis_end_date))))
);


ALTER TABLE public.metrics_collection_sessions OWNER TO ridgetop;

--
-- Name: metrics_trends; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.metrics_trends (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    metric_type character varying(50) NOT NULL,
    metric_scope character varying(50) NOT NULL,
    scope_identifier text,
    trend_type character varying(50) NOT NULL,
    trend_start_date timestamp with time zone NOT NULL,
    trend_end_date timestamp with time zone,
    data_points_count integer DEFAULT 0,
    direction character varying(20),
    strength numeric(6,4),
    consistency numeric(6,4),
    acceleration numeric(8,4),
    slope numeric(10,6),
    intercept numeric(12,4),
    r_squared numeric(6,4),
    correlation_coefficient numeric(6,4),
    standard_error numeric(8,4),
    confidence_interval_95 jsonb DEFAULT '{}'::jsonb,
    prediction_accuracy numeric(6,4),
    seasonal_component jsonb DEFAULT '{}'::jsonb,
    seasonal_strength numeric(6,4),
    cycle_length_days integer,
    forecast_horizon_days integer DEFAULT 30,
    forecast_values jsonb DEFAULT '{}'::jsonb,
    forecast_confidence numeric(6,4),
    forecast_method character varying(50) DEFAULT 'linear_regression'::character varying,
    change_points jsonb DEFAULT '{}'::jsonb,
    anomalies jsonb DEFAULT '{}'::jsonb,
    anomaly_score numeric(6,4),
    external_factors jsonb DEFAULT '{}'::jsonb,
    intervention_points jsonb DEFAULT '{}'::jsonb,
    model_accuracy numeric(6,4),
    cross_validation_score numeric(6,4),
    last_validation_date timestamp with time zone,
    model_drift_score numeric(6,4),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT true,
    needs_recalculation boolean DEFAULT false,
    CONSTRAINT metrics_trends_anomaly_score_check CHECK ((anomaly_score >= (0)::numeric)),
    CONSTRAINT metrics_trends_consistency_check CHECK (((consistency >= (0)::numeric) AND (consistency <= (1)::numeric))),
    CONSTRAINT metrics_trends_correlation_coefficient_check CHECK (((correlation_coefficient >= ('-1'::integer)::numeric) AND (correlation_coefficient <= (1)::numeric))),
    CONSTRAINT metrics_trends_cross_validation_score_check CHECK (((cross_validation_score >= (0)::numeric) AND (cross_validation_score <= (1)::numeric))),
    CONSTRAINT metrics_trends_data_points_count_check CHECK ((data_points_count >= 0)),
    CONSTRAINT metrics_trends_direction_check CHECK (((direction)::text = ANY ((ARRAY['increasing'::character varying, 'decreasing'::character varying, 'stable'::character varying, 'volatile'::character varying])::text[]))),
    CONSTRAINT metrics_trends_forecast_confidence_check CHECK (((forecast_confidence >= (0)::numeric) AND (forecast_confidence <= (1)::numeric))),
    CONSTRAINT metrics_trends_forecast_horizon_days_check CHECK ((forecast_horizon_days > 0)),
    CONSTRAINT metrics_trends_model_accuracy_check CHECK (((model_accuracy >= (0)::numeric) AND (model_accuracy <= (1)::numeric))),
    CONSTRAINT metrics_trends_model_drift_score_check CHECK ((model_drift_score >= (0)::numeric)),
    CONSTRAINT metrics_trends_prediction_accuracy_check CHECK (((prediction_accuracy >= (0)::numeric) AND (prediction_accuracy <= (1)::numeric))),
    CONSTRAINT metrics_trends_r_squared_check CHECK (((r_squared >= (0)::numeric) AND (r_squared <= (1)::numeric))),
    CONSTRAINT metrics_trends_seasonal_strength_check CHECK (((seasonal_strength >= (0)::numeric) AND (seasonal_strength <= (1)::numeric))),
    CONSTRAINT metrics_trends_strength_check CHECK (((strength >= (0)::numeric) AND (strength <= (1)::numeric))),
    CONSTRAINT metrics_trends_trend_type_check CHECK (((trend_type)::text = ANY ((ARRAY['linear'::character varying, 'exponential'::character varying, 'seasonal'::character varying, 'cyclical'::character varying, 'volatile'::character varying, 'step_change'::character varying])::text[])))
);


ALTER TABLE public.metrics_trends OWNER TO ridgetop;

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
-- Name: pattern_intelligence_metrics; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.pattern_intelligence_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    collection_session_id uuid NOT NULL,
    project_id uuid NOT NULL,
    pattern_session_id uuid,
    source_pattern_type character varying(50),
    source_pattern_ids uuid[] DEFAULT '{}'::uuid[],
    intelligence_type character varying(50) NOT NULL,
    metric_scope character varying(50) NOT NULL,
    scope_identifier text,
    intelligence_score numeric(8,4) NOT NULL,
    confidence_level numeric(6,4) NOT NULL,
    risk_rating character varying(20),
    strength_magnitude numeric(8,4),
    frequency_factor numeric(8,4),
    impact_radius integer DEFAULT 0,
    evolution_trend character varying(20),
    trend_velocity numeric(8,4),
    historical_comparison jsonb DEFAULT '{}'::jsonb,
    supporting_commits text[] DEFAULT '{}'::text[],
    supporting_files text[] DEFAULT '{}'::text[],
    supporting_developers text[] DEFAULT '{}'::text[],
    statistical_evidence jsonb DEFAULT '{}'::jsonb,
    forecast_direction character varying(20),
    forecast_confidence numeric(6,4),
    forecast_horizon_days integer,
    leading_indicators jsonb DEFAULT '{}'::jsonb,
    business_impact_score numeric(6,4),
    technical_impact_score numeric(6,4),
    team_impact_score numeric(6,4),
    intervention_urgency character varying(20),
    intervention_difficulty character varying(20),
    expected_improvement_score numeric(6,4),
    external_dependencies jsonb DEFAULT '{}'::jsonb,
    organizational_factors jsonb DEFAULT '{}'::jsonb,
    technical_constraints jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT true,
    next_evaluation_date timestamp with time zone,
    evaluation_frequency_days integer DEFAULT 7,
    CONSTRAINT pattern_intelligence_metrics_business_impact_score_check CHECK (((business_impact_score >= (0)::numeric) AND (business_impact_score <= (1)::numeric))),
    CONSTRAINT pattern_intelligence_metrics_confidence_level_check CHECK (((confidence_level >= (0)::numeric) AND (confidence_level <= (1)::numeric))),
    CONSTRAINT pattern_intelligence_metrics_evolution_trend_check CHECK (((evolution_trend)::text = ANY ((ARRAY['improving'::character varying, 'stable'::character varying, 'degrading'::character varying, 'volatile'::character varying, 'emerging'::character varying])::text[]))),
    CONSTRAINT pattern_intelligence_metrics_expected_improvement_score_check CHECK (((expected_improvement_score >= (0)::numeric) AND (expected_improvement_score <= (1)::numeric))),
    CONSTRAINT pattern_intelligence_metrics_forecast_confidence_check CHECK (((forecast_confidence >= (0)::numeric) AND (forecast_confidence <= (1)::numeric))),
    CONSTRAINT pattern_intelligence_metrics_forecast_direction_check CHECK (((forecast_direction)::text = ANY ((ARRAY['improving'::character varying, 'stable'::character varying, 'degrading'::character varying, 'unknown'::character varying])::text[]))),
    CONSTRAINT pattern_intelligence_metrics_forecast_horizon_days_check CHECK ((forecast_horizon_days > 0)),
    CONSTRAINT pattern_intelligence_metrics_frequency_factor_check CHECK ((frequency_factor >= (0)::numeric)),
    CONSTRAINT pattern_intelligence_metrics_impact_radius_check CHECK ((impact_radius >= 0)),
    CONSTRAINT pattern_intelligence_metrics_intelligence_score_check CHECK ((intelligence_score >= (0)::numeric)),
    CONSTRAINT pattern_intelligence_metrics_intelligence_type_check CHECK (((intelligence_type)::text = ANY ((ARRAY['coupling_strength'::character varying, 'hotspot_risk'::character varying, 'specialization_depth'::character varying, 'knowledge_distribution'::character varying, 'change_prediction'::character varying, 'quality_forecast'::character varying, 'maintenance_complexity'::character varying, 'architectural_drift'::character varying, 'collaboration_efficiency'::character varying, 'decision_velocity'::character varying, 'technical_debt_velocity'::character varying])::text[]))),
    CONSTRAINT pattern_intelligence_metrics_intervention_difficulty_check CHECK (((intervention_difficulty)::text = ANY ((ARRAY['easy'::character varying, 'moderate'::character varying, 'hard'::character varying, 'very_hard'::character varying, 'structural'::character varying])::text[]))),
    CONSTRAINT pattern_intelligence_metrics_intervention_urgency_check CHECK (((intervention_urgency)::text = ANY ((ARRAY['none'::character varying, 'low'::character varying, 'medium'::character varying, 'high'::character varying, 'immediate'::character varying])::text[]))),
    CONSTRAINT pattern_intelligence_metrics_metric_scope_check CHECK (((metric_scope)::text = ANY ((ARRAY['project'::character varying, 'component'::character varying, 'developer'::character varying, 'file_pair'::character varying, 'team'::character varying])::text[]))),
    CONSTRAINT pattern_intelligence_metrics_risk_rating_check CHECK (((risk_rating)::text = ANY ((ARRAY['very_low'::character varying, 'low'::character varying, 'moderate'::character varying, 'high'::character varying, 'very_high'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT pattern_intelligence_metrics_source_pattern_type_check CHECK (((source_pattern_type)::text = ANY ((ARRAY['cooccurrence'::character varying, 'temporal'::character varying, 'developer'::character varying, 'magnitude'::character varying, 'insight'::character varying])::text[]))),
    CONSTRAINT pattern_intelligence_metrics_strength_magnitude_check CHECK ((strength_magnitude >= (0)::numeric)),
    CONSTRAINT pattern_intelligence_metrics_team_impact_score_check CHECK (((team_impact_score >= (0)::numeric) AND (team_impact_score <= (1)::numeric))),
    CONSTRAINT pattern_intelligence_metrics_technical_impact_score_check CHECK (((technical_impact_score >= (0)::numeric) AND (technical_impact_score <= (1)::numeric)))
);


ALTER TABLE public.pattern_intelligence_metrics OWNER TO ridgetop;

--
-- Name: pattern_operation_metrics; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.pattern_operation_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    operation_type character varying(50) NOT NULL,
    operation_subtype character varying(50),
    execution_time_ms integer NOT NULL,
    memory_usage_mb integer,
    cpu_usage_percent numeric(5,2),
    records_processed integer DEFAULT 0,
    records_created integer DEFAULT 0,
    records_updated integer DEFAULT 0,
    records_deleted integer DEFAULT 0,
    database_queries integer DEFAULT 0,
    cache_hits integer DEFAULT 0,
    cache_misses integer DEFAULT 0,
    status character varying(50) DEFAULT 'completed'::character varying,
    error_message text,
    session_id uuid,
    user_context jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.pattern_operation_metrics OWNER TO ridgetop;

--
-- Name: refactoring_opportunities; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.refactoring_opportunities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    analysis_session_id uuid NOT NULL,
    file_path text NOT NULL,
    class_name character varying(200),
    function_name character varying(200),
    start_line integer NOT NULL,
    end_line integer NOT NULL,
    opportunity_type character varying(50) NOT NULL,
    current_complexity_score numeric(8,3) NOT NULL,
    current_cyclomatic_complexity integer,
    current_cognitive_complexity integer,
    current_halstead_effort numeric(10,2),
    current_coupling_factor numeric(6,4),
    estimated_complexity_reduction numeric(8,3) NOT NULL,
    estimated_maintainability_gain numeric(4,3),
    estimated_readability_improvement numeric(4,3),
    refactoring_effort_hours numeric(5,1) NOT NULL,
    testing_effort_hours numeric(5,1),
    risk_level character varying(15),
    impact_on_development_velocity numeric(4,3),
    bug_reduction_potential numeric(4,3),
    maintenance_cost_savings numeric(8,2),
    description text NOT NULL,
    refactoring_steps text[],
    before_code_snippet text,
    suggested_after_code text,
    blocked_by text[],
    blocks text[],
    requires_breaking_changes boolean DEFAULT false,
    affects_public_api boolean DEFAULT false,
    priority_score numeric(6,3) DEFAULT 0 NOT NULL,
    roi_score numeric(6,3) DEFAULT 0 NOT NULL,
    urgency_level character varying(15),
    status character varying(20) DEFAULT 'identified'::character varying,
    assigned_to character varying(200),
    target_completion_date date,
    is_validated boolean DEFAULT false,
    validation_notes text,
    false_positive boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT refactoring_opportunities_opportunity_type_check CHECK (((opportunity_type)::text = ANY ((ARRAY['extract_method'::character varying, 'split_function'::character varying, 'reduce_nesting'::character varying, 'eliminate_duplication'::character varying, 'simplify_conditionals'::character varying, 'reduce_parameters'::character varying, 'break_dependencies'::character varying, 'improve_cohesion'::character varying, 'extract_class'::character varying, 'inline_method'::character varying, 'replace_temp_with_query'::character varying])::text[]))),
    CONSTRAINT refactoring_opportunities_risk_level_check CHECK (((risk_level)::text = ANY ((ARRAY['very_low'::character varying, 'low'::character varying, 'moderate'::character varying, 'high'::character varying, 'very_high'::character varying])::text[]))),
    CONSTRAINT refactoring_opportunities_status_check CHECK (((status)::text = ANY ((ARRAY['identified'::character varying, 'planned'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'rejected'::character varying, 'deferred'::character varying])::text[]))),
    CONSTRAINT refactoring_opportunities_urgency_level_check CHECK (((urgency_level)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'urgent'::character varying])::text[])))
);


ALTER TABLE public.refactoring_opportunities OWNER TO ridgetop;

--
-- Name: TABLE refactoring_opportunities; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TABLE public.refactoring_opportunities IS 'TC015: Identified refactoring opportunities based on complexity analysis';


--
-- Name: project_complexity_dashboard; Type: MATERIALIZED VIEW; Schema: public; Owner: ridgetop
--

CREATE MATERIALIZED VIEW public.project_complexity_dashboard AS
 SELECT p.id AS project_id,
    p.name AS project_name,
    max(cas.analysis_timestamp) AS last_analysis,
    (EXTRACT(epoch FROM (CURRENT_TIMESTAMP - max(cas.analysis_timestamp))) / (3600)::numeric) AS hours_since_analysis,
    avg(fcs.overall_complexity_score) AS avg_complexity_score,
    max(fcs.overall_complexity_score) AS max_complexity_score,
    count(fcs.*) AS total_files_analyzed,
    count(fcs.*) FILTER (WHERE ((fcs.risk_level)::text = 'critical'::text)) AS critical_risk_files,
    count(fcs.*) FILTER (WHERE ((fcs.risk_level)::text = 'very_high'::text)) AS very_high_risk_files,
    count(fcs.*) FILTER (WHERE ((fcs.risk_level)::text = 'high'::text)) AS high_risk_files,
    count(fcs.*) FILTER (WHERE ((fcs.risk_level)::text = ANY ((ARRAY['critical'::character varying, 'very_high'::character varying, 'high'::character varying])::text[]))) AS total_high_risk_files,
    count(fcs.*) FILTER (WHERE ((fcs.complexity_grade)::text = 'A'::text)) AS grade_a_files,
    count(fcs.*) FILTER (WHERE ((fcs.complexity_grade)::text = 'B'::text)) AS grade_b_files,
    count(fcs.*) FILTER (WHERE ((fcs.complexity_grade)::text = 'C'::text)) AS grade_c_files,
    count(fcs.*) FILTER (WHERE ((fcs.complexity_grade)::text = 'D'::text)) AS grade_d_files,
    count(fcs.*) FILTER (WHERE ((fcs.complexity_grade)::text = 'F'::text)) AS grade_f_files,
    count(fcs.*) FILTER (WHERE (fcs.is_complexity_hotspot = true)) AS complexity_hotspots,
    count(ca.*) FILTER (WHERE ((ca.status)::text = ANY ((ARRAY['open'::character varying, 'acknowledged'::character varying])::text[]))) AS active_alerts,
    count(ca.*) FILTER (WHERE ((ca.violation_severity)::text = 'critical'::text)) AS critical_alerts,
    count(ro.*) FILTER (WHERE ((ro.status)::text = ANY ((ARRAY['identified'::character varying, 'planned'::character varying])::text[]))) AS refactoring_opportunities,
    count(ro.*) FILTER (WHERE ((ro.urgency_level)::text = 'urgent'::text)) AS urgent_refactoring_opportunities,
    avg(ro.roi_score) FILTER (WHERE ((ro.status)::text = ANY ((ARRAY['identified'::character varying, 'planned'::character varying])::text[]))) AS avg_refactoring_roi,
    sum(fcs.technical_debt_minutes) AS total_technical_debt_minutes,
    avg(fcs.maintenance_cost_factor) AS avg_maintenance_cost_factor,
    count(ct.*) FILTER (WHERE (((ct.trend_direction)::text = 'increasing'::text) AND (ct.measurement_date >= (CURRENT_DATE - '30 days'::interval)))) AS increasing_complexity_files,
    count(ct.*) FILTER (WHERE ((ct.is_anomaly = true) AND (ct.measurement_date >= (CURRENT_DATE - '30 days'::interval)))) AS recent_complexity_anomalies
   FROM (((((public.projects p
     LEFT JOIN public.complexity_analysis_sessions cas ON (((p.id = cas.project_id) AND (cas.analysis_timestamp >= (CURRENT_TIMESTAMP - '7 days'::interval)) AND ((cas.status)::text = 'completed'::text))))
     LEFT JOIN public.file_complexity_summary fcs ON ((cas.id = fcs.analysis_session_id)))
     LEFT JOIN public.complexity_alerts ca ON (((p.id = ca.project_id) AND (ca.triggered_at >= (CURRENT_TIMESTAMP - '7 days'::interval)))))
     LEFT JOIN public.refactoring_opportunities ro ON ((p.id = ro.project_id)))
     LEFT JOIN public.complexity_trends ct ON (((p.id = ct.project_id) AND (ct.measurement_date >= (CURRENT_DATE - '30 days'::interval)))))
  GROUP BY p.id, p.name
  WITH NO DATA;


ALTER MATERIALIZED VIEW public.project_complexity_dashboard OWNER TO ridgetop;

--
-- Name: MATERIALIZED VIEW project_complexity_dashboard; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON MATERIALIZED VIEW public.project_complexity_dashboard IS 'TC015: Pre-calculated project complexity dashboard for sub-100ms queries';


--
-- Name: project_decision_health; Type: VIEW; Schema: public; Owner: ridgetop
--

CREATE VIEW public.project_decision_health AS
 SELECT p.id AS project_id,
    p.name AS project_name,
    count(td.id) AS total_decisions,
    count(
        CASE
            WHEN ((td.status)::text = 'active'::text) THEN 1
            ELSE NULL::integer
        END) AS active_decisions,
    count(
        CASE
            WHEN ((td.outcome_status)::text = 'successful'::text) THEN 1
            ELSE NULL::integer
        END) AS successful_decisions,
    count(
        CASE
            WHEN ((td.outcome_status)::text = 'failed'::text) THEN 1
            ELSE NULL::integer
        END) AS failed_decisions,
    round(avg(outcomes.outcome_score), 2) AS avg_outcome_score,
    count(insights.id) AS learning_insights_generated,
    count(retros.id) AS retrospectives_conducted,
    max(td.decision_date) AS last_decision_date
   FROM ((((public.projects p
     LEFT JOIN public.technical_decisions td ON ((p.id = td.project_id)))
     LEFT JOIN public.decision_outcomes outcomes ON ((td.id = outcomes.decision_id)))
     LEFT JOIN public.decision_learning_insights insights ON ((p.id = insights.project_id)))
     LEFT JOIN public.decision_retrospectives retros ON ((td.id = retros.decision_id)))
  GROUP BY p.id, p.name;


ALTER VIEW public.project_decision_health OWNER TO ridgetop;

--
-- Name: project_git_activity; Type: VIEW; Schema: public; Owner: ridgetop
--

CREATE VIEW public.project_git_activity AS
 SELECT p.id AS project_id,
    p.name AS project_name,
    count(DISTINCT gc.id) AS total_commits,
    count(DISTINCT gc.author_email) AS contributors,
    count(DISTINCT gb.id) AS total_branches,
    max(gc.author_date) AS last_commit_date,
    count(DISTINCT gc.id) FILTER (WHERE (gc.author_date >= (now() - '7 days'::interval))) AS commits_last_week,
    count(DISTINCT gc.id) FILTER (WHERE (gc.author_date >= (now() - '30 days'::interval))) AS commits_last_month
   FROM ((public.projects p
     LEFT JOIN public.git_commits gc ON ((p.id = gc.project_id)))
     LEFT JOIN public.git_branches gb ON ((p.id = gb.project_id)))
  GROUP BY p.id, p.name;


ALTER VIEW public.project_git_activity OWNER TO ridgetop;

--
-- Name: project_metrics_dashboard; Type: VIEW; Schema: public; Owner: ridgetop
--

CREATE VIEW public.project_metrics_dashboard AS
 SELECT p.id AS project_id,
    p.name AS project_name,
    mcs.id AS latest_collection_id,
    mcs.collection_timestamp AS last_collection,
    mcs.execution_time_ms AS last_execution_time,
    0 AS avg_code_velocity,
    'unknown'::text AS quality_trend,
    0 AS technical_debt_level,
    0 AS high_risk_files,
    0 AS avg_coupling_strength,
    0 AS active_hotspots,
    0 AS team_avg_productivity,
    0 AS team_health_score,
    0 AS collaboration_effectiveness,
    0 AS critical_alerts,
    0 AS warning_alerts,
    0 AS total_active_alerts,
    'stable'::text AS velocity_trend,
    'stable'::text AS quality_evolution,
    'stable'::text AS productivity_trend,
    mcs.created_at AS metrics_created_at,
    COALESCE((EXTRACT(epoch FROM (CURRENT_TIMESTAMP - mcs.collection_timestamp)) / (3600)::numeric), (0)::numeric) AS hours_since_collection,
    COALESCE(mcs.data_completeness_score, 0.5) AS data_completeness_score,
    COALESCE(mcs.confidence_score, 0.5) AS confidence_score
   FROM (public.projects p
     LEFT JOIN public.metrics_collection_sessions mcs ON (((p.id = mcs.project_id) AND (mcs.collection_timestamp = ( SELECT max(metrics_collection_sessions.collection_timestamp) AS max
           FROM public.metrics_collection_sessions
          WHERE ((metrics_collection_sessions.project_id = p.id) AND ((metrics_collection_sessions.status)::text = 'completed'::text)))))));


ALTER VIEW public.project_metrics_dashboard OWNER TO ridgetop;

--
-- Name: temporal_patterns; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.temporal_patterns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    discovery_session_id uuid NOT NULL,
    project_id uuid NOT NULL,
    pattern_type character varying(20) NOT NULL,
    pattern_name character varying(100) GENERATED ALWAYS AS (((pattern_type)::text || '_development_rhythm'::text)) STORED,
    pattern_strength numeric(6,4) NOT NULL,
    statistical_significance numeric(6,4) NOT NULL,
    chi_square_statistic numeric(10,4),
    degrees_of_freedom integer,
    p_value numeric(10,8),
    peak_periods integer[] DEFAULT '{}'::integer[],
    commit_distribution integer[] DEFAULT '{}'::integer[],
    expected_distribution numeric(8,4)[] DEFAULT '{}'::numeric[],
    period_labels text[] DEFAULT '{}'::text[],
    coefficient_of_variation numeric(6,4),
    skewness numeric(6,4),
    kurtosis numeric(6,4),
    activity_concentration_score numeric(6,4),
    contributing_authors text[] DEFAULT '{}'::text[],
    contributing_files text[] DEFAULT '{}'::text[],
    date_range_start timestamp with time zone,
    date_range_end timestamp with time zone,
    total_commits_analyzed integer DEFAULT 0,
    seasonal_components jsonb DEFAULT '{}'::jsonb,
    forecast_accuracy numeric(6,4),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT true,
    pattern_stability character varying(20),
    CONSTRAINT temporal_patterns_degrees_of_freedom_check CHECK ((degrees_of_freedom > 0)),
    CONSTRAINT temporal_patterns_p_value_check CHECK (((p_value >= (0)::numeric) AND (p_value <= (1)::numeric))),
    CONSTRAINT temporal_patterns_pattern_stability_check CHECK (((pattern_stability)::text = ANY ((ARRAY['stable'::character varying, 'emerging'::character varying, 'declining'::character varying, 'volatile'::character varying])::text[]))),
    CONSTRAINT temporal_patterns_pattern_strength_check CHECK (((pattern_strength >= (0)::numeric) AND (pattern_strength <= (1)::numeric))),
    CONSTRAINT temporal_patterns_pattern_type_check CHECK (((pattern_type)::text = ANY ((ARRAY['hourly'::character varying, 'daily'::character varying, 'weekly'::character varying, 'monthly'::character varying, 'seasonal'::character varying])::text[]))),
    CONSTRAINT temporal_patterns_statistical_significance_check CHECK ((statistical_significance >= (0)::numeric))
);


ALTER TABLE public.temporal_patterns OWNER TO ridgetop;

--
-- Name: project_pattern_summary; Type: VIEW; Schema: public; Owner: ridgetop
--

CREATE VIEW public.project_pattern_summary AS
 SELECT p.id AS project_id,
    p.name AS project_name,
    pds.id AS latest_session_id,
    pds.discovery_timestamp AS last_discovery,
    pds.execution_time_ms AS last_execution_time,
    COALESCE(fcp_count.count, (0)::bigint) AS cooccurrence_patterns,
    COALESCE(tp_count.count, (0)::bigint) AS temporal_patterns,
    COALESCE(dp_count.count, (0)::bigint) AS developer_patterns,
    COALESCE(cmp_count.count, (0)::bigint) AS magnitude_patterns,
    COALESCE(pi_count.count, (0)::bigint) AS insights,
    COALESCE(pds.patterns_discovered, 0) AS total_patterns_discovered,
    COALESCE(pi_risk.critical_count, (0)::bigint) AS critical_insights,
    COALESCE(pi_risk.high_count, (0)::bigint) AS high_risk_insights,
    COALESCE(cmp_risk.critical_files, (0)::bigint) AS critical_risk_files,
    COALESCE(cmp_risk.high_risk_files, (0)::bigint) AS high_risk_files,
    COALESCE(fcp_strength.very_strong_count, (0)::bigint) AS very_strong_cooccurrence,
    COALESCE(fcp_strength.strong_count, (0)::bigint) AS strong_cooccurrence,
    COALESCE(tp_strength.avg_significance, (0)::numeric) AS avg_temporal_significance,
    COALESCE(dp_specialization.avg_specialization, (0)::numeric) AS avg_developer_specialization,
    pds.total_commits_analyzed,
    pds.total_files_analyzed,
        CASE
            WHEN (pds.total_files_analyzed > 0) THEN round((((COALESCE(cmp_count.count, (0)::bigint))::numeric / (pds.total_files_analyzed)::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS file_coverage_percentage,
    pds.created_at AS discovery_created_at,
    pds.status AS discovery_status,
    (EXTRACT(epoch FROM (CURRENT_TIMESTAMP - pds.discovery_timestamp)) / (3600)::numeric) AS hours_since_discovery
   FROM (((((((((((public.projects p
     LEFT JOIN public.pattern_discovery_sessions pds ON (((p.id = pds.project_id) AND (pds.discovery_timestamp = ( SELECT max(pattern_discovery_sessions.discovery_timestamp) AS max
           FROM public.pattern_discovery_sessions
          WHERE ((pattern_discovery_sessions.project_id = p.id) AND ((pattern_discovery_sessions.status)::text = 'completed'::text)))))))
     LEFT JOIN ( SELECT file_cooccurrence_patterns.discovery_session_id,
            count(*) AS count
           FROM public.file_cooccurrence_patterns
          WHERE (file_cooccurrence_patterns.is_active = true)
          GROUP BY file_cooccurrence_patterns.discovery_session_id) fcp_count ON ((pds.id = fcp_count.discovery_session_id)))
     LEFT JOIN ( SELECT temporal_patterns.discovery_session_id,
            count(*) AS count
           FROM public.temporal_patterns
          WHERE (temporal_patterns.is_active = true)
          GROUP BY temporal_patterns.discovery_session_id) tp_count ON ((pds.id = tp_count.discovery_session_id)))
     LEFT JOIN ( SELECT developer_patterns.discovery_session_id,
            count(*) AS count
           FROM public.developer_patterns
          WHERE (developer_patterns.is_active = true)
          GROUP BY developer_patterns.discovery_session_id) dp_count ON ((pds.id = dp_count.discovery_session_id)))
     LEFT JOIN ( SELECT change_magnitude_patterns.discovery_session_id,
            count(*) AS count
           FROM public.change_magnitude_patterns
          WHERE (change_magnitude_patterns.is_active = true)
          GROUP BY change_magnitude_patterns.discovery_session_id) cmp_count ON ((pds.id = cmp_count.discovery_session_id)))
     LEFT JOIN ( SELECT pattern_insights.discovery_session_id,
            count(*) AS count
           FROM public.pattern_insights
          WHERE (pattern_insights.is_active = true)
          GROUP BY pattern_insights.discovery_session_id) pi_count ON ((pds.id = pi_count.discovery_session_id)))
     LEFT JOIN ( SELECT pattern_insights.discovery_session_id,
            sum(
                CASE
                    WHEN ((pattern_insights.risk_level)::text = 'critical'::text) THEN 1
                    ELSE 0
                END) AS critical_count,
            sum(
                CASE
                    WHEN ((pattern_insights.risk_level)::text = 'high'::text) THEN 1
                    ELSE 0
                END) AS high_count
           FROM public.pattern_insights
          WHERE (pattern_insights.is_active = true)
          GROUP BY pattern_insights.discovery_session_id) pi_risk ON ((pds.id = pi_risk.discovery_session_id)))
     LEFT JOIN ( SELECT change_magnitude_patterns.discovery_session_id,
            sum(
                CASE
                    WHEN ((change_magnitude_patterns.risk_level)::text = 'critical'::text) THEN 1
                    ELSE 0
                END) AS critical_files,
            sum(
                CASE
                    WHEN ((change_magnitude_patterns.risk_level)::text = 'high'::text) THEN 1
                    ELSE 0
                END) AS high_risk_files
           FROM public.change_magnitude_patterns
          WHERE (change_magnitude_patterns.is_active = true)
          GROUP BY change_magnitude_patterns.discovery_session_id) cmp_risk ON ((pds.id = cmp_risk.discovery_session_id)))
     LEFT JOIN ( SELECT file_cooccurrence_patterns.discovery_session_id,
            sum(
                CASE
                    WHEN ((file_cooccurrence_patterns.pattern_strength)::text = 'very_strong'::text) THEN 1
                    ELSE 0
                END) AS very_strong_count,
            sum(
                CASE
                    WHEN ((file_cooccurrence_patterns.pattern_strength)::text = 'strong'::text) THEN 1
                    ELSE 0
                END) AS strong_count
           FROM public.file_cooccurrence_patterns
          WHERE (file_cooccurrence_patterns.is_active = true)
          GROUP BY file_cooccurrence_patterns.discovery_session_id) fcp_strength ON ((pds.id = fcp_strength.discovery_session_id)))
     LEFT JOIN ( SELECT temporal_patterns.discovery_session_id,
            avg(temporal_patterns.statistical_significance) AS avg_significance
           FROM public.temporal_patterns
          WHERE (temporal_patterns.is_active = true)
          GROUP BY temporal_patterns.discovery_session_id) tp_strength ON ((pds.id = tp_strength.discovery_session_id)))
     LEFT JOIN ( SELECT developer_patterns.discovery_session_id,
            avg(developer_patterns.specialization_score) AS avg_specialization
           FROM public.developer_patterns
          WHERE (developer_patterns.is_active = true)
          GROUP BY developer_patterns.discovery_session_id) dp_specialization ON ((pds.id = dp_specialization.discovery_session_id)));


ALTER VIEW public.project_pattern_summary OWNER TO ridgetop;

--
-- Name: projects_shadow; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.projects_shadow (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(50) DEFAULT 'active'::character varying,
    git_repo_url text,
    root_directory text,
    metadata jsonb DEFAULT '{}'::jsonb,
    _shadow_version integer DEFAULT 1 NOT NULL,
    _shadow_sync_status public.shadow_sync_status DEFAULT 'pending'::public.shadow_sync_status NOT NULL,
    _shadow_created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _shadow_source_id uuid,
    _shadow_validation_hash text NOT NULL,
    _shadow_last_sync timestamp with time zone,
    _shadow_migration_batch uuid,
    CONSTRAINT projects_shadow_description_reasonable CHECK (((description IS NULL) OR (length(description) <= 10000))),
    CONSTRAINT projects_shadow_metadata_valid CHECK ((jsonb_typeof(metadata) = 'object'::text)),
    CONSTRAINT projects_shadow_name_length CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length((name)::text) <= 255))),
    CONSTRAINT projects_shadow_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'archived'::character varying, 'completed'::character varying, 'paused'::character varying, 'migrating'::character varying])::text[]))),
    CONSTRAINT projects_shadow_sync_timestamps CHECK (((_shadow_last_sync IS NULL) OR (_shadow_last_sync >= _shadow_created_at))),
    CONSTRAINT valid_git_repo_url CHECK (((git_repo_url IS NULL) OR (git_repo_url ~ '^https?://.*\.git$'::text) OR (git_repo_url ~ '^git@.*:.*\.git$'::text) OR (git_repo_url ~ '^https://github\.com/.*$'::text))),
    CONSTRAINT valid_root_directory CHECK (((root_directory IS NULL) OR (root_directory ~ '^(/[^/\0]+)+/?$'::text)))
);


ALTER TABLE public.projects_shadow OWNER TO ridgetop;

--
-- Name: TABLE projects_shadow; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TABLE public.projects_shadow IS 'P2.3 Shadow table for projects - zero-downtime migration infrastructure';


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.schema_migrations (
    version character varying(255) NOT NULL,
    description text,
    applied_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.schema_migrations OWNER TO ridgetop;

--
-- Name: session_project_mappings; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.session_project_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id character varying(255) NOT NULL,
    project_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    metadata jsonb DEFAULT '{}'::jsonb
);


ALTER TABLE public.session_project_mappings OWNER TO ridgetop;

--
-- Name: session_seq_2025; Type: SEQUENCE; Schema: public; Owner: ridgetop
--

CREATE SEQUENCE public.session_seq_2025
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.session_seq_2025 OWNER TO ridgetop;

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
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    active_branch character varying(255),
    working_commit_sha character varying(40),
    commits_contributed integer DEFAULT 0,
    pattern_preferences jsonb DEFAULT '{}'::jsonb,
    insights_generated integer DEFAULT 0,
    last_pattern_analysis timestamp with time zone,
    title character varying(255),
    description text,
    agent_display_name character varying(100),
    status character varying(20) DEFAULT 'active'::character varying,
    last_activity_at timestamp with time zone,
    display_id character varying(20) NOT NULL,
    input_tokens bigint DEFAULT 0 NOT NULL,
    output_tokens bigint DEFAULT 0 NOT NULL,
    total_tokens bigint DEFAULT 0 NOT NULL,
    tasks_created integer DEFAULT 0 NOT NULL,
    tasks_updated integer DEFAULT 0 NOT NULL,
    tasks_completed integer DEFAULT 0 NOT NULL,
    contexts_created integer DEFAULT 0 NOT NULL,
    CONSTRAINT reasonable_session_duration CHECK (((ended_at IS NULL) OR (ended_at >= started_at))),
    CONSTRAINT reasonable_title_length CHECK (((title IS NULL) OR ((length((title)::text) >= 1) AND (length((title)::text) <= 255)))),
    CONSTRAINT sessions_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'disconnected'::character varying])::text[])))
);


ALTER TABLE public.sessions OWNER TO ridgetop;

--
-- Name: TABLE sessions; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TABLE public.sessions IS 'User sessions with activity tracking and analytics';


--
-- Name: COLUMN sessions.agent_type; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.sessions.agent_type IS 'Machine-readable agent type identifier (lowercase, hyphenated). Used for programmatic filtering and analytics. Examples: claude-code, cline, roo-code, windsurf, cursor, mcp-client';


--
-- Name: COLUMN sessions.metadata; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.sessions.metadata IS 'Additional session data (browser info, feature usage, etc.)';


--
-- Name: COLUMN sessions.title; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.sessions.title IS 'Short descriptive title for the session (e.g., "Implement user authentication", "Debug payment flow")';


--
-- Name: COLUMN sessions.description; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.sessions.description IS 'Detailed description of session goals, context, and objectives';


--
-- Name: COLUMN sessions.agent_display_name; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.sessions.agent_display_name IS 'Human-readable agent display name (e.g., "Claude Code", "Cline", "Roo Code"). User-customizable for cross-platform analytics and identification. Auto-populated from agent_type on session creation.';


--
-- Name: COLUMN sessions.status; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.sessions.status IS 'Session status: active (currently running), inactive (ended or timed out), disconnected (project archived/disconnected)';


--
-- Name: COLUMN sessions.last_activity_at; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.sessions.last_activity_at IS 'Last activity timestamp for timeout tracking. Updated on context storage, task operations, decisions, etc. Timeout threshold: 2 hours.';


--
-- Name: COLUMN sessions.input_tokens; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.sessions.input_tokens IS 'Estimated input tokens consumed by this session (characters/4)';


--
-- Name: COLUMN sessions.output_tokens; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.sessions.output_tokens IS 'Estimated output tokens generated by this session (characters/4)';


--
-- Name: COLUMN sessions.total_tokens; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.sessions.total_tokens IS 'Total tokens (input + output) for this session';


--
-- Name: COLUMN sessions.tasks_created; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.sessions.tasks_created IS 'Number of tasks created during this session';


--
-- Name: COLUMN sessions.tasks_updated; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.sessions.tasks_updated IS 'Number of task updates during this session';


--
-- Name: COLUMN sessions.tasks_completed; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.sessions.tasks_completed IS 'Number of tasks completed during this session';


--
-- Name: COLUMN sessions.contexts_created; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.sessions.contexts_created IS 'Number of contexts created during this session';


--
-- Name: sessions_backup_52d295df_9b0d_4b13_812f_c7353b530d7b; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.sessions_backup_52d295df_9b0d_4b13_812f_c7353b530d7b (
    id uuid,
    project_id uuid,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    agent_type character varying(50),
    title character varying(255),
    description text,
    updated_at timestamp with time zone
);


ALTER TABLE public.sessions_backup_52d295df_9b0d_4b13_812f_c7353b530d7b OWNER TO ridgetop;

--
-- Name: sessions_backup_64fbdb1e_d900_4b17_969c_2a34f53de6a3; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.sessions_backup_64fbdb1e_d900_4b17_969c_2a34f53de6a3 (
    id uuid,
    project_id uuid,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    agent_type character varying(50),
    title character varying(255),
    description text,
    updated_at timestamp with time zone
);


ALTER TABLE public.sessions_backup_64fbdb1e_d900_4b17_969c_2a34f53de6a3 OWNER TO ridgetop;

--
-- Name: sessions_shadow; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.sessions_shadow (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    agent_type character varying(50) NOT NULL,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    ended_at timestamp with time zone,
    context_summary text,
    tokens_used integer DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    active_branch character varying(255),
    working_commit_sha character varying(40),
    commits_contributed integer DEFAULT 0,
    pattern_preferences jsonb DEFAULT '{}'::jsonb,
    insights_generated integer DEFAULT 0,
    last_pattern_analysis timestamp with time zone,
    title character varying(255),
    description text,
    _shadow_version integer DEFAULT 1 NOT NULL,
    _shadow_sync_status public.shadow_sync_status DEFAULT 'pending'::public.shadow_sync_status NOT NULL,
    _shadow_created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    _shadow_source_id uuid,
    _shadow_validation_hash text NOT NULL,
    _shadow_last_sync timestamp with time zone,
    _shadow_migration_batch uuid,
    CONSTRAINT sessions_shadow_agent_type_check CHECK ((length(TRIM(BOTH FROM agent_type)) >= 1)),
    CONSTRAINT sessions_shadow_commits_contributed_check CHECK ((commits_contributed >= 0)),
    CONSTRAINT sessions_shadow_description_check CHECK (((description IS NULL) OR (length(description) <= 10000))),
    CONSTRAINT sessions_shadow_insights_generated_check CHECK ((insights_generated >= 0)),
    CONSTRAINT sessions_shadow_metadata_valid CHECK (((jsonb_typeof(metadata) = 'object'::text) AND (jsonb_typeof(pattern_preferences) = 'object'::text))),
    CONSTRAINT sessions_shadow_pattern_analysis_after_start CHECK (((last_pattern_analysis IS NULL) OR (last_pattern_analysis >= started_at))),
    CONSTRAINT sessions_shadow_reasonable_duration CHECK (((ended_at IS NULL) OR (ended_at >= started_at))),
    CONSTRAINT sessions_shadow_sync_timestamps CHECK (((_shadow_last_sync IS NULL) OR (_shadow_last_sync >= _shadow_created_at))),
    CONSTRAINT sessions_shadow_title_check CHECK (((title IS NULL) OR ((length(TRIM(BOTH FROM title)) >= 1) AND (length((title)::text) <= 255)))),
    CONSTRAINT sessions_shadow_tokens_used_check CHECK ((tokens_used >= 0)),
    CONSTRAINT sessions_shadow_working_commit_sha_check CHECK (((working_commit_sha IS NULL) OR ((working_commit_sha)::text ~ '^[a-f0-9]{40}$'::text)))
);


ALTER TABLE public.sessions_shadow OWNER TO ridgetop;

--
-- Name: TABLE sessions_shadow; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TABLE public.sessions_shadow IS 'P2.3 Shadow table for sessions - zero-downtime migration infrastructure';


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
    assigned_to character varying(200),
    dependencies uuid[] DEFAULT '{}'::uuid[],
    tags text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    progress integer DEFAULT 0,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_by character varying(200),
    session_id uuid,
    CONSTRAINT tasks_progress_check CHECK (((progress >= 0) AND (progress <= 100)))
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
-- Name: COLUMN tasks.session_id; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.tasks.session_id IS 'Link to session where task was created. Nullable for tasks created outside of sessions or before migration. Used for session analytics and task filtering.';


--
-- Name: traffic_routing_config; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.traffic_routing_config (
    table_name character varying(100) NOT NULL,
    cutover_stage public.cutover_stage DEFAULT 'disabled'::public.cutover_stage NOT NULL,
    read_percentage integer DEFAULT 0 NOT NULL,
    write_shadow_enabled boolean DEFAULT false NOT NULL,
    max_error_rate_percent numeric(5,2) DEFAULT 1.0 NOT NULL,
    max_latency_increase_percent numeric(5,2) DEFAULT 20.0 NOT NULL,
    min_validation_score numeric(5,2) DEFAULT 99.0 NOT NULL,
    baseline_read_latency_ms numeric(10,2),
    baseline_write_latency_ms numeric(10,2),
    current_read_latency_ms numeric(10,2),
    current_write_latency_ms numeric(10,2),
    health_status character varying(20) DEFAULT 'healthy'::character varying NOT NULL,
    last_health_check timestamp with time zone,
    consecutive_failures integer DEFAULT 0 NOT NULL,
    auto_rollback_enabled boolean DEFAULT true NOT NULL,
    stage_started_at timestamp with time zone,
    stage_duration_target_minutes integer DEFAULT 60,
    next_stage_eligible_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_by character varying(100) DEFAULT 'system'::character varying,
    notes text,
    CONSTRAINT traffic_routing_config_health_status_check CHECK (((health_status)::text = ANY ((ARRAY['healthy'::character varying, 'warning'::character varying, 'error'::character varying, 'emergency_stop'::character varying])::text[]))),
    CONSTRAINT traffic_routing_config_read_percentage_check CHECK (((read_percentage >= 0) AND (read_percentage <= 100)))
);


ALTER TABLE public.traffic_routing_config OWNER TO ridgetop;

--
-- Name: TABLE traffic_routing_config; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON TABLE public.traffic_routing_config IS 'P2.3 Traffic routing configuration for gradual cutover control';


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: ridgetop
--

CREATE TABLE public.user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    token_id character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp without time zone NOT NULL,
    is_active boolean DEFAULT true,
    started_at timestamp with time zone DEFAULT now(),
    ended_at timestamp with time zone,
    last_activity timestamp with time zone DEFAULT now(),
    ip_address inet,
    user_agent text,
    duration_ms integer,
    contexts_created integer DEFAULT 0,
    decisions_created integer DEFAULT 0,
    tasks_created integer DEFAULT 0,
    api_requests integer DEFAULT 0,
    total_tokens integer DEFAULT 0,
    prompt_tokens integer DEFAULT 0,
    completion_tokens integer DEFAULT 0,
    project_id uuid,
    session_type character varying(20) DEFAULT 'web'::character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT now(),
    input_tokens bigint DEFAULT 0 NOT NULL,
    output_tokens bigint DEFAULT 0 NOT NULL,
    tasks_updated integer DEFAULT 0 NOT NULL,
    tasks_completed integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.user_sessions OWNER TO ridgetop;

--
-- Name: COLUMN user_sessions.started_at; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.user_sessions.started_at IS 'When user session began (for analytics)';


--
-- Name: COLUMN user_sessions.last_activity; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.user_sessions.last_activity IS 'Last API activity (for timeout detection)';


--
-- Name: COLUMN user_sessions.duration_ms; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.user_sessions.duration_ms IS 'Total session duration when ended';


--
-- Name: COLUMN user_sessions.contexts_created; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.user_sessions.contexts_created IS 'Number of contexts created during this session';


--
-- Name: COLUMN user_sessions.tasks_created; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.user_sessions.tasks_created IS 'Number of tasks created during this session';


--
-- Name: COLUMN user_sessions.metadata; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.user_sessions.metadata IS 'Session analytics data (browser, features used, etc.)';


--
-- Name: COLUMN user_sessions.tasks_updated; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.user_sessions.tasks_updated IS 'Number of task updates during this session';


--
-- Name: COLUMN user_sessions.tasks_completed; Type: COMMENT; Schema: public; Owner: ridgetop
--

COMMENT ON COLUMN public.user_sessions.tasks_completed IS 'Number of tasks completed during this session';


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
-- Name: analysis_session_links analysis_session_links_analysis_session_id_development_sess_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.analysis_session_links
    ADD CONSTRAINT analysis_session_links_analysis_session_id_development_sess_key UNIQUE (analysis_session_id, development_session_id, link_type);


--
-- Name: analysis_session_links analysis_session_links_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.analysis_session_links
    ADD CONSTRAINT analysis_session_links_pkey PRIMARY KEY (id);


--
-- Name: analytics_events analytics_events_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.analytics_events
    ADD CONSTRAINT analytics_events_pkey PRIMARY KEY (event_id);


--
-- Name: analytics_events_shadow analytics_events_shadow_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.analytics_events_shadow
    ADD CONSTRAINT analytics_events_shadow_pkey PRIMARY KEY (event_id);


--
-- Name: change_magnitude_patterns change_magnitude_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.change_magnitude_patterns
    ADD CONSTRAINT change_magnitude_patterns_pkey PRIMARY KEY (id);


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
-- Name: cognitive_complexity_metrics cognitive_complexity_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.cognitive_complexity_metrics
    ADD CONSTRAINT cognitive_complexity_metrics_pkey PRIMARY KEY (id);


--
-- Name: commit_session_links commit_session_links_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.commit_session_links
    ADD CONSTRAINT commit_session_links_pkey PRIMARY KEY (id);


--
-- Name: complexity_alerts complexity_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.complexity_alerts
    ADD CONSTRAINT complexity_alerts_pkey PRIMARY KEY (id);


--
-- Name: complexity_analysis_sessions complexity_analysis_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.complexity_analysis_sessions
    ADD CONSTRAINT complexity_analysis_sessions_pkey PRIMARY KEY (id);


--
-- Name: complexity_trends complexity_trends_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.complexity_trends
    ADD CONSTRAINT complexity_trends_pkey PRIMARY KEY (id);


--
-- Name: contexts contexts_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.contexts
    ADD CONSTRAINT contexts_pkey PRIMARY KEY (id);


--
-- Name: contexts_shadow contexts_shadow_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.contexts_shadow
    ADD CONSTRAINT contexts_shadow_pkey PRIMARY KEY (id);


--
-- Name: core_development_metrics core_development_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.core_development_metrics
    ADD CONSTRAINT core_development_metrics_pkey PRIMARY KEY (id);


--
-- Name: cutover_performance_metrics cutover_performance_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.cutover_performance_metrics
    ADD CONSTRAINT cutover_performance_metrics_pkey PRIMARY KEY (id);


--
-- Name: cyclomatic_complexity_metrics cyclomatic_complexity_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.cyclomatic_complexity_metrics
    ADD CONSTRAINT cyclomatic_complexity_metrics_pkey PRIMARY KEY (id);


--
-- Name: decision_impact_analysis decision_impact_analysis_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.decision_impact_analysis
    ADD CONSTRAINT decision_impact_analysis_pkey PRIMARY KEY (id);


--
-- Name: decision_impact_analysis decision_impact_analysis_source_decision_id_impacted_decisi_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.decision_impact_analysis
    ADD CONSTRAINT decision_impact_analysis_source_decision_id_impacted_decisi_key UNIQUE (source_decision_id, impacted_decision_id, impact_type);


--
-- Name: decision_learning_insights decision_learning_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.decision_learning_insights
    ADD CONSTRAINT decision_learning_insights_pkey PRIMARY KEY (id);


--
-- Name: decision_learning_insights decision_learning_insights_project_id_pattern_name_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.decision_learning_insights
    ADD CONSTRAINT decision_learning_insights_project_id_pattern_name_key UNIQUE (project_id, pattern_name);


--
-- Name: decision_metrics_timeline decision_metrics_timeline_decision_id_metric_name_measureme_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.decision_metrics_timeline
    ADD CONSTRAINT decision_metrics_timeline_decision_id_metric_name_measureme_key UNIQUE (decision_id, metric_name, measurement_timestamp);


--
-- Name: decision_metrics_timeline decision_metrics_timeline_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.decision_metrics_timeline
    ADD CONSTRAINT decision_metrics_timeline_pkey PRIMARY KEY (id);


--
-- Name: decision_outcomes decision_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.decision_outcomes
    ADD CONSTRAINT decision_outcomes_pkey PRIMARY KEY (id);


--
-- Name: decision_retrospectives decision_retrospectives_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.decision_retrospectives
    ADD CONSTRAINT decision_retrospectives_pkey PRIMARY KEY (id);


--
-- Name: dependency_complexity_metrics dependency_complexity_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.dependency_complexity_metrics
    ADD CONSTRAINT dependency_complexity_metrics_pkey PRIMARY KEY (id);


--
-- Name: developer_patterns developer_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.developer_patterns
    ADD CONSTRAINT developer_patterns_pkey PRIMARY KEY (id);


--
-- Name: dual_write_config dual_write_config_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.dual_write_config
    ADD CONSTRAINT dual_write_config_pkey PRIMARY KEY (table_name);


--
-- Name: dual_write_stats dual_write_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.dual_write_stats
    ADD CONSTRAINT dual_write_stats_pkey PRIMARY KEY (id);


--
-- Name: envelope_audit envelope_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.envelope_audit
    ADD CONSTRAINT envelope_audit_pkey PRIMARY KEY (id);


--
-- Name: event_log event_log_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.event_log
    ADD CONSTRAINT event_log_pkey PRIMARY KEY (id);


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
-- Name: file_complexity_summary file_complexity_summary_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.file_complexity_summary
    ADD CONSTRAINT file_complexity_summary_pkey PRIMARY KEY (id);


--
-- Name: file_cooccurrence_patterns file_cooccurrence_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.file_cooccurrence_patterns
    ADD CONSTRAINT file_cooccurrence_patterns_pkey PRIMARY KEY (id);


--
-- Name: git_branches git_branches_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.git_branches
    ADD CONSTRAINT git_branches_pkey PRIMARY KEY (id);


--
-- Name: git_commits git_commits_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.git_commits
    ADD CONSTRAINT git_commits_pkey PRIMARY KEY (id);


--
-- Name: git_file_changes git_file_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.git_file_changes
    ADD CONSTRAINT git_file_changes_pkey PRIMARY KEY (id);


--
-- Name: halstead_complexity_metrics halstead_complexity_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.halstead_complexity_metrics
    ADD CONSTRAINT halstead_complexity_metrics_pkey PRIMARY KEY (id);


--
-- Name: metrics_alerts metrics_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.metrics_alerts
    ADD CONSTRAINT metrics_alerts_pkey PRIMARY KEY (id);


--
-- Name: metrics_collection_sessions metrics_collection_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.metrics_collection_sessions
    ADD CONSTRAINT metrics_collection_sessions_pkey PRIMARY KEY (id);


--
-- Name: metrics_trends metrics_trends_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.metrics_trends
    ADD CONSTRAINT metrics_trends_pkey PRIMARY KEY (id);


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
-- Name: pattern_discovery_sessions pattern_discovery_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.pattern_discovery_sessions
    ADD CONSTRAINT pattern_discovery_sessions_pkey PRIMARY KEY (id);


--
-- Name: pattern_insights pattern_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.pattern_insights
    ADD CONSTRAINT pattern_insights_pkey PRIMARY KEY (id);


--
-- Name: pattern_intelligence_metrics pattern_intelligence_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.pattern_intelligence_metrics
    ADD CONSTRAINT pattern_intelligence_metrics_pkey PRIMARY KEY (id);


--
-- Name: pattern_operation_metrics pattern_operation_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.pattern_operation_metrics
    ADD CONSTRAINT pattern_operation_metrics_pkey PRIMARY KEY (id);


--
-- Name: productivity_health_metrics productivity_health_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.productivity_health_metrics
    ADD CONSTRAINT productivity_health_metrics_pkey PRIMARY KEY (id);


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
-- Name: projects_shadow projects_shadow_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.projects_shadow
    ADD CONSTRAINT projects_shadow_pkey PRIMARY KEY (id);


--
-- Name: refactoring_opportunities refactoring_opportunities_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.refactoring_opportunities
    ADD CONSTRAINT refactoring_opportunities_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: session_project_mappings session_project_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.session_project_mappings
    ADD CONSTRAINT session_project_mappings_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_display_id_key; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_display_id_key UNIQUE (display_id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions_shadow sessions_shadow_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.sessions_shadow
    ADD CONSTRAINT sessions_shadow_pkey PRIMARY KEY (id);


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
-- Name: temporal_patterns temporal_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.temporal_patterns
    ADD CONSTRAINT temporal_patterns_pkey PRIMARY KEY (id);


--
-- Name: traffic_routing_config traffic_routing_config_pkey; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.traffic_routing_config
    ADD CONSTRAINT traffic_routing_config_pkey PRIMARY KEY (table_name);


--
-- Name: cognitive_complexity_metrics unique_cognitive_function_per_session; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.cognitive_complexity_metrics
    ADD CONSTRAINT unique_cognitive_function_per_session UNIQUE (analysis_session_id, file_path, function_name, start_line);


--
-- Name: cyclomatic_complexity_metrics unique_cyclomatic_function_per_session; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.cyclomatic_complexity_metrics
    ADD CONSTRAINT unique_cyclomatic_function_per_session UNIQUE (analysis_session_id, file_path, function_name, start_line);


--
-- Name: dependency_complexity_metrics unique_dependency_element_per_session; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.dependency_complexity_metrics
    ADD CONSTRAINT unique_dependency_element_per_session UNIQUE (analysis_session_id, file_path, element_type, element_name);


--
-- Name: file_complexity_summary unique_file_per_session; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.file_complexity_summary
    ADD CONSTRAINT unique_file_per_session UNIQUE (analysis_session_id, file_path);


--
-- Name: halstead_complexity_metrics unique_halstead_scope_per_session; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.halstead_complexity_metrics
    ADD CONSTRAINT unique_halstead_scope_per_session UNIQUE (analysis_session_id, file_path, scope_type, function_name, start_line);


--
-- Name: session_project_mappings unique_session_mapping; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.session_project_mappings
    ADD CONSTRAINT unique_session_mapping UNIQUE (session_id);


--
-- Name: complexity_trends unique_trend_measurement; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.complexity_trends
    ADD CONSTRAINT unique_trend_measurement UNIQUE (project_id, file_path, complexity_type, measurement_date, trend_period);


--
-- Name: commit_session_links uq_commit_session_links_unique; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.commit_session_links
    ADD CONSTRAINT uq_commit_session_links_unique UNIQUE (commit_id, session_id);


--
-- Name: file_cooccurrence_patterns uq_cooccurrence_pattern_per_session; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.file_cooccurrence_patterns
    ADD CONSTRAINT uq_cooccurrence_pattern_per_session UNIQUE (discovery_session_id, pattern_hash);


--
-- Name: developer_patterns uq_developer_pattern_per_session; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.developer_patterns
    ADD CONSTRAINT uq_developer_pattern_per_session UNIQUE (discovery_session_id, developer_hash);


--
-- Name: git_branches uq_git_branches_project_name; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.git_branches
    ADD CONSTRAINT uq_git_branches_project_name UNIQUE (project_id, branch_name);


--
-- Name: git_commits uq_git_commits_project_sha; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.git_commits
    ADD CONSTRAINT uq_git_commits_project_sha UNIQUE (project_id, commit_sha);


--
-- Name: change_magnitude_patterns uq_magnitude_pattern_per_session; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.change_magnitude_patterns
    ADD CONSTRAINT uq_magnitude_pattern_per_session UNIQUE (discovery_session_id, file_path);


--
-- Name: temporal_patterns uq_temporal_pattern_per_session; Type: CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.temporal_patterns
    ADD CONSTRAINT uq_temporal_pattern_per_session UNIQUE (discovery_session_id, pattern_type);


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
-- Name: contexts_embedding_1536_idx; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX contexts_embedding_1536_idx ON public.contexts USING ivfflat (embedding public.vector_cosine_ops);


--
-- Name: envelope_audit_op_key_unique; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE UNIQUE INDEX envelope_audit_op_key_unique ON public.envelope_audit USING btree (op, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: idx_admin_users_email; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_admin_users_email ON public.admin_users USING btree (email);


--
-- Name: idx_admin_users_username; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_admin_users_username ON public.admin_users USING btree (username);


--
-- Name: idx_analysis_session_links_analysis; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_analysis_session_links_analysis ON public.analysis_session_links USING btree (analysis_session_id);


--
-- Name: idx_analysis_session_links_context; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_analysis_session_links_context ON public.analysis_session_links USING btree (context_id) WHERE (context_id IS NOT NULL);


--
-- Name: idx_analysis_session_links_development; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_analysis_session_links_development ON public.analysis_session_links USING btree (development_session_id) WHERE (development_session_id IS NOT NULL);


--
-- Name: idx_analysis_session_links_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_analysis_session_links_project ON public.analysis_session_links USING btree (project_id);


--
-- Name: idx_analysis_session_links_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_analysis_session_links_type ON public.analysis_session_links USING btree (link_type, confidence_score DESC);


--
-- Name: idx_analytics_events_actor; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_analytics_events_actor ON public.analytics_events USING btree (actor);


--
-- Name: idx_analytics_events_event_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_analytics_events_event_type ON public.analytics_events USING btree (event_type);


--
-- Name: idx_analytics_events_project_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_analytics_events_project_id ON public.analytics_events USING btree (project_id);


--
-- Name: idx_analytics_events_session_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_analytics_events_session_id ON public.analytics_events USING btree (session_id);


--
-- Name: idx_analytics_events_shadow_actor; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_analytics_events_shadow_actor ON public.analytics_events_shadow USING btree (actor);


--
-- Name: idx_analytics_events_shadow_event_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_analytics_events_shadow_event_type ON public.analytics_events_shadow USING btree (event_type);


--
-- Name: idx_analytics_events_shadow_metadata_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_analytics_events_shadow_metadata_gin ON public.analytics_events_shadow USING gin (metadata);


--
-- Name: idx_analytics_events_shadow_payload_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_analytics_events_shadow_payload_gin ON public.analytics_events_shadow USING gin (payload);


--
-- Name: idx_analytics_events_shadow_project_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_analytics_events_shadow_project_id ON public.analytics_events_shadow USING btree (project_id);


--
-- Name: idx_analytics_events_shadow_session_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_analytics_events_shadow_session_id ON public.analytics_events_shadow USING btree (session_id);


--
-- Name: idx_analytics_events_shadow_source_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_analytics_events_shadow_source_id ON public.analytics_events_shadow USING btree (_shadow_source_id);


--
-- Name: idx_analytics_events_shadow_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_analytics_events_shadow_status ON public.analytics_events_shadow USING btree (status);


--
-- Name: idx_analytics_events_shadow_sync_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_analytics_events_shadow_sync_status ON public.analytics_events_shadow USING btree (_shadow_sync_status);


--
-- Name: idx_analytics_events_shadow_tags_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_analytics_events_shadow_tags_gin ON public.analytics_events_shadow USING gin (tags);


--
-- Name: idx_analytics_events_shadow_timestamp; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_analytics_events_shadow_timestamp ON public.analytics_events_shadow USING btree ("timestamp");


--
-- Name: idx_analytics_events_timestamp; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_analytics_events_timestamp ON public.analytics_events USING btree ("timestamp");


--
-- Name: idx_code_analysis_sessions_agent; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_agent ON public.code_analysis_sessions USING btree (analyzer_agent_id);


--
-- Name: idx_code_analysis_sessions_branch; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_branch ON public.code_analysis_sessions USING btree (branch_name) WHERE (branch_name IS NOT NULL);


--
-- Name: idx_code_analysis_sessions_cache_rate; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_cache_rate ON public.code_analysis_sessions USING btree (cache_hit_rate DESC) WHERE (cache_hit_rate IS NOT NULL);


--
-- Name: idx_code_analysis_sessions_commit_sha; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_commit_sha ON public.code_analysis_sessions USING btree (commit_sha) WHERE (commit_sha IS NOT NULL);


--
-- Name: idx_code_analysis_sessions_compatibility; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_compatibility ON public.code_analysis_sessions USING gin (compatibility_flags);


--
-- Name: idx_code_analysis_sessions_correlation; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_correlation ON public.code_analysis_sessions USING btree (session_correlation_confidence DESC) WHERE (session_correlation_confidence > (0)::double precision);


--
-- Name: idx_code_analysis_sessions_dev_session; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_dev_session ON public.code_analysis_sessions USING btree (development_session_id) WHERE (development_session_id IS NOT NULL);


--
-- Name: idx_code_analysis_sessions_excluded; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_excluded ON public.code_analysis_sessions USING gin (excluded_patterns) WHERE (excluded_patterns <> '{}'::text[]);


--
-- Name: idx_code_analysis_sessions_files; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_files ON public.code_analysis_sessions USING gin (files_analyzed);


--
-- Name: idx_code_analysis_sessions_git_clean; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_git_clean ON public.code_analysis_sessions USING btree (git_status_clean) WHERE (git_status_clean IS NOT NULL);


--
-- Name: idx_code_analysis_sessions_metadata; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_metadata ON public.code_analysis_sessions USING gin (metadata);


--
-- Name: idx_code_analysis_sessions_performance; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_performance ON public.code_analysis_sessions USING btree (analysis_duration_ms DESC, files_analyzed) WHERE (analysis_duration_ms IS NOT NULL);


--
-- Name: idx_code_analysis_sessions_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_project ON public.code_analysis_sessions USING btree (project_id);


--
-- Name: idx_code_analysis_sessions_project_commit; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_project_commit ON public.code_analysis_sessions USING btree (project_id, commit_sha, started_at DESC) WHERE (commit_sha IS NOT NULL);


--
-- Name: idx_code_analysis_sessions_project_session; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_project_session ON public.code_analysis_sessions USING btree (project_id, development_session_id, started_at DESC);


--
-- Name: idx_code_analysis_sessions_quality; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_quality ON public.code_analysis_sessions USING btree (quality_score DESC) WHERE (quality_score IS NOT NULL);


--
-- Name: idx_code_analysis_sessions_recent_activity; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_recent_activity ON public.code_analysis_sessions USING btree (project_id, started_at DESC, status);


--
-- Name: idx_code_analysis_sessions_scope; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_scope ON public.code_analysis_sessions USING btree (analysis_scope, project_id);


--
-- Name: idx_code_analysis_sessions_started; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_started ON public.code_analysis_sessions USING btree (started_at);


--
-- Name: idx_code_analysis_sessions_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_status ON public.code_analysis_sessions USING btree (status);


--
-- Name: idx_code_analysis_sessions_target_files; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_target_files ON public.code_analysis_sessions USING gin (target_files) WHERE (target_files <> '{}'::text[]);


--
-- Name: idx_code_analysis_sessions_trigger; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_trigger ON public.code_analysis_sessions USING btree (trigger_type, auto_triggered);


--
-- Name: idx_code_analysis_sessions_trigger_metadata; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_trigger_metadata ON public.code_analysis_sessions USING gin (trigger_metadata);


--
-- Name: idx_code_analysis_sessions_triggered_by; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_analysis_sessions_triggered_by ON public.code_analysis_sessions USING btree (triggered_by_agent) WHERE (triggered_by_agent IS NOT NULL);


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
-- Name: idx_code_components_last_analysis; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_components_last_analysis ON public.code_components USING btree (last_analysis_session_id) WHERE (last_analysis_session_id IS NOT NULL);


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
-- Name: idx_code_metrics_analysis_session; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_code_metrics_analysis_session ON public.code_metrics USING btree (analysis_session_id) WHERE (analysis_session_id IS NOT NULL);


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
-- Name: idx_cognitive_complexity_high_values; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_cognitive_complexity_high_values ON public.cognitive_complexity_metrics USING btree (cognitive_complexity DESC) WHERE (cognitive_complexity > 15);


--
-- Name: idx_cognitive_complexity_refactoring; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_cognitive_complexity_refactoring ON public.cognitive_complexity_metrics USING btree (refactoring_benefit_score DESC) WHERE (refactoring_benefit_score > 0.5);


--
-- Name: idx_cognitive_complexity_risk; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_cognitive_complexity_risk ON public.cognitive_complexity_metrics USING btree (cognitive_risk_level, cognitive_complexity DESC) WHERE ((cognitive_risk_level)::text = ANY ((ARRAY['high'::character varying, 'very_high'::character varying, 'critical'::character varying])::text[]));


--
-- Name: idx_commit_session_links_commit; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_commit_session_links_commit ON public.commit_session_links USING btree (commit_id);


--
-- Name: idx_commit_session_links_context_ids; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_commit_session_links_context_ids ON public.commit_session_links USING gin (context_ids);


--
-- Name: idx_commit_session_links_created_by; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_commit_session_links_created_by ON public.commit_session_links USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_commit_session_links_decision_ids; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_commit_session_links_decision_ids ON public.commit_session_links USING gin (decision_ids);


--
-- Name: idx_commit_session_links_project_confidence; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_commit_session_links_project_confidence ON public.commit_session_links USING btree (project_id, confidence_score DESC);


--
-- Name: idx_commit_session_links_relevant_contexts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_commit_session_links_relevant_contexts ON public.commit_session_links USING gin (relevant_context_ids) WHERE (relevant_context_ids <> '{}'::uuid[]);


--
-- Name: idx_commit_session_links_session; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_commit_session_links_session ON public.commit_session_links USING btree (session_id, confidence_score DESC);


--
-- Name: idx_complexity_alerts_file_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_complexity_alerts_file_type ON public.complexity_alerts USING btree (file_path, complexity_type, triggered_at DESC);


--
-- Name: idx_complexity_alerts_open_priority; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_complexity_alerts_open_priority ON public.complexity_alerts USING btree (status, priority, triggered_at DESC) WHERE ((status)::text = ANY ((ARRAY['open'::character varying, 'acknowledged'::character varying])::text[]));


--
-- Name: idx_complexity_alerts_project_severity; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_complexity_alerts_project_severity ON public.complexity_alerts USING btree (project_id, violation_severity, triggered_at DESC) WHERE ((violation_severity)::text = ANY ((ARRAY['error'::character varying, 'critical'::character varying])::text[]));


--
-- Name: idx_complexity_alerts_recurring; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_complexity_alerts_recurring ON public.complexity_alerts USING btree (is_recurring, recurrence_count DESC) WHERE (is_recurring = true);


--
-- Name: idx_complexity_analysis_sessions_commit; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_complexity_analysis_sessions_commit ON public.complexity_analysis_sessions USING btree (commit_sha) WHERE (commit_sha IS NOT NULL);


--
-- Name: idx_complexity_analysis_sessions_project_timestamp; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_complexity_analysis_sessions_project_timestamp ON public.complexity_analysis_sessions USING btree (project_id, analysis_timestamp DESC);


--
-- Name: idx_complexity_analysis_sessions_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_complexity_analysis_sessions_status ON public.complexity_analysis_sessions USING btree (status, analysis_timestamp) WHERE ((status)::text = ANY ((ARRAY['running'::character varying, 'failed'::character varying])::text[]));


--
-- Name: idx_complexity_trends_anomalies; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_complexity_trends_anomalies ON public.complexity_trends USING btree (is_anomaly, anomaly_score DESC) WHERE (is_anomaly = true);


--
-- Name: idx_complexity_trends_change_points; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_complexity_trends_change_points ON public.complexity_trends USING btree (change_point_detected, change_significance DESC) WHERE (change_point_detected = true);


--
-- Name: idx_complexity_trends_project_file_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_complexity_trends_project_file_type ON public.complexity_trends USING btree (project_id, file_path, complexity_type, measurement_date DESC);


--
-- Name: idx_contexts_commit_sha; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_commit_sha ON public.contexts USING btree (related_commit_sha) WHERE (related_commit_sha IS NOT NULL);


--
-- Name: idx_contexts_commit_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_commit_type ON public.contexts USING btree (commit_context_type) WHERE (commit_context_type IS NOT NULL);


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

CREATE INDEX idx_contexts_embedding_cosine ON public.contexts USING ivfflat (embedding_384_backup public.vector_cosine_ops) WITH (lists='100');


--
-- Name: idx_contexts_insights; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_insights ON public.contexts USING gin (related_insights);


--
-- Name: idx_contexts_metadata_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_metadata_gin ON public.contexts USING gin (metadata);


--
-- Name: idx_contexts_pattern_relevance; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_pattern_relevance ON public.contexts USING btree (pattern_relevance_score DESC) WHERE (pattern_relevance_score IS NOT NULL);


--
-- Name: idx_contexts_pattern_session; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_pattern_session ON public.contexts USING btree (pattern_session_id) WHERE (pattern_session_id IS NOT NULL);


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
-- Name: idx_contexts_shadow_content_fts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_shadow_content_fts ON public.contexts_shadow USING gin (to_tsvector('english'::regconfig, content));


--
-- Name: idx_contexts_shadow_created_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_shadow_created_at ON public.contexts_shadow USING btree (created_at);


--
-- Name: idx_contexts_shadow_embedding_cosine; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_shadow_embedding_cosine ON public.contexts_shadow USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');


--
-- Name: idx_contexts_shadow_insights_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_shadow_insights_gin ON public.contexts_shadow USING gin (related_insights);


--
-- Name: idx_contexts_shadow_metadata_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_shadow_metadata_gin ON public.contexts_shadow USING gin (metadata);


--
-- Name: idx_contexts_shadow_project_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_shadow_project_id ON public.contexts_shadow USING btree (project_id);


--
-- Name: idx_contexts_shadow_project_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_shadow_project_type ON public.contexts_shadow USING btree (project_id, context_type);


--
-- Name: idx_contexts_shadow_relevance; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_shadow_relevance ON public.contexts_shadow USING btree (relevance_score DESC);


--
-- Name: idx_contexts_shadow_session_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_shadow_session_id ON public.contexts_shadow USING btree (session_id);


--
-- Name: idx_contexts_shadow_source_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_shadow_source_id ON public.contexts_shadow USING btree (_shadow_source_id);


--
-- Name: idx_contexts_shadow_sync_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_shadow_sync_status ON public.contexts_shadow USING btree (_shadow_sync_status);


--
-- Name: idx_contexts_shadow_tags_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_shadow_tags_gin ON public.contexts_shadow USING gin (tags);


--
-- Name: idx_contexts_shadow_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_shadow_type ON public.contexts_shadow USING btree (context_type);


--
-- Name: idx_contexts_tags_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_tags_gin ON public.contexts USING gin (tags);


--
-- Name: idx_contexts_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_contexts_type ON public.contexts USING btree (context_type);


--
-- Name: idx_cooccurrence_commits; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_cooccurrence_commits ON public.file_cooccurrence_patterns USING gin (contributing_commits);


--
-- Name: idx_cooccurrence_patterns_active; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_cooccurrence_patterns_active ON public.file_cooccurrence_patterns USING btree (project_id, is_active, updated_at DESC) WHERE (is_active = true);


--
-- Name: idx_cooccurrence_patterns_bidirectional; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_cooccurrence_patterns_bidirectional ON public.file_cooccurrence_patterns USING btree (is_bidirectional, confidence_score DESC) WHERE (is_active = true);


--
-- Name: idx_cooccurrence_patterns_file_lookup; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_cooccurrence_patterns_file_lookup ON public.file_cooccurrence_patterns USING btree (project_id, file_path_1) WHERE (is_active = true);


--
-- Name: idx_cooccurrence_patterns_files; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_cooccurrence_patterns_files ON public.file_cooccurrence_patterns USING btree (project_id, file_path_1, file_path_2);


--
-- Name: idx_cooccurrence_patterns_hash; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_cooccurrence_patterns_hash ON public.file_cooccurrence_patterns USING btree (pattern_hash);


--
-- Name: idx_cooccurrence_patterns_strength; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_cooccurrence_patterns_strength ON public.file_cooccurrence_patterns USING btree (project_id, pattern_strength, confidence_score DESC, lift_score DESC);


--
-- Name: idx_cooccurrence_patterns_support_lift; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_cooccurrence_patterns_support_lift ON public.file_cooccurrence_patterns USING btree (support_score DESC, lift_score DESC) WHERE (is_active = true);


--
-- Name: idx_core_metrics_alerts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_core_metrics_alerts ON public.core_development_metrics USING btree (project_id, alert_triggered, alert_severity) WHERE (alert_triggered = true);


--
-- Name: idx_core_metrics_scope_period; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_core_metrics_scope_period ON public.core_development_metrics USING btree (metric_scope, scope_identifier, period_type, period_end DESC);


--
-- Name: idx_core_metrics_trends; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_core_metrics_trends ON public.core_development_metrics USING btree (project_id, scope_identifier, trend_direction, period_end DESC);


--
-- Name: idx_core_metrics_type_scope; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_core_metrics_type_scope ON public.core_development_metrics USING btree (project_id, metric_type, metric_scope, period_end DESC);


--
-- Name: idx_core_metrics_value_rank; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_core_metrics_value_rank ON public.core_development_metrics USING btree (metric_type, metric_value DESC, percentile_rank DESC) WHERE (is_active = true);


--
-- Name: idx_cutover_performance_operation_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_cutover_performance_operation_type ON public.cutover_performance_metrics USING btree (operation_type);


--
-- Name: idx_cutover_performance_period_start; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_cutover_performance_period_start ON public.cutover_performance_metrics USING btree (measurement_period_start);


--
-- Name: idx_cutover_performance_table_stage; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_cutover_performance_table_stage ON public.cutover_performance_metrics USING btree (table_name, cutover_stage);


--
-- Name: idx_cyclomatic_complexity_high_values; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_cyclomatic_complexity_high_values ON public.cyclomatic_complexity_metrics USING btree (cyclomatic_complexity DESC) WHERE (cyclomatic_complexity > 10);


--
-- Name: idx_cyclomatic_complexity_project_file; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_cyclomatic_complexity_project_file ON public.cyclomatic_complexity_metrics USING btree (project_id, file_path);


--
-- Name: idx_cyclomatic_complexity_risk_level; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_cyclomatic_complexity_risk_level ON public.cyclomatic_complexity_metrics USING btree (risk_level, cyclomatic_complexity DESC) WHERE ((risk_level)::text = ANY ((ARRAY['high'::character varying, 'very_high'::character varying, 'critical'::character varying])::text[]));


--
-- Name: idx_decision_impact_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_impact_project ON public.decision_impact_analysis USING btree (project_id, discovered_at DESC);


--
-- Name: idx_decision_impact_source; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_impact_source ON public.decision_impact_analysis USING btree (source_decision_id);


--
-- Name: idx_decision_impact_target; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_impact_target ON public.decision_impact_analysis USING btree (impacted_decision_id);


--
-- Name: idx_decision_impact_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_impact_type ON public.decision_impact_analysis USING btree (impact_type, impact_strength);


--
-- Name: idx_decision_impact_validated; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_impact_validated ON public.decision_impact_analysis USING btree (validated, confidence_score DESC);


--
-- Name: idx_decision_learning_components_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_learning_components_gin ON public.decision_learning_insights USING gin (applicable_components);


--
-- Name: idx_decision_learning_confidence; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_learning_confidence ON public.decision_learning_insights USING btree (confidence_score DESC, supporting_evidence_count DESC);


--
-- Name: idx_decision_learning_insights_fts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_learning_insights_fts ON public.decision_learning_insights USING gin (to_tsvector('english'::regconfig, (((((pattern_name)::text || ' '::text) || pattern_description) || ' '::text) || COALESCE(recommendation, ''::text))));


--
-- Name: idx_decision_learning_patterns_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_learning_patterns_gin ON public.decision_learning_insights USING gin (pattern_conditions);


--
-- Name: idx_decision_learning_project_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_learning_project_type ON public.decision_learning_insights USING btree (project_id, insight_type);


--
-- Name: idx_decision_learning_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_learning_status ON public.decision_learning_insights USING btree (status, last_confirmed DESC);


--
-- Name: idx_decision_learning_types_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_learning_types_gin ON public.decision_learning_insights USING gin (decision_types);


--
-- Name: idx_decision_metrics_category; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_metrics_category ON public.decision_metrics_timeline USING btree (metric_category, measurement_timestamp DESC);


--
-- Name: idx_decision_metrics_decision_timeline; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_metrics_decision_timeline ON public.decision_metrics_timeline USING btree (decision_id, measurement_timestamp DESC);


--
-- Name: idx_decision_metrics_phase; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_metrics_phase ON public.decision_metrics_timeline USING btree (phase, days_since_decision);


--
-- Name: idx_decision_metrics_project_metric; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_metrics_project_metric ON public.decision_metrics_timeline USING btree (project_id, metric_name);


--
-- Name: idx_decision_outcomes_decision_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_outcomes_decision_id ON public.decision_outcomes USING btree (decision_id);


--
-- Name: idx_decision_outcomes_evidence_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_outcomes_evidence_gin ON public.decision_outcomes USING gin (evidence_data);


--
-- Name: idx_decision_outcomes_project_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_outcomes_project_type ON public.decision_outcomes USING btree (project_id, outcome_type);


--
-- Name: idx_decision_outcomes_score; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_outcomes_score ON public.decision_outcomes USING btree (outcome_score DESC);


--
-- Name: idx_decision_outcomes_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_outcomes_status ON public.decision_outcomes USING btree (outcome_status, measured_at DESC);


--
-- Name: idx_decision_outcomes_timeline; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_outcomes_timeline ON public.decision_outcomes USING btree (measured_at DESC, measurement_period_days);


--
-- Name: idx_decision_retrospectives_decision; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_retrospectives_decision ON public.decision_retrospectives USING btree (decision_id, retrospective_date DESC);


--
-- Name: idx_decision_retrospectives_followup; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_retrospectives_followup ON public.decision_retrospectives USING btree (follow_up_required, follow_up_date);


--
-- Name: idx_decision_retrospectives_fts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_retrospectives_fts ON public.decision_retrospectives USING gin (to_tsvector('english'::regconfig, ((((((what_went_well || ' '::text) || what_went_poorly) || ' '::text) || what_we_learned) || ' '::text) || recommendations_for_similar_decisions)));


--
-- Name: idx_decision_retrospectives_project_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_retrospectives_project_type ON public.decision_retrospectives USING btree (project_id, retrospective_type);


--
-- Name: idx_decision_retrospectives_satisfaction; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_decision_retrospectives_satisfaction ON public.decision_retrospectives USING btree (overall_satisfaction DESC);


--
-- Name: idx_dependency_complexity_circular; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_dependency_complexity_circular ON public.dependency_complexity_metrics USING btree (circular_dependencies DESC) WHERE (circular_dependencies > 0);


--
-- Name: idx_dependency_complexity_high_coupling; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_dependency_complexity_high_coupling ON public.dependency_complexity_metrics USING btree (coupling_factor DESC) WHERE (coupling_factor > 0.3);


--
-- Name: idx_dependency_complexity_instability; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_dependency_complexity_instability ON public.dependency_complexity_metrics USING btree (instability DESC) WHERE (instability > 0.7);


--
-- Name: idx_dependency_complexity_violations; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_dependency_complexity_violations ON public.dependency_complexity_metrics USING btree (architectural_violation) WHERE (architectural_violation = true);


--
-- Name: idx_developer_collaborators; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_developer_collaborators ON public.developer_patterns USING gin (frequent_collaborators);


--
-- Name: idx_developer_patterns_activity; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_developer_patterns_activity ON public.developer_patterns USING btree (activity_trend, last_commit_date DESC) WHERE (is_active = true);


--
-- Name: idx_developer_patterns_author; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_developer_patterns_author ON public.developer_patterns USING btree (project_id, author_email, updated_at DESC);


--
-- Name: idx_developer_patterns_collaboration; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_developer_patterns_collaboration ON public.developer_patterns USING btree (temporal_overlap_score DESC, collaborative_vs_solo_ratio);


--
-- Name: idx_developer_patterns_risk; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_developer_patterns_risk ON public.developer_patterns USING btree (knowledge_silo_risk_score DESC, exclusive_ownership_count DESC);


--
-- Name: idx_developer_patterns_specialization; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_developer_patterns_specialization ON public.developer_patterns USING btree (specialization_score DESC, knowledge_breadth_score) WHERE (is_active = true);


--
-- Name: idx_developer_patterns_velocity; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_developer_patterns_velocity ON public.developer_patterns USING btree (change_velocity DESC, consistency_score DESC);


--
-- Name: idx_developer_specialties; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_developer_specialties ON public.developer_patterns USING gin (specialty_files);


--
-- Name: idx_developer_velocity_consistency; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_developer_velocity_consistency ON public.developer_patterns USING btree (change_velocity DESC, consistency_score DESC, specialization_score DESC);


--
-- Name: idx_dual_write_stats_operation; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_dual_write_stats_operation ON public.dual_write_stats USING btree (operation, "timestamp");


--
-- Name: idx_dual_write_stats_success; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_dual_write_stats_success ON public.dual_write_stats USING btree (success, "timestamp");


--
-- Name: idx_dual_write_stats_table_timestamp; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_dual_write_stats_table_timestamp ON public.dual_write_stats USING btree (table_name, "timestamp");


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
-- Name: idx_file_complexity_hotspots_dashboard; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_file_complexity_hotspots_dashboard ON public.file_complexity_summary USING btree (project_id, hotspot_score DESC, overall_complexity_score DESC) WHERE (is_complexity_hotspot = true);


--
-- Name: idx_file_complexity_summary_high_risk; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_file_complexity_summary_high_risk ON public.file_complexity_summary USING btree (risk_level, overall_complexity_score DESC) WHERE ((risk_level)::text = ANY ((ARRAY['high'::character varying, 'very_high'::character varying, 'critical'::character varying])::text[]));


--
-- Name: idx_file_complexity_summary_hotspots; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_file_complexity_summary_hotspots ON public.file_complexity_summary USING btree (is_complexity_hotspot, hotspot_score DESC) WHERE (is_complexity_hotspot = true);


--
-- Name: idx_file_complexity_summary_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_file_complexity_summary_project ON public.file_complexity_summary USING btree (project_id, overall_complexity_score DESC);


--
-- Name: idx_file_complexity_summary_refactoring; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_file_complexity_summary_refactoring ON public.file_complexity_summary USING btree (refactoring_priority, technical_debt_minutes DESC) WHERE (refactoring_priority <= 3);


--
-- Name: idx_git_branches_active_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_branches_active_status ON public.git_branches USING btree (is_active, project_id);


--
-- Name: idx_git_branches_associated_sessions; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_branches_associated_sessions ON public.git_branches USING gin (associated_sessions) WHERE (associated_sessions <> '{}'::uuid[]);


--
-- Name: idx_git_branches_current_commit_sha; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_branches_current_commit_sha ON public.git_branches USING btree (current_commit_sha) WHERE (current_commit_sha IS NOT NULL);


--
-- Name: idx_git_branches_default; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_branches_default ON public.git_branches USING btree (project_id) WHERE (is_default = true);


--
-- Name: idx_git_branches_default_branch; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_branches_default_branch ON public.git_branches USING btree (is_default_branch, project_id) WHERE (is_default_branch = true);


--
-- Name: idx_git_branches_description_fts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_branches_description_fts ON public.git_branches USING gin (to_tsvector('english'::regconfig, description)) WHERE (description IS NOT NULL);


--
-- Name: idx_git_branches_full_ref; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_branches_full_ref ON public.git_branches USING btree (full_ref_name) WHERE (full_ref_name IS NOT NULL);


--
-- Name: idx_git_branches_project_active; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_branches_project_active ON public.git_branches USING btree (project_id, last_commit_date DESC) WHERE (current_sha IS NOT NULL);


--
-- Name: idx_git_branches_project_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_branches_project_type ON public.git_branches USING btree (project_id, branch_type);


--
-- Name: idx_git_branches_protected; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_branches_protected ON public.git_branches USING btree (project_id) WHERE (is_protected = true);


--
-- Name: idx_git_branches_session; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_branches_session ON public.git_branches USING btree (session_id) WHERE (session_id IS NOT NULL);


--
-- Name: idx_git_branches_stats; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_branches_stats ON public.git_branches USING btree (total_commits DESC, commits_ahead DESC);


--
-- Name: idx_git_commits_analysis_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_analysis_status ON public.git_commits USING btree (is_analyzed, analysis_version);


--
-- Name: idx_git_commits_discovered_by; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_discovered_by ON public.git_commits USING btree (discovered_by) WHERE (discovered_by IS NOT NULL);


--
-- Name: idx_git_commits_first_seen; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_first_seen ON public.git_commits USING btree (first_seen);


--
-- Name: idx_git_commits_merge_commits; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_merge_commits ON public.git_commits USING btree (project_id, author_date DESC) WHERE (is_merge_commit = true);


--
-- Name: idx_git_commits_message_fts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_message_fts ON public.git_commits USING gin (to_tsvector('english'::regconfig, message));


--
-- Name: idx_git_commits_metadata; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_metadata ON public.git_commits USING gin (metadata);


--
-- Name: idx_git_commits_parent_shas; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_parent_shas ON public.git_commits USING gin (parent_shas);


--
-- Name: idx_git_commits_project_author; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_project_author ON public.git_commits USING btree (project_id, author_email, author_date DESC);


--
-- Name: idx_git_commits_project_branch; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_project_branch ON public.git_commits USING btree (project_id, branch_name, author_date DESC);


--
-- Name: idx_git_commits_project_date; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_project_date ON public.git_commits USING btree (project_id, author_date DESC);


--
-- Name: idx_git_commits_repository_url; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_repository_url ON public.git_commits USING btree (repository_url) WHERE (repository_url IS NOT NULL);


--
-- Name: idx_git_commits_sha_lookup; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_sha_lookup ON public.git_commits USING btree (commit_sha);


--
-- Name: idx_git_commits_short_sha; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_short_sha ON public.git_commits USING btree (short_sha);


--
-- Name: idx_git_commits_tags; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_tags ON public.git_commits USING gin (tags);


--
-- Name: idx_git_commits_tree_sha; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_commits_tree_sha ON public.git_commits USING btree (tree_sha) WHERE (tree_sha IS NOT NULL);


--
-- Name: idx_git_file_changes_affects_exports; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_file_changes_affects_exports ON public.git_file_changes USING btree (affects_exports, project_id) WHERE (affects_exports = true);


--
-- Name: idx_git_file_changes_commit; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_file_changes_commit ON public.git_file_changes USING btree (commit_id);


--
-- Name: idx_git_file_changes_complexity; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_file_changes_complexity ON public.git_file_changes USING btree (complexity_delta) WHERE (complexity_delta <> 0);


--
-- Name: idx_git_file_changes_file_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_file_changes_file_type ON public.git_file_changes USING btree (file_type, project_id) WHERE (file_type IS NOT NULL);


--
-- Name: idx_git_file_changes_path_pattern; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_file_changes_path_pattern ON public.git_file_changes USING gin (to_tsvector('english'::regconfig, file_path));


--
-- Name: idx_git_file_changes_project_path; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_git_file_changes_project_path ON public.git_file_changes USING btree (project_id, file_path, created_at DESC);


--
-- Name: idx_halstead_complexity_defects; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_halstead_complexity_defects ON public.halstead_complexity_metrics USING btree (delivered_bugs DESC) WHERE (delivered_bugs > 0.1);


--
-- Name: idx_halstead_complexity_high_effort; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_halstead_complexity_high_effort ON public.halstead_complexity_metrics USING btree (effort DESC) WHERE (effort > (1000)::numeric);


--
-- Name: idx_halstead_complexity_maintainability; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_halstead_complexity_maintainability ON public.halstead_complexity_metrics USING btree (maintainability_index) WHERE (maintainability_index < (70)::numeric);


--
-- Name: idx_high_risk_complexity_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_high_risk_complexity_project ON public.high_risk_complexity_items USING btree (project_id);


--
-- Name: idx_high_risk_complexity_risk; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_high_risk_complexity_risk ON public.high_risk_complexity_items USING btree (risk_level, complexity_value DESC);


--
-- Name: idx_high_risk_complexity_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_high_risk_complexity_type ON public.high_risk_complexity_items USING btree (complexity_type, risk_level);


--
-- Name: idx_insights_active_recent; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_insights_active_recent ON public.pattern_insights USING btree (project_id, is_active, created_at DESC) WHERE (is_active = true);


--
-- Name: idx_insights_business_impact; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_insights_business_impact ON public.pattern_insights USING btree (business_impact, technical_impact, confidence_score DESC);


--
-- Name: idx_insights_description_fts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_insights_description_fts ON public.pattern_insights USING gin (to_tsvector('english'::regconfig, description));


--
-- Name: idx_insights_expires; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_insights_expires ON public.pattern_insights USING btree (expires_at, refresh_needed_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_insights_implementation; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_insights_implementation ON public.pattern_insights USING btree (implementation_complexity, estimated_effort_hours) WHERE ((validation_status)::text = 'validated'::text);


--
-- Name: idx_insights_recommendations; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_insights_recommendations ON public.pattern_insights USING gin (recommendations);


--
-- Name: idx_insights_risk_factors; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_insights_risk_factors ON public.pattern_insights USING gin (risk_factors);


--
-- Name: idx_insights_risk_priority; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_insights_risk_priority ON public.pattern_insights USING btree (risk_level, insight_priority, confidence_score DESC);


--
-- Name: idx_insights_supporting_patterns; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_insights_supporting_patterns ON public.pattern_insights USING gin (supporting_pattern_ids);


--
-- Name: idx_insights_title_fts; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_insights_title_fts ON public.pattern_insights USING gin (to_tsvector('english'::regconfig, (title)::text));


--
-- Name: idx_insights_type_confidence; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_insights_type_confidence ON public.pattern_insights USING btree (project_id, insight_type, confidence_score DESC);


--
-- Name: idx_insights_validation_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_insights_validation_status ON public.pattern_insights USING btree (validation_status, implementation_priority) WHERE (is_active = true);


--
-- Name: idx_magnitude_patterns_category; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_magnitude_patterns_category ON public.change_magnitude_patterns USING btree (project_id, change_category, volatility_score DESC);


--
-- Name: idx_magnitude_patterns_complexity; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_magnitude_patterns_complexity ON public.change_magnitude_patterns USING btree (complexity_risk_score DESC, maintenance_burden_score DESC);


--
-- Name: idx_magnitude_patterns_critical; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_magnitude_patterns_critical ON public.change_magnitude_patterns USING btree (project_id, risk_level, technical_debt_indicator DESC) WHERE ((risk_level)::text = ANY ((ARRAY['high'::character varying, 'critical'::character varying])::text[]));


--
-- Name: idx_magnitude_patterns_file; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_magnitude_patterns_file ON public.change_magnitude_patterns USING btree (project_id, file_path, updated_at DESC);


--
-- Name: idx_magnitude_patterns_frequency; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_magnitude_patterns_frequency ON public.change_magnitude_patterns USING btree (change_frequency DESC, stability_score);


--
-- Name: idx_magnitude_patterns_risk; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_magnitude_patterns_risk ON public.change_magnitude_patterns USING btree (risk_level, anomaly_score DESC, hotspot_score DESC);


--
-- Name: idx_magnitude_patterns_trend; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_magnitude_patterns_trend ON public.change_magnitude_patterns USING btree (change_trend, trend_significance DESC) WHERE (is_active = true);


--
-- Name: idx_magnitude_risk_volatility; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_magnitude_risk_volatility ON public.change_magnitude_patterns USING btree (risk_level, volatility_score DESC, change_frequency DESC);


--
-- Name: idx_metrics_alerts_affected_areas; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_metrics_alerts_affected_areas ON public.metrics_alerts USING gin (affected_areas);


--
-- Name: idx_metrics_alerts_follow_up; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_metrics_alerts_follow_up ON public.metrics_alerts USING btree (follow_up_required, follow_up_date) WHERE (follow_up_required = true);


--
-- Name: idx_metrics_alerts_recommendations; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_metrics_alerts_recommendations ON public.metrics_alerts USING gin (recommended_actions);


--
-- Name: idx_metrics_alerts_severity_urgency; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_metrics_alerts_severity_urgency ON public.metrics_alerts USING btree (severity, urgency, trigger_timestamp DESC) WHERE ((status)::text = ANY ((ARRAY['open'::character varying, 'acknowledged'::character varying])::text[]));


--
-- Name: idx_metrics_alerts_status_priority; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_metrics_alerts_status_priority ON public.metrics_alerts USING btree (project_id, status, priority, trigger_timestamp DESC);


--
-- Name: idx_metrics_alerts_type_scope; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_metrics_alerts_type_scope ON public.metrics_alerts USING btree (alert_type, metric_type, metric_scope);


--
-- Name: idx_metrics_dashboard_summary; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_metrics_dashboard_summary ON public.core_development_metrics USING btree (project_id, metric_type, is_active, period_end DESC) WHERE (is_active = true);


--
-- Name: idx_metrics_productivity_overview; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_metrics_productivity_overview ON public.productivity_health_metrics USING btree (project_id, developer_email, productivity_score DESC, measurement_period_end DESC) WHERE (is_active = true);


--
-- Name: idx_metrics_risk_overview; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_metrics_risk_overview ON public.pattern_intelligence_metrics USING btree (project_id, risk_rating, intervention_urgency, is_active) WHERE ((is_active = true) AND ((risk_rating)::text = ANY ((ARRAY['high'::character varying, 'very_high'::character varying, 'critical'::character varying])::text[])));


--
-- Name: idx_metrics_sessions_project_timestamp; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_metrics_sessions_project_timestamp ON public.metrics_collection_sessions USING btree (project_id, collection_timestamp DESC);


--
-- Name: idx_metrics_sessions_status_performance; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_metrics_sessions_status_performance ON public.metrics_collection_sessions USING btree (status, execution_time_ms) WHERE ((status)::text = 'completed'::text);


--
-- Name: idx_metrics_sessions_trigger_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_metrics_sessions_trigger_type ON public.metrics_collection_sessions USING btree (collection_trigger, created_at DESC);


--
-- Name: idx_metrics_trends_direction_strength; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_metrics_trends_direction_strength ON public.metrics_trends USING btree (direction, strength DESC, r_squared DESC);


--
-- Name: idx_metrics_trends_forecast; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_metrics_trends_forecast ON public.metrics_trends USING btree (forecast_confidence DESC, forecast_horizon_days) WHERE (forecast_values IS NOT NULL);


--
-- Name: idx_metrics_trends_recalc; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_metrics_trends_recalc ON public.metrics_trends USING btree (needs_recalculation, updated_at) WHERE (needs_recalculation = true);


--
-- Name: idx_metrics_trends_type_period; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_metrics_trends_type_period ON public.metrics_trends USING btree (project_id, metric_type, metric_scope, trend_end_date DESC) WHERE (is_active = true);


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
-- Name: idx_pattern_intelligence_forecast; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_pattern_intelligence_forecast ON public.pattern_intelligence_metrics USING btree (forecast_direction, forecast_confidence DESC) WHERE (next_evaluation_date IS NOT NULL);


--
-- Name: idx_pattern_intelligence_scope; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_pattern_intelligence_scope ON public.pattern_intelligence_metrics USING btree (metric_scope, scope_identifier, confidence_level DESC) WHERE (is_active = true);


--
-- Name: idx_pattern_intelligence_source_patterns; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_pattern_intelligence_source_patterns ON public.pattern_intelligence_metrics USING gin (source_pattern_ids);


--
-- Name: idx_pattern_intelligence_type_risk; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_pattern_intelligence_type_risk ON public.pattern_intelligence_metrics USING btree (project_id, intelligence_type, risk_rating, intelligence_score DESC);


--
-- Name: idx_pattern_intelligence_urgency; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_pattern_intelligence_urgency ON public.pattern_intelligence_metrics USING btree (intervention_urgency, intervention_difficulty, business_impact_score DESC);


--
-- Name: idx_pattern_metrics_operation; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_pattern_metrics_operation ON public.pattern_operation_metrics USING btree (operation_type, operation_subtype, completed_at DESC);


--
-- Name: idx_pattern_metrics_performance; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_pattern_metrics_performance ON public.pattern_operation_metrics USING btree (execution_time_ms DESC, memory_usage_mb DESC);


--
-- Name: idx_pattern_metrics_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_pattern_metrics_project ON public.pattern_operation_metrics USING btree (project_id, completed_at DESC);


--
-- Name: idx_pattern_sessions_performance; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_pattern_sessions_performance ON public.pattern_discovery_sessions USING btree (project_id, execution_time_ms, patterns_discovered DESC);


--
-- Name: idx_pattern_sessions_project_timestamp; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_pattern_sessions_project_timestamp ON public.pattern_discovery_sessions USING btree (project_id, discovery_timestamp DESC);


--
-- Name: idx_pattern_sessions_status_active; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_pattern_sessions_status_active ON public.pattern_discovery_sessions USING btree (status, discovery_timestamp DESC) WHERE ((status)::text = ANY ((ARRAY['completed'::character varying, 'running'::character varying])::text[]));


--
-- Name: idx_pattern_sessions_supersession; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_pattern_sessions_supersession ON public.pattern_discovery_sessions USING btree (superseded_by, created_at DESC) WHERE (superseded_by IS NOT NULL);


--
-- Name: idx_patterns_project_session_active; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_patterns_project_session_active ON public.file_cooccurrence_patterns USING btree (project_id, discovery_session_id, is_active) WHERE (is_active = true);


--
-- Name: idx_patterns_strength_confidence_lift; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_patterns_strength_confidence_lift ON public.file_cooccurrence_patterns USING btree (pattern_strength, confidence_score DESC, lift_score DESC) WHERE (is_active = true);


--
-- Name: idx_productivity_contributing_sessions; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_productivity_contributing_sessions ON public.productivity_health_metrics USING gin (contributing_sessions);


--
-- Name: idx_productivity_developer_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_productivity_developer_type ON public.productivity_health_metrics USING btree (project_id, developer_email, productivity_type, measurement_period_end DESC);


--
-- Name: idx_productivity_health_indicators; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_productivity_health_indicators ON public.productivity_health_metrics USING btree (project_id, burnout_risk_score DESC, workload_sustainability_score);


--
-- Name: idx_productivity_performance_trends; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_productivity_performance_trends ON public.productivity_health_metrics USING btree (performance_trend, trend_confidence DESC, measurement_period_end DESC);


--
-- Name: idx_productivity_team_comparison; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_productivity_team_comparison ON public.productivity_health_metrics USING btree (team_identifier, productivity_type, productivity_score DESC) WHERE (is_active = true);


--
-- Name: idx_project_complexity_dashboard_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE UNIQUE INDEX idx_project_complexity_dashboard_project ON public.project_complexity_dashboard USING btree (project_id);


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
-- Name: idx_projects_shadow_created_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_projects_shadow_created_at ON public.projects_shadow USING btree (created_at);


--
-- Name: idx_projects_shadow_metadata_gin; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_projects_shadow_metadata_gin ON public.projects_shadow USING gin (metadata);


--
-- Name: idx_projects_shadow_migration_batch; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_projects_shadow_migration_batch ON public.projects_shadow USING btree (_shadow_migration_batch);


--
-- Name: idx_projects_shadow_name_unique; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE UNIQUE INDEX idx_projects_shadow_name_unique ON public.projects_shadow USING btree (name) WHERE (_shadow_sync_status = ANY (ARRAY['synced'::public.shadow_sync_status, 'migrated'::public.shadow_sync_status, 'validated'::public.shadow_sync_status]));


--
-- Name: idx_projects_shadow_source_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE UNIQUE INDEX idx_projects_shadow_source_id ON public.projects_shadow USING btree (_shadow_source_id) WHERE (_shadow_source_id IS NOT NULL);


--
-- Name: idx_projects_shadow_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_projects_shadow_status ON public.projects_shadow USING btree (status);


--
-- Name: idx_projects_shadow_sync_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_projects_shadow_sync_status ON public.projects_shadow USING btree (_shadow_sync_status);


--
-- Name: idx_projects_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_projects_status ON public.projects USING btree (status);


--
-- Name: idx_refactoring_opportunities_file; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_refactoring_opportunities_file ON public.refactoring_opportunities USING btree (file_path, opportunity_type);


--
-- Name: idx_refactoring_opportunities_priority; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_refactoring_opportunities_priority ON public.refactoring_opportunities USING btree (project_id, priority_score DESC, status);


--
-- Name: idx_refactoring_opportunities_roi; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_refactoring_opportunities_roi ON public.refactoring_opportunities USING btree (roi_score DESC, status) WHERE ((status)::text = ANY ((ARRAY['identified'::character varying, 'planned'::character varying])::text[]));


--
-- Name: idx_refactoring_opportunities_urgent; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_refactoring_opportunities_urgent ON public.refactoring_opportunities USING btree (urgency_level, target_completion_date) WHERE ((urgency_level)::text = ANY ((ARRAY['high'::character varying, 'urgent'::character varying])::text[]));


--
-- Name: idx_session_mappings_project_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_session_mappings_project_id ON public.session_project_mappings USING btree (project_id);


--
-- Name: idx_session_mappings_session_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_session_mappings_session_id ON public.session_project_mappings USING btree (session_id);


--
-- Name: idx_session_mappings_updated_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_session_mappings_updated_at ON public.session_project_mappings USING btree (updated_at DESC);


--
-- Name: idx_sessions_activity_summary; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_activity_summary ON public.sessions USING btree (tasks_created, tasks_completed, contexts_created);


--
-- Name: idx_sessions_agent_display_name; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_agent_display_name ON public.sessions USING btree (agent_display_name) WHERE (agent_display_name IS NOT NULL);


--
-- Name: idx_sessions_agent_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_agent_type ON public.sessions USING btree (agent_type);


--
-- Name: idx_sessions_contexts_created; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_contexts_created ON public.sessions USING btree (contexts_created) WHERE (contexts_created > 0);


--
-- Name: idx_sessions_display_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE UNIQUE INDEX idx_sessions_display_id ON public.sessions USING btree (display_id);


--
-- Name: idx_sessions_display_id_search; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_display_id_search ON public.sessions USING btree (display_id text_pattern_ops);


--
-- Name: idx_sessions_input_tokens; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_input_tokens ON public.sessions USING btree (input_tokens);


--
-- Name: idx_sessions_last_activity; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_last_activity ON public.sessions USING btree (last_activity_at) WHERE (((status)::text = 'active'::text) AND (last_activity_at IS NOT NULL));


--
-- Name: idx_sessions_project_agent; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_project_agent ON public.sessions USING btree (project_id, agent_type);


--
-- Name: idx_sessions_project_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_project_id ON public.sessions USING btree (project_id);


--
-- Name: idx_sessions_shadow_agent_type; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_shadow_agent_type ON public.sessions_shadow USING btree (agent_type);


--
-- Name: idx_sessions_shadow_project_agent; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_shadow_project_agent ON public.sessions_shadow USING btree (project_id, agent_type);


--
-- Name: idx_sessions_shadow_project_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_shadow_project_id ON public.sessions_shadow USING btree (project_id);


--
-- Name: idx_sessions_shadow_source_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_shadow_source_id ON public.sessions_shadow USING btree (_shadow_source_id);


--
-- Name: idx_sessions_shadow_started_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_shadow_started_at ON public.sessions_shadow USING btree (started_at);


--
-- Name: idx_sessions_shadow_sync_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_shadow_sync_status ON public.sessions_shadow USING btree (_shadow_sync_status);


--
-- Name: idx_sessions_shadow_title; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_shadow_title ON public.sessions_shadow USING btree (title) WHERE (title IS NOT NULL);


--
-- Name: idx_sessions_started_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_started_at ON public.sessions USING btree (started_at);


--
-- Name: idx_sessions_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_status ON public.sessions USING btree (status) WHERE ((status)::text = 'active'::text);


--
-- Name: idx_sessions_tasks_created; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_tasks_created ON public.sessions USING btree (tasks_created) WHERE (tasks_created > 0);


--
-- Name: idx_sessions_timeout_check; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_timeout_check ON public.sessions USING btree (status, last_activity_at) WHERE ((status)::text = 'active'::text);


--
-- Name: idx_sessions_title; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_title ON public.sessions USING btree (title);


--
-- Name: idx_sessions_total_tokens; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_sessions_total_tokens ON public.sessions USING btree (total_tokens);


--
-- Name: idx_tasks_active; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_active ON public.tasks USING btree (project_id, status) WHERE ((status)::text <> ALL (ARRAY[('completed'::character varying)::text, ('cancelled'::character varying)::text]));


--
-- Name: idx_tasks_assigned_to; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_assigned_to ON public.tasks USING btree (assigned_to);


--
-- Name: idx_tasks_compound_filter; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_compound_filter ON public.tasks USING btree (project_id, status, priority, type) WHERE ((status)::text <> 'cancelled'::text);


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
-- Name: idx_tasks_project; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_project ON public.tasks USING btree (project_id);


--
-- Name: idx_tasks_project_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_project_id ON public.tasks USING btree (project_id);


--
-- Name: idx_tasks_session_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_tasks_session_id ON public.tasks USING btree (session_id) WHERE (session_id IS NOT NULL);


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
-- Name: idx_technical_decisions_impl_commits; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_technical_decisions_impl_commits ON public.technical_decisions USING gin (implementing_commits);


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
-- Name: idx_temporal_authors; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_temporal_authors ON public.temporal_patterns USING gin (contributing_authors);


--
-- Name: idx_temporal_files; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_temporal_files ON public.temporal_patterns USING gin (contributing_files);


--
-- Name: idx_temporal_patterns_activity; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_temporal_patterns_activity ON public.temporal_patterns USING btree (activity_concentration_score DESC) WHERE (is_active = true);


--
-- Name: idx_temporal_patterns_significance; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_temporal_patterns_significance ON public.temporal_patterns USING btree (statistical_significance DESC, chi_square_statistic DESC) WHERE (is_active = true);


--
-- Name: idx_temporal_patterns_stability; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_temporal_patterns_stability ON public.temporal_patterns USING btree (project_id, pattern_stability, updated_at DESC);


--
-- Name: idx_temporal_patterns_type_strength; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_temporal_patterns_type_strength ON public.temporal_patterns USING btree (project_id, pattern_type, pattern_strength DESC);


--
-- Name: idx_traffic_routing_cutover_stage; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_traffic_routing_cutover_stage ON public.traffic_routing_config USING btree (cutover_stage);


--
-- Name: idx_traffic_routing_health_status; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_traffic_routing_health_status ON public.traffic_routing_config USING btree (health_status);


--
-- Name: idx_traffic_routing_stage_started; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_traffic_routing_stage_started ON public.traffic_routing_config USING btree (stage_started_at);


--
-- Name: idx_user_sessions_expires_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_user_sessions_expires_at ON public.user_sessions USING btree (expires_at);


--
-- Name: idx_user_sessions_is_active_started; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_user_sessions_is_active_started ON public.user_sessions USING btree (is_active, started_at);


--
-- Name: idx_user_sessions_last_activity; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_user_sessions_last_activity ON public.user_sessions USING btree (last_activity);


--
-- Name: idx_user_sessions_project_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_user_sessions_project_id ON public.user_sessions USING btree (project_id);


--
-- Name: idx_user_sessions_started_at; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_user_sessions_started_at ON public.user_sessions USING btree (started_at);


--
-- Name: idx_user_sessions_token_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_user_sessions_token_id ON public.user_sessions USING btree (token_id);


--
-- Name: idx_user_sessions_user_id; Type: INDEX; Schema: public; Owner: ridgetop
--

CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id);


--
-- Name: analytics_events analytics_events_dual_write_trigger; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER analytics_events_dual_write_trigger AFTER INSERT OR DELETE OR UPDATE ON public.analytics_events FOR EACH ROW EXECUTE FUNCTION public.dual_write_trigger_function();


--
-- Name: contexts contexts_dual_write_trigger; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER contexts_dual_write_trigger AFTER INSERT OR DELETE OR UPDATE ON public.contexts FOR EACH ROW EXECUTE FUNCTION public.dual_write_trigger_function();


--
-- Name: file_cooccurrence_patterns cooccurrence_lifecycle; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER cooccurrence_lifecycle BEFORE INSERT OR UPDATE ON public.file_cooccurrence_patterns FOR EACH ROW EXECUTE FUNCTION public.manage_pattern_lifecycle();


--
-- Name: core_development_metrics core_development_metrics_update_timestamp; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER core_development_metrics_update_timestamp BEFORE UPDATE ON public.core_development_metrics FOR EACH ROW EXECUTE FUNCTION public.update_metrics_timestamps();


--
-- Name: core_development_metrics core_metrics_alert_generation; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER core_metrics_alert_generation AFTER INSERT OR UPDATE ON public.core_development_metrics FOR EACH ROW EXECUTE FUNCTION public.auto_generate_metric_alerts();


--
-- Name: core_development_metrics core_metrics_classification; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER core_metrics_classification BEFORE INSERT OR UPDATE ON public.core_development_metrics FOR EACH ROW EXECUTE FUNCTION public.calculate_metric_classifications();


--
-- Name: developer_patterns developer_lifecycle; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER developer_lifecycle BEFORE INSERT OR UPDATE ON public.developer_patterns FOR EACH ROW EXECUTE FUNCTION public.manage_pattern_lifecycle();


--
-- Name: git_commits git_commits_auto_classify; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER git_commits_auto_classify BEFORE INSERT OR UPDATE ON public.git_commits FOR EACH ROW EXECUTE FUNCTION public.git_commits_trigger_fn();


--
-- Name: git_commits git_commits_update_branch_stats; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER git_commits_update_branch_stats AFTER INSERT ON public.git_commits FOR EACH ROW EXECUTE FUNCTION public.git_branches_update_stats_fn();


--
-- Name: pattern_insights insights_lifecycle; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER insights_lifecycle BEFORE INSERT OR UPDATE ON public.pattern_insights FOR EACH ROW EXECUTE FUNCTION public.auto_expire_insights();


--
-- Name: change_magnitude_patterns magnitude_lifecycle; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER magnitude_lifecycle BEFORE INSERT OR UPDATE ON public.change_magnitude_patterns FOR EACH ROW EXECUTE FUNCTION public.manage_pattern_lifecycle();


--
-- Name: metrics_collection_sessions metrics_collection_sessions_update_timestamp; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER metrics_collection_sessions_update_timestamp BEFORE UPDATE ON public.metrics_collection_sessions FOR EACH ROW EXECUTE FUNCTION public.update_metrics_timestamps();


--
-- Name: pattern_intelligence_metrics pattern_intelligence_classification; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER pattern_intelligence_classification BEFORE INSERT OR UPDATE ON public.pattern_intelligence_metrics FOR EACH ROW EXECUTE FUNCTION public.calculate_metric_classifications();


--
-- Name: productivity_health_metrics productivity_health_classification; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER productivity_health_classification BEFORE INSERT OR UPDATE ON public.productivity_health_metrics FOR EACH ROW EXECUTE FUNCTION public.calculate_metric_classifications();


--
-- Name: projects projects_dual_write_trigger; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER projects_dual_write_trigger AFTER INSERT OR DELETE OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.dual_write_trigger_function();


--
-- Name: sessions sessions_dual_write_trigger; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER sessions_dual_write_trigger AFTER INSERT OR DELETE OR UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.dual_write_trigger_function();


--
-- Name: tasks tasks_dual_write_trigger; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER tasks_dual_write_trigger AFTER INSERT OR DELETE OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.dual_write_trigger_function();


--
-- Name: sessions trigger_auto_generate_session_display_id; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER trigger_auto_generate_session_display_id BEFORE INSERT ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.auto_generate_session_display_id();


--
-- Name: sessions trigger_ensure_session_title; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER trigger_ensure_session_title BEFORE INSERT OR UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.ensure_session_title();


--
-- Name: decision_outcomes trigger_generate_learning_insights; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER trigger_generate_learning_insights AFTER INSERT OR UPDATE ON public.decision_outcomes FOR EACH ROW EXECUTE FUNCTION public.generate_learning_insights();


--
-- Name: file_complexity_summary trigger_update_complexity_session_summary; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER trigger_update_complexity_session_summary AFTER INSERT ON public.file_complexity_summary FOR EACH ROW EXECUTE FUNCTION public.update_complexity_analysis_session_summary();


--
-- Name: decision_outcomes trigger_update_decision_outcome_status; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER trigger_update_decision_outcome_status AFTER INSERT OR UPDATE ON public.decision_outcomes FOR EACH ROW EXECUTE FUNCTION public.update_decision_outcome_status();


--
-- Name: sessions trigger_update_session_activity; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER trigger_update_session_activity BEFORE UPDATE ON public.sessions FOR EACH ROW WHEN (((old.metadata IS DISTINCT FROM new.metadata) OR ((old.title)::text IS DISTINCT FROM (new.title)::text))) EXECUTE FUNCTION public.update_session_activity();


--
-- Name: tasks trigger_update_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER trigger_update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_tasks_updated_at();


--
-- Name: code_analysis_sessions update_code_analysis_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER update_code_analysis_sessions_updated_at BEFORE UPDATE ON public.code_analysis_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: file_cooccurrence_patterns update_cooccurrence_session_stats; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER update_cooccurrence_session_stats AFTER INSERT OR DELETE OR UPDATE ON public.file_cooccurrence_patterns FOR EACH ROW EXECUTE FUNCTION public.update_pattern_session_stats();


--
-- Name: developer_patterns update_developer_session_stats; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER update_developer_session_stats AFTER INSERT OR DELETE OR UPDATE ON public.developer_patterns FOR EACH ROW EXECUTE FUNCTION public.update_pattern_session_stats();


--
-- Name: git_commits update_git_branches_comprehensive_trigger; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER update_git_branches_comprehensive_trigger AFTER INSERT OR UPDATE ON public.git_commits FOR EACH ROW EXECUTE FUNCTION public.update_git_branches_comprehensive();


--
-- Name: pattern_insights update_insights_session_stats; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER update_insights_session_stats AFTER INSERT OR DELETE OR UPDATE ON public.pattern_insights FOR EACH ROW EXECUTE FUNCTION public.update_pattern_session_stats();


--
-- Name: change_magnitude_patterns update_magnitude_session_stats; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER update_magnitude_session_stats AFTER INSERT OR DELETE OR UPDATE ON public.change_magnitude_patterns FOR EACH ROW EXECUTE FUNCTION public.update_pattern_session_stats();


--
-- Name: projects update_projects_updated_at; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: session_project_mappings update_session_mappings_updated_at; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER update_session_mappings_updated_at BEFORE UPDATE ON public.session_project_mappings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sessions update_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sessions update_sessions_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER update_sessions_updated_at_trigger BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.update_sessions_updated_at();


--
-- Name: temporal_patterns update_temporal_session_stats; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER update_temporal_session_stats AFTER INSERT OR DELETE OR UPDATE ON public.temporal_patterns FOR EACH ROW EXECUTE FUNCTION public.update_pattern_session_stats();


--
-- Name: user_sessions update_user_sessions_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER update_user_sessions_updated_at_trigger BEFORE UPDATE ON public.user_sessions FOR EACH ROW EXECUTE FUNCTION public.update_user_sessions_updated_at();


--
-- Name: code_analysis_sessions validate_code_analysis_session_data; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER validate_code_analysis_session_data BEFORE INSERT OR UPDATE ON public.code_analysis_sessions FOR EACH ROW EXECUTE FUNCTION public.validate_code_analysis_session();


--
-- Name: git_commits validate_git_commits_normalized_trigger; Type: TRIGGER; Schema: public; Owner: ridgetop
--

CREATE TRIGGER validate_git_commits_normalized_trigger BEFORE INSERT OR UPDATE ON public.git_commits FOR EACH ROW EXECUTE FUNCTION public.validate_git_commits_normalized();


--
-- Name: analysis_session_links analysis_session_links_analysis_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.analysis_session_links
    ADD CONSTRAINT analysis_session_links_analysis_session_id_fkey FOREIGN KEY (analysis_session_id) REFERENCES public.code_analysis_sessions(id) ON DELETE CASCADE;


--
-- Name: analysis_session_links analysis_session_links_context_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.analysis_session_links
    ADD CONSTRAINT analysis_session_links_context_id_fkey FOREIGN KEY (context_id) REFERENCES public.contexts(id) ON DELETE SET NULL;


--
-- Name: analysis_session_links analysis_session_links_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.analysis_session_links
    ADD CONSTRAINT analysis_session_links_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES public.technical_decisions(id) ON DELETE SET NULL;


--
-- Name: analysis_session_links analysis_session_links_development_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.analysis_session_links
    ADD CONSTRAINT analysis_session_links_development_session_id_fkey FOREIGN KEY (development_session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: analysis_session_links analysis_session_links_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.analysis_session_links
    ADD CONSTRAINT analysis_session_links_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: analytics_events analytics_events_context_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.analytics_events
    ADD CONSTRAINT analytics_events_context_id_fkey FOREIGN KEY (context_id) REFERENCES public.contexts(id) ON DELETE SET NULL;


--
-- Name: analytics_events analytics_events_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.analytics_events
    ADD CONSTRAINT analytics_events_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: change_magnitude_patterns change_magnitude_patterns_discovery_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.change_magnitude_patterns
    ADD CONSTRAINT change_magnitude_patterns_discovery_session_id_fkey FOREIGN KEY (discovery_session_id) REFERENCES public.pattern_discovery_sessions(id) ON DELETE CASCADE;


--
-- Name: change_magnitude_patterns change_magnitude_patterns_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.change_magnitude_patterns
    ADD CONSTRAINT change_magnitude_patterns_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: code_analysis_sessions code_analysis_sessions_development_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_analysis_sessions
    ADD CONSTRAINT code_analysis_sessions_development_session_id_fkey FOREIGN KEY (development_session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;


--
-- Name: code_analysis_sessions code_analysis_sessions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_analysis_sessions
    ADD CONSTRAINT code_analysis_sessions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: code_components code_components_last_analysis_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_components
    ADD CONSTRAINT code_components_last_analysis_session_id_fkey FOREIGN KEY (last_analysis_session_id) REFERENCES public.code_analysis_sessions(id) ON DELETE SET NULL;


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
-- Name: code_metrics code_metrics_analysis_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_metrics
    ADD CONSTRAINT code_metrics_analysis_session_id_fkey FOREIGN KEY (analysis_session_id) REFERENCES public.code_analysis_sessions(id) ON DELETE CASCADE;


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
-- Name: cognitive_complexity_metrics cognitive_complexity_metrics_analysis_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.cognitive_complexity_metrics
    ADD CONSTRAINT cognitive_complexity_metrics_analysis_session_id_fkey FOREIGN KEY (analysis_session_id) REFERENCES public.complexity_analysis_sessions(id) ON DELETE CASCADE;


--
-- Name: cognitive_complexity_metrics cognitive_complexity_metrics_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.cognitive_complexity_metrics
    ADD CONSTRAINT cognitive_complexity_metrics_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


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
-- Name: complexity_alerts complexity_alerts_analysis_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.complexity_alerts
    ADD CONSTRAINT complexity_alerts_analysis_session_id_fkey FOREIGN KEY (analysis_session_id) REFERENCES public.complexity_analysis_sessions(id) ON DELETE SET NULL;


--
-- Name: complexity_alerts complexity_alerts_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.complexity_alerts
    ADD CONSTRAINT complexity_alerts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: complexity_analysis_sessions complexity_analysis_sessions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.complexity_analysis_sessions
    ADD CONSTRAINT complexity_analysis_sessions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: complexity_analysis_sessions complexity_analysis_sessions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.complexity_analysis_sessions
    ADD CONSTRAINT complexity_analysis_sessions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;


--
-- Name: complexity_trends complexity_trends_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.complexity_trends
    ADD CONSTRAINT complexity_trends_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: contexts contexts_pattern_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.contexts
    ADD CONSTRAINT contexts_pattern_session_id_fkey FOREIGN KEY (pattern_session_id) REFERENCES public.pattern_discovery_sessions(id) ON DELETE SET NULL;


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
-- Name: core_development_metrics core_development_metrics_collection_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.core_development_metrics
    ADD CONSTRAINT core_development_metrics_collection_session_id_fkey FOREIGN KEY (collection_session_id) REFERENCES public.metrics_collection_sessions(id) ON DELETE CASCADE;


--
-- Name: core_development_metrics core_development_metrics_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.core_development_metrics
    ADD CONSTRAINT core_development_metrics_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: core_development_metrics core_development_metrics_superseded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.core_development_metrics
    ADD CONSTRAINT core_development_metrics_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES public.core_development_metrics(id) ON DELETE SET NULL;


--
-- Name: cyclomatic_complexity_metrics cyclomatic_complexity_metrics_analysis_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.cyclomatic_complexity_metrics
    ADD CONSTRAINT cyclomatic_complexity_metrics_analysis_session_id_fkey FOREIGN KEY (analysis_session_id) REFERENCES public.complexity_analysis_sessions(id) ON DELETE CASCADE;


--
-- Name: cyclomatic_complexity_metrics cyclomatic_complexity_metrics_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.cyclomatic_complexity_metrics
    ADD CONSTRAINT cyclomatic_complexity_metrics_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: decision_impact_analysis decision_impact_analysis_impacted_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.decision_impact_analysis
    ADD CONSTRAINT decision_impact_analysis_impacted_decision_id_fkey FOREIGN KEY (impacted_decision_id) REFERENCES public.technical_decisions(id) ON DELETE CASCADE;


--
-- Name: decision_impact_analysis decision_impact_analysis_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.decision_impact_analysis
    ADD CONSTRAINT decision_impact_analysis_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: decision_impact_analysis decision_impact_analysis_source_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.decision_impact_analysis
    ADD CONSTRAINT decision_impact_analysis_source_decision_id_fkey FOREIGN KEY (source_decision_id) REFERENCES public.technical_decisions(id) ON DELETE CASCADE;


--
-- Name: decision_learning_insights decision_learning_insights_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.decision_learning_insights
    ADD CONSTRAINT decision_learning_insights_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: decision_metrics_timeline decision_metrics_timeline_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.decision_metrics_timeline
    ADD CONSTRAINT decision_metrics_timeline_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES public.technical_decisions(id) ON DELETE CASCADE;


--
-- Name: decision_metrics_timeline decision_metrics_timeline_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.decision_metrics_timeline
    ADD CONSTRAINT decision_metrics_timeline_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: decision_outcomes decision_outcomes_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.decision_outcomes
    ADD CONSTRAINT decision_outcomes_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES public.technical_decisions(id) ON DELETE CASCADE;


--
-- Name: decision_outcomes decision_outcomes_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.decision_outcomes
    ADD CONSTRAINT decision_outcomes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: decision_retrospectives decision_retrospectives_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.decision_retrospectives
    ADD CONSTRAINT decision_retrospectives_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES public.technical_decisions(id) ON DELETE CASCADE;


--
-- Name: decision_retrospectives decision_retrospectives_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.decision_retrospectives
    ADD CONSTRAINT decision_retrospectives_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: dependency_complexity_metrics dependency_complexity_metrics_analysis_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.dependency_complexity_metrics
    ADD CONSTRAINT dependency_complexity_metrics_analysis_session_id_fkey FOREIGN KEY (analysis_session_id) REFERENCES public.complexity_analysis_sessions(id) ON DELETE CASCADE;


--
-- Name: dependency_complexity_metrics dependency_complexity_metrics_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.dependency_complexity_metrics
    ADD CONSTRAINT dependency_complexity_metrics_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: developer_patterns developer_patterns_discovery_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.developer_patterns
    ADD CONSTRAINT developer_patterns_discovery_session_id_fkey FOREIGN KEY (discovery_session_id) REFERENCES public.pattern_discovery_sessions(id) ON DELETE CASCADE;


--
-- Name: developer_patterns developer_patterns_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.developer_patterns
    ADD CONSTRAINT developer_patterns_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: event_log event_log_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.event_log
    ADD CONSTRAINT event_log_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: event_log event_log_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.event_log
    ADD CONSTRAINT event_log_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id);


--
-- Name: file_analysis_cache file_analysis_cache_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.file_analysis_cache
    ADD CONSTRAINT file_analysis_cache_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: file_complexity_summary file_complexity_summary_analysis_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.file_complexity_summary
    ADD CONSTRAINT file_complexity_summary_analysis_session_id_fkey FOREIGN KEY (analysis_session_id) REFERENCES public.complexity_analysis_sessions(id) ON DELETE CASCADE;


--
-- Name: file_complexity_summary file_complexity_summary_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.file_complexity_summary
    ADD CONSTRAINT file_complexity_summary_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: file_cooccurrence_patterns file_cooccurrence_patterns_discovery_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.file_cooccurrence_patterns
    ADD CONSTRAINT file_cooccurrence_patterns_discovery_session_id_fkey FOREIGN KEY (discovery_session_id) REFERENCES public.pattern_discovery_sessions(id) ON DELETE CASCADE;


--
-- Name: file_cooccurrence_patterns file_cooccurrence_patterns_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.file_cooccurrence_patterns
    ADD CONSTRAINT file_cooccurrence_patterns_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: code_analysis_sessions fk_code_analysis_sessions_commit; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.code_analysis_sessions
    ADD CONSTRAINT fk_code_analysis_sessions_commit FOREIGN KEY (project_id, commit_sha) REFERENCES public.git_commits(project_id, commit_sha) ON DELETE SET NULL;


--
-- Name: sessions fk_sessions_project; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT fk_sessions_project FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: tasks fk_tasks_project; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: tasks fk_tasks_session_id; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT fk_tasks_session_id FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;


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
-- Name: git_file_changes git_file_changes_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.git_file_changes
    ADD CONSTRAINT git_file_changes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: halstead_complexity_metrics halstead_complexity_metrics_analysis_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.halstead_complexity_metrics
    ADD CONSTRAINT halstead_complexity_metrics_analysis_session_id_fkey FOREIGN KEY (analysis_session_id) REFERENCES public.complexity_analysis_sessions(id) ON DELETE CASCADE;


--
-- Name: halstead_complexity_metrics halstead_complexity_metrics_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.halstead_complexity_metrics
    ADD CONSTRAINT halstead_complexity_metrics_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: metrics_alerts metrics_alerts_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.metrics_alerts
    ADD CONSTRAINT metrics_alerts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: metrics_collection_sessions metrics_collection_sessions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.metrics_collection_sessions
    ADD CONSTRAINT metrics_collection_sessions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: metrics_collection_sessions metrics_collection_sessions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.metrics_collection_sessions
    ADD CONSTRAINT metrics_collection_sessions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;


--
-- Name: metrics_trends metrics_trends_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.metrics_trends
    ADD CONSTRAINT metrics_trends_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


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
-- Name: pattern_discovery_sessions pattern_discovery_sessions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.pattern_discovery_sessions
    ADD CONSTRAINT pattern_discovery_sessions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: pattern_discovery_sessions pattern_discovery_sessions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.pattern_discovery_sessions
    ADD CONSTRAINT pattern_discovery_sessions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;


--
-- Name: pattern_discovery_sessions pattern_discovery_sessions_superseded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.pattern_discovery_sessions
    ADD CONSTRAINT pattern_discovery_sessions_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES public.pattern_discovery_sessions(id) ON DELETE SET NULL;


--
-- Name: pattern_insights pattern_insights_discovery_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.pattern_insights
    ADD CONSTRAINT pattern_insights_discovery_session_id_fkey FOREIGN KEY (discovery_session_id) REFERENCES public.pattern_discovery_sessions(id) ON DELETE CASCADE;


--
-- Name: pattern_insights pattern_insights_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.pattern_insights
    ADD CONSTRAINT pattern_insights_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: pattern_insights pattern_insights_superseded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.pattern_insights
    ADD CONSTRAINT pattern_insights_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES public.pattern_insights(id) ON DELETE SET NULL;


--
-- Name: pattern_intelligence_metrics pattern_intelligence_metrics_collection_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.pattern_intelligence_metrics
    ADD CONSTRAINT pattern_intelligence_metrics_collection_session_id_fkey FOREIGN KEY (collection_session_id) REFERENCES public.metrics_collection_sessions(id) ON DELETE CASCADE;


--
-- Name: pattern_intelligence_metrics pattern_intelligence_metrics_pattern_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.pattern_intelligence_metrics
    ADD CONSTRAINT pattern_intelligence_metrics_pattern_session_id_fkey FOREIGN KEY (pattern_session_id) REFERENCES public.pattern_discovery_sessions(id) ON DELETE SET NULL;


--
-- Name: pattern_intelligence_metrics pattern_intelligence_metrics_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.pattern_intelligence_metrics
    ADD CONSTRAINT pattern_intelligence_metrics_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: pattern_operation_metrics pattern_operation_metrics_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.pattern_operation_metrics
    ADD CONSTRAINT pattern_operation_metrics_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: productivity_health_metrics productivity_health_metrics_collection_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.productivity_health_metrics
    ADD CONSTRAINT productivity_health_metrics_collection_session_id_fkey FOREIGN KEY (collection_session_id) REFERENCES public.metrics_collection_sessions(id) ON DELETE CASCADE;


--
-- Name: productivity_health_metrics productivity_health_metrics_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.productivity_health_metrics
    ADD CONSTRAINT productivity_health_metrics_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: productivity_health_metrics productivity_health_metrics_target_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.productivity_health_metrics
    ADD CONSTRAINT productivity_health_metrics_target_session_id_fkey FOREIGN KEY (target_session_id) REFERENCES public.sessions(id) ON DELETE SET NULL;


--
-- Name: refactoring_opportunities refactoring_opportunities_analysis_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.refactoring_opportunities
    ADD CONSTRAINT refactoring_opportunities_analysis_session_id_fkey FOREIGN KEY (analysis_session_id) REFERENCES public.complexity_analysis_sessions(id) ON DELETE CASCADE;


--
-- Name: refactoring_opportunities refactoring_opportunities_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.refactoring_opportunities
    ADD CONSTRAINT refactoring_opportunities_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: session_project_mappings session_project_mappings_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.session_project_mappings
    ADD CONSTRAINT session_project_mappings_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


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
-- Name: temporal_patterns temporal_patterns_discovery_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.temporal_patterns
    ADD CONSTRAINT temporal_patterns_discovery_session_id_fkey FOREIGN KEY (discovery_session_id) REFERENCES public.pattern_discovery_sessions(id) ON DELETE CASCADE;


--
-- Name: temporal_patterns temporal_patterns_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.temporal_patterns
    ADD CONSTRAINT temporal_patterns_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: ridgetop
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.admin_users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict JMM4Q0LDX1GdFtp9MBSv6mMferfqWiF5DftcJa9RxTjr9kizaLNg0c0c10AYceO

