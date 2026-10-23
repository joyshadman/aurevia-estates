-- Spec 0005 (agent listing management), data model: drafts may leave price,
-- address, and description empty; a PUBLISHED listing must still have them.

ALTER TABLE "listings"
  ALTER COLUMN "price_bdt" DROP NOT NULL,
  ALTER COLUMN "address_line" DROP NOT NULL,
  ALTER COLUMN "description" DROP NOT NULL,
  -- Millisecond precision, so the conflict token (`updated_at`) always round trips.
  ALTER COLUMN "updated_at" SET DEFAULT date_trunc('milliseconds'::text, now());

-- `listings_price_positive_ck` (price_bdt > 0) passes for null and stays.
ALTER TABLE listings
  DROP CONSTRAINT listings_published_complete_ck,
  ADD CONSTRAINT listings_published_complete_ck CHECK (
    status <> 'PUBLISHED'
    OR (
      latitude IS NOT NULL AND longitude IS NOT NULL AND published_at IS NOT NULL
      AND assigned_agent_id IS NOT NULL AND price_bdt IS NOT NULL
      AND address_line IS NOT NULL AND description IS NOT NULL
    )
  );
