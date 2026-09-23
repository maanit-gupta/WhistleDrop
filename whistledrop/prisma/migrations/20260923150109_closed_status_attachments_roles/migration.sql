-- CreateEnum
CREATE TYPE "NoteVisibility" AS ENUM ('PUBLIC', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ModeratorRole" AS ENUM ('ADMIN', 'MODERATOR');

-- AlterEnum
ALTER TYPE "ReportStatus" ADD VALUE 'CLOSED';

-- AlterTable
ALTER TABLE "Moderator" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "role" "ModeratorRole" NOT NULL DEFAULT 'MODERATOR';

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "closedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StatusUpdate" ADD COLUMN     "moderatorId" TEXT,
ADD COLUMN     "visibility" "NoteVisibility" NOT NULL DEFAULT 'PUBLIC';

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumedUploadToken" (
    "jti" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumedUploadToken_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storagePath_key" ON "Attachment"("storagePath");

-- CreateIndex
CREATE INDEX "Attachment_reportId_idx" ON "Attachment"("reportId");

-- CreateIndex
CREATE INDEX "StatusUpdate_moderatorId_idx" ON "StatusUpdate"("moderatorId");

-- AddForeignKey
ALTER TABLE "StatusUpdate" ADD CONSTRAINT "StatusUpdate_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "Moderator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data migration: every moderator that exists before roles are introduced is
-- the seeded bootstrap account, which becomes the first ADMIN. Accounts created
-- afterwards default to MODERATOR.
UPDATE "Moderator" SET "role" = 'ADMIN';

-- Supabase exposes the `public` schema via the Data API. Enable RLS with no
-- policies so anon/authenticated roles cannot read or write the new tables.
-- Prisma connects as the table owner (postgres), which bypasses RLS.
ALTER TABLE "Attachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsumedUploadToken" ENABLE ROW LEVEL SECURITY;
