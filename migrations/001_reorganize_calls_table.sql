-- Migration: Reorganize calls table
-- Date: 2026-01-15
-- Description: Remove unused columns (cost, agent_id, status) and add new columns (queue_time, caller_city)

-- Step 1: Add new columns
ALTER TABLE calls ADD COLUMN IF NOT EXISTS queue_time INTEGER DEFAULT 0;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS caller_city VARCHAR(100);

-- Step 2: Remove unused columns
ALTER TABLE calls DROP COLUMN IF EXISTS cost;
ALTER TABLE calls DROP COLUMN IF EXISTS agent_id;
ALTER TABLE calls DROP COLUMN IF EXISTS status;

-- Verify changes
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'calls';
