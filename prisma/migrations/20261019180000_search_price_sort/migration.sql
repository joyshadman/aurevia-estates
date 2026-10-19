-- Price sorts on the public search page (spec 0010): keyset paging over
-- PUBLISHED rows by (price_bdt, id).

-- CreateIndex
CREATE INDEX "listings_status_price_bdt_id_idx" ON "listings"("status", "price_bdt", "id");
