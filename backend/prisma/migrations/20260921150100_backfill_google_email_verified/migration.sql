-- Data-only backfill, kept separate from the migration that adds
-- "email_verified" because CockroachDB cannot write to a column in the same
-- transaction that created it.
--
-- Accounts linked to Google had their email verified by Google itself (the
-- Google sign-in flow refuses any profile whose email_verified claim is
-- false), so they start verified. Every other existing account stays
-- unverified until its owner proves the mailbox from their profile.
UPDATE "users" SET "email_verified" = true WHERE "google_id" IS NOT NULL AND "email_verified" = false;
