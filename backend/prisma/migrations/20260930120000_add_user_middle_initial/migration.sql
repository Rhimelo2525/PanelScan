-- AlterTable
-- Optional middle initial captured at registration and editable on the
-- profile page. Nullable, so existing accounts are unaffected.
ALTER TABLE "users" ADD COLUMN "middle_initial" STRING;
