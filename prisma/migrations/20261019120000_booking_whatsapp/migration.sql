-- Viewing booking from chat (spec 0007, data model): the WhatsApp tick on the
-- profile (prefilled on the booking card) and on the lead's contact copy.
-- Additive only: a defaulted column and a nullable one.

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "contact_whatsapp" BOOLEAN;

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "phone_is_whatsapp" BOOLEAN NOT NULL DEFAULT true;
