-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('VISITOR', 'AGENT', 'SELLER');

-- CreateEnum
CREATE TYPE "deal_type" AS ENUM ('SALE');

-- CreateEnum
CREATE TYPE "property_type" AS ENUM ('APARTMENT', 'DUPLEX', 'VILLA', 'HOUSE', 'PLOT', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "listing_status" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'REJECTED', 'PUBLISHED', 'UNPUBLISHED', 'SOLD');

-- CreateEnum
CREATE TYPE "completion_status" AS ENUM ('READY', 'UNDER_CONSTRUCTION');

-- CreateEnum
CREATE TYPE "message_role" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "lead_source" AS ENUM ('CHAT_BOOKING', 'CONTACT_FORM', 'LISTING_INQUIRY');

-- CreateEnum
CREATE TYPE "lead_status" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "viewing_status" AS ENUM ('REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "lead_activity_type" AS ENUM ('NOTE', 'STATUS_CHANGE', 'VIEWING_CHANGE', 'SYSTEM');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'VISITOR',
    "email" TEXT,
    "full_name" TEXT,
    "phone" TEXT,
    "avatar_url" TEXT,
    "agent_title" TEXT,
    "agent_whatsapp" TEXT,
    "agent_bio" TEXT,
    "agent_photo_url" TEXT,
    "agent_is_public" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "areas" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_bn" TEXT NOT NULL,
    "center_lat" DOUBLE PRECISION NOT NULL,
    "center_lng" DOUBLE PRECISION NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amenities" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "label_bn" TEXT,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "amenities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "ref_code" TEXT NOT NULL,
    "deal_type" "deal_type" NOT NULL DEFAULT 'SALE',
    "property_type" "property_type" NOT NULL,
    "status" "listing_status" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price_bdt" BIGINT NOT NULL,
    "price_negotiable" BOOLEAN NOT NULL DEFAULT false,
    "area_id" UUID NOT NULL,
    "address_line" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "built_up_sqft" INTEGER,
    "land_katha" DECIMAL(7,2),
    "floor_number" INTEGER,
    "total_floors" INTEGER,
    "parking_spaces" INTEGER,
    "completion_status" "completion_status",
    "handover_date" DATE,
    "created_by_id" UUID NOT NULL,
    "assigned_agent_id" UUID,
    "published_at" TIMESTAMPTZ(3),
    "sold_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_amenities" (
    "listing_id" UUID NOT NULL,
    "amenity_id" UUID NOT NULL,

    CONSTRAINT "listing_amenities_pkey" PRIMARY KEY ("listing_id","amenity_id")
);

-- CreateTable
CREATE TABLE "listing_photos" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "url" TEXT,
    "storage_path" TEXT,
    "sort_order" INTEGER NOT NULL,
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "alt" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT,
    "start_listing_id" UUID,
    "last_message_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "message_role" NOT NULL,
    "parts" JSONB NOT NULL,
    "text_content" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_briefs" (
    "conversation_id" UUID NOT NULL,
    "budget_min_bdt" BIGINT,
    "budget_max_bdt" BIGINT,
    "property_types" "property_type"[] DEFAULT ARRAY[]::"property_type"[],
    "area_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "amenity_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "min_bedrooms" INTEGER,
    "min_bathrooms" INTEGER,
    "family_size" INTEGER,
    "notes" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_briefs_pkey" PRIMARY KEY ("conversation_id")
);

-- CreateTable
CREATE TABLE "listing_recommendations" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "message_id" TEXT NOT NULL,
    "listing_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "source" "lead_source" NOT NULL,
    "status" "lead_status" NOT NULL DEFAULT 'NEW',
    "visitor_id" UUID,
    "listing_id" UUID,
    "conversation_id" UUID,
    "assigned_agent_id" UUID,
    "contact_name" TEXT NOT NULL,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "message" TEXT,
    "contacted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "viewings" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "requested_for" TIMESTAMPTZ(3) NOT NULL,
    "confirmed_for" TIMESTAMPTZ(3),
    "status" "viewing_status" NOT NULL DEFAULT 'REQUESTED',
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "viewings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "actor_id" UUID,
    "type" "lead_activity_type" NOT NULL,
    "body" TEXT,
    "from_status" TEXT,
    "to_status" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_daily" (
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_usage_daily_pkey" PRIMARY KEY ("user_id","day")
);

