-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('SECURITY', 'HARASSMENT', 'CORRUPTION', 'TECHNICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "caseCode" TEXT NOT NULL,
    "category" "ReportCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusUpdate" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "note" TEXT,
    "newStatus" "ReportStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Moderator" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Moderator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Report_caseCode_key" ON "Report"("caseCode");

-- CreateIndex
CREATE INDEX "StatusUpdate_reportId_idx" ON "StatusUpdate"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "Moderator_email_key" ON "Moderator"("email");

-- AddForeignKey
ALTER TABLE "StatusUpdate" ADD CONSTRAINT "StatusUpdate_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Supabase exposes the `public` schema via the Data API. Enable RLS with no
-- policies so anon/authenticated roles cannot read or write these tables.
-- Prisma connects as the table owner (postgres), which bypasses RLS.
ALTER TABLE "Report" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StatusUpdate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Moderator" ENABLE ROW LEVEL SECURITY;
