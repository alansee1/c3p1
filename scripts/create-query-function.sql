-- Run this in Supabase SQL Editor to enable raw SELECT queries
-- This function only allows SELECT statements for safety

CREATE OR REPLACE FUNCTION exec_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  -- Only allow SELECT queries
  IF NOT (lower(trim(query)) LIKE 'select%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  -- Execute and return as JSON
  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || query || ') t'
    INTO result;

  -- Return empty array instead of null if no results
  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Grant access to the function
GRANT EXECUTE ON FUNCTION exec_sql(text) TO service_role;
