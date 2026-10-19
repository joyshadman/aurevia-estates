-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "anonymized_at" TIMESTAMPTZ(3);

-- Raw SQL (spec 0002, AC-10): an anonymized lead is exempt from the contact
-- check, and must hold no visitor, phone, or email. The drop and the new
-- definition run in one statement, so the table is never without the check.
-- Existing rows have a null anonymized_at, so they pass both checks unchanged.
ALTER TABLE leads
  DROP CONSTRAINT leads_contact_ck,
  ADD CONSTRAINT leads_contact_ck CHECK (
    anonymized_at IS NOT NULL OR contact_phone IS NOT NULL OR contact_email IS NOT NULL
  ),
  ADD CONSTRAINT leads_anonymized_ck CHECK (
    anonymized_at IS NULL OR (visitor_id IS NULL AND contact_phone IS NULL AND contact_email IS NULL)
  );
