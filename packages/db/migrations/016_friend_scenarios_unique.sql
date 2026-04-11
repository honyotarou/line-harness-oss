-- One enrollment per (friend_id, scenario_id); removes TOCTOU duplicates from parallel OAuth + webhook.
DELETE FROM friend_scenarios
WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM friend_scenarios GROUP BY friend_id, scenario_id
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_friend_scenarios_friend_scenario ON friend_scenarios (friend_id, scenario_id);
