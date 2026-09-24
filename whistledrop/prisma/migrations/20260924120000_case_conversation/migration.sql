-- CreateEnum
CREATE TYPE "MessageAuthorType" AS ENUM ('REPORTER', 'MODERATOR');

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "awaitingReply" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CaseMessage" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "authorType" "MessageAuthorType" NOT NULL,
    "moderatorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalNote" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseMessage_reportId_createdAt_idx" ON "CaseMessage"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "CaseMessage_moderatorId_idx" ON "CaseMessage"("moderatorId");

-- CreateIndex
CREATE INDEX "InternalNote_reportId_createdAt_idx" ON "InternalNote"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "InternalNote_moderatorId_idx" ON "InternalNote"("moderatorId");

-- CreateIndex
CREATE INDEX "Report_awaitingReply_idx" ON "Report"("awaitingReply");

-- AddForeignKey
ALTER TABLE "CaseMessage" ADD CONSTRAINT "CaseMessage_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseMessage" ADD CONSTRAINT "CaseMessage_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "Moderator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "Moderator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A REPORTER message never names a moderator; a MODERATOR message always does.
ALTER TABLE "CaseMessage" ADD CONSTRAINT "CaseMessage_author_check"
  CHECK (("authorType" = 'MODERATOR') = ("moderatorId" IS NOT NULL));

-- Supabase exposes the `public` schema via the Data API. Enable RLS with no
-- policies so anon/authenticated roles cannot read or write the new tables.
-- Prisma connects as the table owner (postgres), which bypasses RLS.
ALTER TABLE "CaseMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InternalNote" ENABLE ROW LEVEL SECURITY;
