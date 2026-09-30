-- Adds the IN_REPAIR asset status, repair tracking fields, and lineageId
-- (a stable identity carried across Asset <-> StockItem conversions so
-- AuditLog.lineageId can reconstruct one physical item's full history).
--
-- `lineageId` is required (NOT NULL) in the schema, but its default
-- (`cuid()`) is a Prisma client-side default, not a MySQL server-side one —
-- `prisma migrate dev`/`db push` cannot add it as NOT NULL to a table that
-- already has rows in one step. This hand-edits the auto-generated diff into
-- a safe expand/contract migration: add nullable, backfill every existing
-- row with a distinct id, then tighten to NOT NULL. Safe to run against a
-- table with any number of existing rows, including zero.

-- AlterTable
ALTER TABLE `assets`
    ADD COLUMN `lineageId` VARCHAR(191) NULL,
    ADD COLUMN `repairNote` VARCHAR(500) NULL,
    ADD COLUMN `repairStartedAt` DATETIME(3) NULL,
    ADD COLUMN `sentForRepairById` VARCHAR(191) NULL,
    MODIFY `status` ENUM('INSTALLED', 'IN_REPAIR', 'DECOMMISSIONED') NOT NULL DEFAULT 'INSTALLED';

-- AlterTable
ALTER TABLE `audit_logs` ADD COLUMN `lineageId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `stock_items` ADD COLUMN `lineageId` VARCHAR(191) NULL;

-- Backfill: every pre-existing row gets its own distinct lineage id (opaque
-- grouping key — see Asset.lineageId in schema.prisma). Rows created after
-- this migration get one from Prisma's client-side cuid() default instead.
UPDATE `assets` SET `lineageId` = UUID() WHERE `lineageId` IS NULL;
UPDATE `stock_items` SET `lineageId` = UUID() WHERE `lineageId` IS NULL;

-- AlterTable: now safe to tighten — no NULLs remain
ALTER TABLE `assets` MODIFY `lineageId` VARCHAR(191) NOT NULL;
ALTER TABLE `stock_items` MODIFY `lineageId` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `assets_lineageId_idx` ON `assets`(`lineageId`);

-- CreateIndex
CREATE INDEX `audit_logs_lineageId_idx` ON `audit_logs`(`lineageId`);

-- CreateIndex
CREATE INDEX `stock_items_lineageId_idx` ON `stock_items`(`lineageId`);
