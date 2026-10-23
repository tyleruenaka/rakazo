ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "lastReadSeq" INTEGER NOT NULL DEFAULT -1;

-- Existing chats count as read up to their latest message, so no divider appears
-- for history that predates the cursor; their unread dot is unchanged. Only chats
-- still at the default are touched, so a saved read position is never overwritten.
UPDATE "threads" SET "lastReadSeq" = "nextMessageSeq" - 1
WHERE "nextMessageSeq" > 0 AND "lastReadSeq" = -1;
