-- Spec 0020 (listing photo upload; spec 0001, *File storage*): uploaded photo
-- bytes keyed by their hash. No row level security block (prisma/AGENTS.md).

-- CreateTable
CREATE TABLE "photo_files" (
    "sha256" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_files_pkey" PRIMARY KEY ("sha256")
);

-- CreateIndex
CREATE INDEX "photo_files_created_by_idx" ON "photo_files"("created_by");

-- AddForeignKey
ALTER TABLE "photo_files" ADD CONSTRAINT "photo_files_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Check constraints live only here (prisma/AGENTS.md).
ALTER TABLE "photo_files" ADD CONSTRAINT "photo_files_sha256_ck" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "photo_files" ADD CONSTRAINT "photo_files_size_ck" CHECK ("width" BETWEEN 1 AND 2000 AND "height" BETWEEN 1 AND 2000 AND "byte_size" > 0);
