-- migrate:up
-- The public read model folds the Vex integrator fee leg under the action it charges for: the feed,
-- the tx page, the lookup and the counts all resolve an execution's legs from the row in hand. Every
-- one of those reads asks the same question - "which other legs share this row's execution?" - and
-- answers it with (agent_hash, source_execution_id), ordered by event_index to pick the parent.
--
-- `source_execution_id` is unique only WITHIN an agent (activities_agent_hash_source_row_id_key is
-- the only uniqueness the table has), so agent_hash leads the key; without it the lateral would scan
-- other agents' executions that happen to share an id string.
--
-- No existing index answers this. idx_activities_agent_confirmed leads with agent_hash but continues
-- on client_confirmed_at, so an execution's legs are scattered across it. Without this index the fee
-- lateral degrades to a sequential scan per feed row, which is fifty scans of the whole table for
-- one page.
--
-- event_index is the third column rather than a sort-only afterthought because the parent is defined
-- as the lowest-indexed non-fee leg, so the index supplies the order the LIMIT 1 depends on.
CREATE INDEX idx_activities_execution_legs
  ON activities (agent_hash, source_execution_id, event_index);

-- migrate:down
DROP INDEX idx_activities_execution_legs;
