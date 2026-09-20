-- Drops two indexes that are fully redundant with an existing unique index
-- on the same column(s), confirmed via `prisma migrate diff` against the
-- live database plus a manual column-coverage check (both cover exactly
-- (order_id, id), identical to the unique index kept below):
--
--   bookings_order_id_idx   - redundant with bookings_order_id_key
--                             (Booking.orderId is @unique; the unique
--                             index already serves every lookup this
--                             plain index could)
--   feedbacks_order_id_idx  - orphaned leftover from before
--                             Feedback.orderId became @unique
--                             (20260919000000_add_unique_order_id_to_feedback
--                             added the unique index but never dropped
--                             this one); current schema.prisma no longer
--                             declares this index at all.
--
-- Neither drop removes any FK constraint, the PK, or the unique index
-- itself - only the redundant secondary index.

-- DropIndex
DROP INDEX "bookings_order_id_idx";

-- DropIndex
DROP INDEX "feedbacks_order_id_idx";
