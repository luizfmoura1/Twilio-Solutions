-- Migration: Fix duration values
-- Date: 2026-01-15
-- Description: Recalculate duration for calls with duration=0 but valid timestamps

-- For answered calls (have answered_at): duration = ended_at - answered_at
UPDATE calls
SET duration = EXTRACT(EPOCH FROM (ended_at - answered_at))::INTEGER
WHERE duration = 0
  AND answered_at IS NOT NULL
  AND ended_at IS NOT NULL
  AND ended_at > answered_at;

-- For unanswered calls (no answered_at): duration = ended_at - started_at
UPDATE calls
SET duration = EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER
WHERE duration = 0
  AND answered_at IS NULL
  AND started_at IS NOT NULL
  AND ended_at IS NOT NULL
  AND ended_at > started_at;

-- Ensure no negative durations
UPDATE calls
SET duration = 0
WHERE duration < 0;

-- Verify results
-- SELECT id, call_sid, disposition, duration, started_at, answered_at, ended_at FROM calls ORDER BY created_at DESC LIMIT 20;
