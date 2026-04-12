-- V-7: Canonical lowercase users.email so partial UNIQUE (idx_users_email_unique) cannot admit
-- case-only duplicates; OAuth then cannot link a new friend to a different user that "matches" via LOWER().
-- If UNIQUE fails, two distinct users collapse to the same email under LOWER — resolve manually (merge/drop) then re-run.
UPDATE users
SET
  email = LOWER(TRIM(email)),
  updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE
  email IS NOT NULL
  AND TRIM(email) != ''
  AND email != LOWER(TRIM(email));
