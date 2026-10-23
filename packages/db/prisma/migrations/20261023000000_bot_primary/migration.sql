-- The Primary bot: at most one per user in each space. Additive; older releases ignore it.
ALTER TABLE "bots" ADD COLUMN "primary" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "bots_spaceId_userId_primary_key" ON "bots"("spaceId", "userId") WHERE "primary";
