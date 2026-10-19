-- Saved homes (spec 0002 `saved_homes`, feature 14; spec 0013). Additive only.

-- CreateTable
CREATE TABLE "saved_homes" (
    "user_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_homes_pkey" PRIMARY KEY ("user_id","listing_id")
);

-- CreateIndex
CREATE INDEX "saved_homes_listing_id_idx" ON "saved_homes"("listing_id");

-- CreateIndex
CREATE INDEX "saved_homes_user_id_created_at_idx" ON "saved_homes"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "saved_homes" ADD CONSTRAINT "saved_homes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_homes" ADD CONSTRAINT "saved_homes_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row level security on, no policies: only the server (table owner) reads it.
ALTER TABLE saved_homes ENABLE ROW LEVEL SECURITY;

-- Revoke the Supabase API roles where they exist (guarded, as in core_slice1).
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE saved_homes FROM %I', r);
    END IF;
  END LOOP;
END
$$;
