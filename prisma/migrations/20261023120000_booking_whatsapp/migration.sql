-- Spec 0007 (viewing booking from chat), *Data model*: the WhatsApp flag on the
-- visitor's phone and on the lead's contact copy, and the conversation a
-- viewing was booked from (the success metric's source).

ALTER TABLE "profiles" ADD COLUMN "phone_is_whatsapp" BOOLEAN NOT NULL DEFAULT true;

-- Null for leads that never asked (contact form, listing inquiry).
ALTER TABLE "leads" ADD COLUMN "contact_whatsapp" BOOLEAN;

-- Null for viewings not booked from chat.
ALTER TABLE "viewings" ADD COLUMN "conversation_id" UUID;

CREATE INDEX "viewings_conversation_id_idx" ON "viewings"("conversation_id");

ALTER TABLE "viewings" ADD CONSTRAINT "viewings_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
