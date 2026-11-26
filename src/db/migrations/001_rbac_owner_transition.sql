-- 360 Café: Four-Tier RBAC & Secure Owner Transition Migration (Cloud SQL PostgreSQL)
-- Non-destructive migration: preserves all existing profiles, categories, products, orders, and settings.

BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS supabase_uid TEXT;

CREATE INDEX IF NOT EXISTS profiles_supabase_uid_idx
  ON profiles(supabase_uid);

-- 2. Single-use cryptographic token table for Owner-initiated Supabase account linking.
CREATE TABLE IF NOT EXISTS profile_link_tokens (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profile_link_tokens_profile_idx
  ON profile_link_tokens(profile_id);

-- 3. Promote ONLY the pre-existing verified owner profile (id = 1) from 'admin' to 'owner'.
--    This is a one-time explicit record transition by primary key and original UID,
--    not email-based auto-promotion.
UPDATE profiles
SET role = 'owner'
WHERE id = 1
  AND uid = 'Ah3kij1HT0V1A3LeIAk2Vaqzgjg1'
  AND role = 'admin';

COMMIT;
