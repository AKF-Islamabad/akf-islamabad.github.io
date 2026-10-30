-- Supabase security rules check, run by .github/workflows/security.yml (job "baas-rules").
--   psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 -f tools/check-rls.sql
-- It only READS the system catalogs, so it can run as a login role with no table rights (ci_auditor).
-- MUST be empty (the job fails): tables in "public" without Row-Level Security, and views the browser
-- roles can read that skip RLS. REVIEW (warnings only): always-true policies for anon, and
-- SECURITY DEFINER functions that a signed-out visitor (anon) can run.
\pset footer off
\pset null '-'

\echo
\echo '== 1. Tables in public WITHOUT Row-Level Security (must be empty) =='
select c.relname as table_name
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
order by 1;

\echo '== 2. Views anon/authenticated can read that bypass RLS (must be empty) =='
select c.relname as view_name, case c.relkind when 'm' then 'materialized view' else 'view' end as kind
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v', 'm')
  and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))
  and not exists (select 1 from unnest(coalesce(c.reloptions, '{}')) o where o ~* '^security_invoker=(true|on|1|yes)$')
order by 1;

\echo '== 3. REVIEW: policies that let anon (signed-out visitors) see or write every row =='
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and roles && array['anon', 'public']::name[]
  and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true')
order by 1, 2;

\echo '== 4. REVIEW: SECURITY DEFINER functions a signed-out visitor (anon) can run =='
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as function
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
  and has_function_privilege('anon', p.oid, 'execute')
order by 1;

do $$
declare no_rls int; open_views int; warn int;
begin
  select count(*) into no_rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  select count(*) into open_views from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('v', 'm')
     and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))
     and not exists (select 1 from unnest(coalesce(c.reloptions, '{}')) o where o ~* '^security_invoker=(true|on|1|yes)$');
  select count(*) into warn from pg_policies where schemaname = 'public' and roles && array['anon', 'public']::name[]
     and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true');
  if warn > 0 then raise warning '% always-true anon polic(ies) to review (list 3)', warn; end if;
  if no_rls + open_views > 0 then
    raise exception 'RLS check FAILED: % table(s) without RLS, % view(s) that bypass RLS (lists 1 and 2)', no_rls, open_views;
  end if;
  raise notice 'RLS check passed: every public table has Row-Level Security on';
end $$;
