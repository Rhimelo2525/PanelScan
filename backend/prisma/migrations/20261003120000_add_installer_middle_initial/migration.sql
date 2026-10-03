-- AlterTable
-- Optional installer middle initial, entered on the Add installer form.
-- Nullable, so existing installers are unaffected.
ALTER TABLE "installers" ADD COLUMN "middle_initial" STRING;