-- CreateIndex
CREATE UNIQUE INDEX "areas_slug_key" ON "areas"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "amenities_slug_key" ON "amenities"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "listings_slug_key" ON "listings"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "listings_ref_code_key" ON "listings"("ref_code");

-- CreateIndex
CREATE INDEX "listings_status_published_at_id_idx" ON "listings"("status", "published_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "listings_status_area_id_price_bdt_idx" ON "listings"("status", "area_id", "price_bdt");

-- CreateIndex
CREATE INDEX "listings_status_property_type_bedrooms_idx" ON "listings"("status", "property_type", "bedrooms");

-- CreateIndex
CREATE INDEX "listings_assigned_agent_id_status_idx" ON "listings"("assigned_agent_id", "status");

-- CreateIndex
CREATE INDEX "listings_created_by_id_idx" ON "listings"("created_by_id");

-- CreateIndex
CREATE INDEX "listings_area_id_idx" ON "listings"("area_id");

-- CreateIndex
CREATE INDEX "listing_amenities_amenity_id_idx" ON "listing_amenities"("amenity_id");

-- CreateIndex
CREATE INDEX "listing_photos_listing_id_sort_order_idx" ON "listing_photos"("listing_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "listing_photos_one_cover_uq" ON "listing_photos"("listing_id") WHERE (is_cover);

-- CreateIndex
CREATE INDEX "conversations_user_id_last_message_at_idx" ON "conversations"("user_id", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "conversations_start_listing_id_idx" ON "conversations"("start_listing_id");

-- CreateIndex
CREATE INDEX "chat_messages_conversation_id_seq_idx" ON "chat_messages"("conversation_id", "seq");

-- CreateIndex
CREATE INDEX "listing_recommendations_conversation_id_idx" ON "listing_recommendations"("conversation_id");

-- CreateIndex
CREATE INDEX "listing_recommendations_listing_id_idx" ON "listing_recommendations"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "listing_recommendations_message_id_listing_id_key" ON "listing_recommendations"("message_id", "listing_id");

-- CreateIndex
CREATE INDEX "leads_assigned_agent_id_status_created_at_idx" ON "leads"("assigned_agent_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "leads_visitor_id_idx" ON "leads"("visitor_id");

-- CreateIndex
CREATE INDEX "leads_listing_id_idx" ON "leads"("listing_id");

-- CreateIndex
CREATE INDEX "leads_conversation_id_idx" ON "leads"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "leads_open_per_visitor_listing_uq" ON "leads"("visitor_id", "listing_id") WHERE (status = ANY (ARRAY['NEW'::lead_status, 'CONTACTED'::lead_status, 'QUALIFIED'::lead_status])) AND (visitor_id IS NOT NULL) AND (listing_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "viewings_lead_id_requested_for_idx" ON "viewings"("lead_id", "requested_for");

-- CreateIndex
CREATE UNIQUE INDEX "viewings_active_per_lead_uq" ON "viewings"("lead_id") WHERE (status = ANY (ARRAY['REQUESTED'::viewing_status, 'CONFIRMED'::viewing_status]));

-- CreateIndex
CREATE INDEX "lead_activities_lead_id_created_at_idx" ON "lead_activities"("lead_id", "created_at");

-- CreateIndex
CREATE INDEX "lead_activities_actor_id_idx" ON "lead_activities"("actor_id");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_amenities" ADD CONSTRAINT "listing_amenities_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_amenities" ADD CONSTRAINT "listing_amenities_amenity_id_fkey" FOREIGN KEY ("amenity_id") REFERENCES "amenities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_photos" ADD CONSTRAINT "listing_photos_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_start_listing_id_fkey" FOREIGN KEY ("start_listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_briefs" ADD CONSTRAINT "search_briefs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_recommendations" ADD CONSTRAINT "listing_recommendations_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_recommendations" ADD CONSTRAINT "listing_recommendations_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_recommendations" ADD CONSTRAINT "listing_recommendations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viewings" ADD CONSTRAINT "viewings_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_daily" ADD CONSTRAINT "ai_usage_daily_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Raw SQL appended by hand (spec 0002). schema.prisma cannot express these, so
-- read this block before changing the schema. Constraint names are matched by
-- error handling: keep them stable.
-- ---------------------------------------------------------------------------

-- Listing reference numbers: AUR-1001, AUR-1002, ... (read by nextListingRef).
CREATE SEQUENCE listing_ref_seq START WITH 1001;

-- chat_messages.seq is the send order. Identity instead of a serial default, so
-- the app can never write it.
ALTER TABLE chat_messages ALTER COLUMN seq DROP DEFAULT;
DROP SEQUENCE chat_messages_seq_seq;
ALTER TABLE chat_messages ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY;

-- listings
ALTER TABLE listings
  ADD CONSTRAINT listings_ref_code_format_ck CHECK (ref_code ~ '^AUR-[0-9]{4,}$'),
  ADD CONSTRAINT listings_price_positive_ck CHECK (price_bdt > 0),
  ADD CONSTRAINT listings_bedrooms_ck CHECK (bedrooms IS NULL OR bedrooms >= 0),
  ADD CONSTRAINT listings_bathrooms_ck CHECK (bathrooms IS NULL OR bathrooms >= 0),
  ADD CONSTRAINT listings_built_up_sqft_ck CHECK (built_up_sqft IS NULL OR built_up_sqft > 0),
  ADD CONSTRAINT listings_land_katha_ck CHECK (land_katha IS NULL OR land_katha > 0),
  ADD CONSTRAINT listings_published_complete_ck CHECK (
    status <> 'PUBLISHED'
    OR (latitude IS NOT NULL AND longitude IS NOT NULL AND published_at IS NOT NULL AND assigned_agent_id IS NOT NULL)
  );

-- listing_photos
ALTER TABLE listing_photos
  ADD CONSTRAINT listing_photos_one_source_ck CHECK (num_nonnulls(url, storage_path) = 1);

-- search_briefs
ALTER TABLE search_briefs
  ADD CONSTRAINT search_briefs_budget_range_ck CHECK (
    budget_min_bdt IS NULL OR budget_max_bdt IS NULL OR budget_min_bdt <= budget_max_bdt
  );

-- leads
ALTER TABLE leads
  ADD CONSTRAINT leads_contact_ck CHECK (contact_phone IS NOT NULL OR contact_email IS NOT NULL);

-- viewings
ALTER TABLE viewings
  ADD CONSTRAINT viewings_confirmed_time_ck CHECK (status <> 'CONFIRMED' OR confirmed_for IS NOT NULL);

-- Row level security on, no policies: the public API gets nothing (spec 0001).
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE viewings ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_daily ENABLE ROW LEVEL SECURITY;

-- Revoke the Supabase API roles. Guarded, because the roles do not exist on a
-- plain Postgres (shadow database, CI, Neon).
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE profiles, areas, amenities, listings, listing_amenities, listing_photos, '
        'conversations, chat_messages, search_briefs, listing_recommendations, leads, viewings, '
        'lead_activities, ai_usage_daily FROM %I', r);
      EXECUTE format('REVOKE ALL ON SEQUENCE listing_ref_seq FROM %I', r);
    END IF;
  END LOOP;
END
$$;
