-- Security hardening for sensitive integrations and aggregate rate data.
--
-- Keeps current product behavior intact:
-- - users can still see their connected Google email/status
-- - the Worker can still read/refresh Google OAuth tokens with service role
-- - public rate estimates can still read anonymized aggregate buckets

-- 1) Hide Google OAuth token columns from browser roles. The Worker reads
--    tokens through the service role; browser code only needs status fields.
REVOKE SELECT ON public.google_workspace_connections FROM anon, authenticated;
REVOKE ALL ON public.google_workspace_connections FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.google_workspace_connections FROM authenticated;
GRANT SELECT (user_id, email, expires_at, created_at, updated_at)
  ON public.google_workspace_connections TO authenticated;

-- 2) Keep the aggregate view intentionally public, but make that explicit and
--    grant only SELECT. The security_barrier option reduces predicate-pushdown
--    surprises around an anonymized aggregate view.
CREATE OR REPLACE VIEW public.rate_aggregates
WITH (security_barrier = true) AS
SELECT
  platform,
  CASE
    WHEN followers_at_time IS NULL THEN 'unknown'
    WHEN followers_at_time < 10000   THEN 'nano'
    WHEN followers_at_time < 100000  THEN 'micro'
    WHEN followers_at_time < 500000  THEN 'mid'
    WHEN followers_at_time < 1000000 THEN 'macro'
    ELSE 'mega'
  END AS tier,
  COALESCE(NULLIF(niche, ''), 'unknown') AS niche,
  deliverable,
  COUNT(*)::INTEGER AS n,
  PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY amount_usd)::NUMERIC(10,2) AS p50,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY amount_usd)::NUMERIC(10,2) AS p25,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY amount_usd)::NUMERIC(10,2) AS p75,
  MIN(amount_usd)::NUMERIC(10,2) AS min,
  MAX(amount_usd)::NUMERIC(10,2) AS max
FROM public.creator_submitted_rates
WHERE amount_usd > 0
GROUP BY 1, 2, 3, 4
HAVING COUNT(*) >= 3;

REVOKE ALL ON public.rate_aggregates FROM anon, authenticated;
GRANT SELECT ON public.rate_aggregates TO anon, authenticated;

-- 3) Move the SECURITY DEFINER event-trigger function out of the exposed
--    public schema. The event trigger tracks the function by OID, so ALTER
--    FUNCTION preserves the existing trigger binding.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
ALTER FUNCTION public.rls_auto_enable() SET SCHEMA private;
