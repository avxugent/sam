-- Data migration: saved reports from before the location report type have no
-- `source` in their JSON definition. Mark them as asset reports so the report
-- definition schema can require `source` as its discriminant.
-- `definition` is a TEXT column holding JSON; rows that are not a valid JSON
-- object are left alone (the app already treats them as invalid definitions).
-- CASE guards the JSON functions, which raise an error on invalid JSON.
UPDATE `reports`
SET `definition` = JSON_SET(`definition`, '$.source', 'asset')
WHERE CASE
  WHEN JSON_VALID(`definition`) THEN JSON_TYPE(`definition`) = 'OBJECT' AND JSON_EXTRACT(`definition`, '$.source') IS NULL
  ELSE FALSE
END;
