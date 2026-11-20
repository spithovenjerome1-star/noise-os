-- CreateEnum
CREATE TYPE "SheetSourceKind" AS ENUM ('BUSINESS_ACCOUNT', 'CLIENT_VIDEO_LOG', 'CLIENT_CONTENT_LIST', 'EDITING_LOG');

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "syncKey" TEXT,
ADD COLUMN     "syncSourceId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "syncKey" TEXT,
ADD COLUMN     "syncSourceId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "syncKey" TEXT,
ADD COLUMN     "syncSourceId" TEXT;

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "editorCostCents" INTEGER,
ADD COLUMN     "editorCurrency" TEXT,
ADD COLUMN     "editorName" TEXT,
ADD COLUMN     "syncKey" TEXT,
ADD COLUMN     "syncSourceId" TEXT;

-- CreateTable
CREATE TABLE "SheetSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spreadsheetId" TEXT NOT NULL,
    "kind" "SheetSourceKind" NOT NULL,
    "clientId" TEXT,
    "clientAliases" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMPTZ,
    "lastStatus" TEXT,
    "lastSummary" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "SheetSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetSyncRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ,
    "counts" JSONB,
    "issues" JSONB,
    "error" TEXT,

    CONSTRAINT "SheetSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SheetSource_spreadsheetId_kind_key" ON "SheetSource"("spreadsheetId", "kind");

-- CreateIndex
CREATE INDEX "SheetSyncRun_sourceId_startedAt_idx" ON "SheetSyncRun"("sourceId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_syncSourceId_syncKey_key" ON "Expense"("syncSourceId", "syncKey");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_syncSourceId_syncKey_key" ON "Invoice"("syncSourceId", "syncKey");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_syncSourceId_syncKey_key" ON "Payment"("syncSourceId", "syncKey");

-- CreateIndex
CREATE UNIQUE INDEX "Video_syncSourceId_syncKey_key" ON "Video"("syncSourceId", "syncKey");

-- AddForeignKey
ALTER TABLE "SheetSource" ADD CONSTRAINT "SheetSource_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetSyncRun" ADD CONSTRAINT "SheetSyncRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SheetSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
