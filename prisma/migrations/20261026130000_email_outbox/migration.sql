-- Spec 0019 (booking and lead notifications), *Outbox*: emails queued inside
-- the writer's transaction, sent after the response, retried by the cron. No
-- row level security block (prisma/AGENTS.md: new tables skip it).

-- CreateEnum
CREATE TYPE "outbox_status" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "to_email" TEXT NOT NULL,
    "profile_id" UUID,
    "payload" JSONB NOT NULL,
    "status" "outbox_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_outbox_status_next_attempt_at_idx" ON "email_outbox"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "email_outbox_profile_id_idx" ON "email_outbox"("profile_id");

-- AddForeignKey
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Check constraints live only here (prisma/AGENTS.md).
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_kind_ck" CHECK ("kind" IN ('viewing_requested', 'lead_new', 'viewing_confirmed'));
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_attempts_ck" CHECK ("attempts" >= 0);
