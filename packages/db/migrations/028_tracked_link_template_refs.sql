-- Optional template UUIDs for tracked-link campaigns (validated in application layer).
ALTER TABLE tracked_links ADD COLUMN intro_template_id TEXT;
ALTER TABLE tracked_links ADD COLUMN reward_template_id TEXT;
