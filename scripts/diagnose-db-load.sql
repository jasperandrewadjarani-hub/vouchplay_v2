-- =============================================================================
-- VouchPlay v2 - database load diagnosis (READ-ONLY; changes nothing)
-- Run in the Supabase SQL editor and send back a screenshot of each result.
-- Written 2026-09-15 after the memory/swap + Disk IO budget outage.
-- =============================================================================

-- 1. Size: whole database, and the 10 largest tables (including indexes).
select pg_size_pretty(pg_database_size(current_database())) as database_size;

select relname as table_name,
       pg_size_pretty(pg_total_relation_size(relid)) as total_size,
       n_live_tup as approx_rows
  from pg_stat_user_tables
 order by pg_total_relation_size(relid) desc
 limit 10;

-- 2. Connections right now: who holds them and in what state.
select coalesce(nullif(application_name, ''), usename, 'unknown') as client,
       state,
       count(*) as connections
  from pg_stat_activity
 where datname = current_database()
 group by 1, 2
 order by connections desc;

-- 3. The queries that did the most work (time and disk reads) since stats were last reset.
select round(total_exec_time::numeric / 1000, 1) as total_seconds,
       calls,
       round(mean_exec_time::numeric, 1) as avg_ms,
       shared_blks_read as disk_blocks_read,
       temp_blks_written as temp_blocks_written,
       left(regexp_replace(query, '\s+', ' ', 'g'), 160) as query
  from pg_stat_statements
 order by total_exec_time desc
 limit 15;

-- 4. Tables read by full scans far more than by index (missing-index candidates).
select relname as table_name,
       seq_scan,
       seq_tup_read,
       idx_scan,
       n_live_tup as approx_rows
  from pg_stat_user_tables
 where seq_scan > 0
 order by seq_tup_read desc
 limit 10;
