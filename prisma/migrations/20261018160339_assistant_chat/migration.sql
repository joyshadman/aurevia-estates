-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "stop_requested_at" TIMESTAMPTZ(3),
ADD COLUMN     "turn_started_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "assistant_fact_sheets" (
    "id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "previous_id" UUID,
    "created_by_id" UUID,
    "restored_from_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_fact_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assistant_fact_sheets_previous_id_key" ON "assistant_fact_sheets"("previous_id");

-- CreateIndex
CREATE INDEX "assistant_fact_sheets_created_at_id_idx" ON "assistant_fact_sheets"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "assistant_fact_sheets_created_by_id_idx" ON "assistant_fact_sheets"("created_by_id");

-- CreateIndex
CREATE INDEX "assistant_fact_sheets_restored_from_id_idx" ON "assistant_fact_sheets"("restored_from_id");

-- AddForeignKey
ALTER TABLE "assistant_fact_sheets" ADD CONSTRAINT "assistant_fact_sheets_previous_id_fkey" FOREIGN KEY ("previous_id") REFERENCES "assistant_fact_sheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_fact_sheets" ADD CONSTRAINT "assistant_fact_sheets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_fact_sheets" ADD CONSTRAINT "assistant_fact_sheets_restored_from_id_fkey" FOREIGN KEY ("restored_from_id") REFERENCES "assistant_fact_sheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Raw SQL (spec 0006): body length rule.
ALTER TABLE assistant_fact_sheets
  ADD CONSTRAINT assistant_fact_sheets_body_ck CHECK (char_length(body) BETWEEN 1 AND 4000);

-- Row level security on, no policies (spec 0001).
ALTER TABLE assistant_fact_sheets ENABLE ROW LEVEL SECURITY;

-- Revoke the Supabase API roles where they exist (guarded, as in core_slice1).
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE assistant_fact_sheets FROM %I', r);
    END IF;
  END LOOP;
END
$$;
