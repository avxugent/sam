-- Adds the `models` lookup table (replaces the free-text Asset.model /
-- StockItem.model columns) and backfills Asset.modelId / StockItem.modelId
-- from the existing string data.
--
-- This is step 1 of 2 (expand). The old `model` string columns are
-- deliberately NOT dropped here — they survive as a safety net until a
-- later, separate migration (after a production verification window)
-- drops them and tightens StockItem.modelId to NOT NULL. See
-- doc/sam/technical/database.md.
--
-- The backfill below collapses pure case-variant spellings for free (the
-- default collation on `model` is case-insensitive), but intentionally
-- leaves punctuation/spacing variants (e.g. "R-740" vs "R740") as separate
-- `models` rows — resolving those is what the new /admin/models merge
-- feature is for, not this migration.

-- CreateTable
CREATE TABLE `models` (
    `id` VARCHAR(191) NOT NULL,
    `typeId` VARCHAR(191) NOT NULL,
    `manufacturerId` VARCHAR(191) NULL,
    `name` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `models_typeId_idx`(`typeId`),
    INDEX `models_manufacturerId_idx`(`manufacturerId`),
    UNIQUE INDEX `models_typeId_manufacturerId_name_key`(`typeId`, `manufacturerId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `models` ADD CONSTRAINT `models_typeId_fkey` FOREIGN KEY (`typeId`) REFERENCES `asset_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `models` ADD CONSTRAINT `models_manufacturerId_fkey` FOREIGN KEY (`manufacturerId`) REFERENCES `manufacturers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: new FK columns, nullable. assets.modelId stays nullable
-- permanently (mirrors assets.typeId/manufacturerId); stock_items.modelId is
-- tightened to NOT NULL in the follow-up migration, once the backfill below
-- is verified clean in production. The old `model` columns are untouched.
ALTER TABLE `assets` ADD COLUMN `modelId` VARCHAR(191) NULL;
ALTER TABLE `stock_items` ADD COLUMN `modelId` VARCHAR(191) NULL;

-- Backfill `models`: one row per distinct (typeId, manufacturerId, trimmed
-- model) seen across both tables. ANY_VALUE() is required for MySQL 8's
-- default ONLY_FULL_GROUP_BY mode (same technique lib/model-clusters.ts
-- already uses for its own GROUP BY query).
INSERT INTO `models` (`id`, `typeId`, `manufacturerId`, `name`, `createdAt`)
SELECT UUID(), typeId, manufacturerId, ANY_VALUE(TRIM(model)), NOW(3)
FROM (
  SELECT typeId, manufacturerId, model FROM assets
  WHERE typeId IS NOT NULL AND model IS NOT NULL AND TRIM(model) <> ''
  UNION ALL
  SELECT typeId, manufacturerId, model FROM stock_items
  WHERE typeId IS NOT NULL AND model IS NOT NULL AND TRIM(model) <> ''
) AS all_models
GROUP BY typeId, manufacturerId, TRIM(model);

-- Backfill modelId on both tables. `<=>` (NULL-safe equality) is required,
-- not plain `=` — `a.manufacturerId = m.manufacturerId` evaluates to NULL
-- (not TRUE) when both sides are NULL, which would silently leave every
-- manufacturer-less row unmatched.
UPDATE `assets` a
JOIN `models` m
  ON a.typeId = m.typeId
  AND a.manufacturerId <=> m.manufacturerId
  AND TRIM(a.model) = m.name
SET a.modelId = m.id
WHERE a.typeId IS NOT NULL AND a.model IS NOT NULL AND TRIM(a.model) <> '';

UPDATE `stock_items` si
JOIN `models` m
  ON si.typeId = m.typeId
  AND si.manufacturerId <=> m.manufacturerId
  AND TRIM(si.model) = m.name
SET si.modelId = m.id
WHERE si.typeId IS NOT NULL AND si.model IS NOT NULL AND TRIM(si.model) <> '';

-- CreateIndex
CREATE INDEX `assets_modelId_idx` ON `assets`(`modelId`);

-- CreateIndex
CREATE INDEX `stock_items_modelId_idx` ON `stock_items`(`modelId`);

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_modelId_fkey` FOREIGN KEY (`modelId`) REFERENCES `models`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_items` ADD CONSTRAINT `stock_items_modelId_fkey` FOREIGN KEY (`modelId`) REFERENCES `models`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
