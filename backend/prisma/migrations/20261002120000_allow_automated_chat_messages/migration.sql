-- Automated support replies (the one-time "we will reply soon" message in a
-- customer chat) have no person as sender. Existing rows are unchanged.
ALTER TABLE "messages" ALTER COLUMN "sender_id" DROP NOT NULL;
