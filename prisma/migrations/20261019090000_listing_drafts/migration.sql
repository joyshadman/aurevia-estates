-- Partial drafts (spec 0005, data model): a DRAFT may leave price, address, and
-- description empty until it is published.

-- AlterTable
ALTER TABLE "listings" ALTER COLUMN "description" DROP NOT NULL,
ALTER COLUMN "price_bdt" DROP NOT NULL,
ALTER COLUMN "address_line" DROP NOT NULL,
ALTER COLUMN "updated_at" SET DEFAULT date_trunc('milliseconds'::text, now());

-- A PUBLISHED listing must still be complete. `listings_price_positive_ck`
-- (price_bdt > 0) passes for null, so it stays as it is.
ALTER TABLE listings DROP CONSTRAINT listings_published_complete_ck;
ALTER TABLE listings
  ADD CONSTRAINT listings_published_complete_ck CHECK (
    status <> 'PUBLISHED'
    OR (
      latitude IS NOT NULL AND longitude IS NOT NULL AND published_at IS NOT NULL
      AND assigned_agent_id IS NOT NULL AND price_bdt IS NOT NULL
      AND address_line IS NOT NULL AND description IS NOT NULL
    )
  );
