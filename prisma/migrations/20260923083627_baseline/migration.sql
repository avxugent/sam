-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NULL,
    `provider` VARCHAR(191) NOT NULL DEFAULT 'credentials',
    `role` ENUM('ADMIN', 'EDITOR', 'VIEWER') NOT NULL DEFAULT 'VIEWER',
    `totpSecret` VARCHAR(191) NULL,
    `totpEnabled` BOOLEAN NOT NULL DEFAULT false,
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    `twoFactorRequired` BOOLEAN NOT NULL DEFAULT false,
    `locationDefaultTab` VARCHAR(191) NOT NULL DEFAULT 'assets',
    `theme` VARCHAR(191) NOT NULL DEFAULT 'light',
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `passkeys` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `credentialId` VARCHAR(191) NOT NULL,
    `publicKey` TEXT NOT NULL,
    `counter` INTEGER NOT NULL DEFAULT 0,
    `transports` VARCHAR(191) NULL,
    `deviceType` VARCHAR(191) NOT NULL,
    `backedUp` BOOLEAN NOT NULL DEFAULT false,
    `label` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NULL,

    UNIQUE INDEX `passkeys_credentialId_key`(`credentialId`),
    INDEX `passkeys_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `locations` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `parentId` VARCHAR(191) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `fiNumber` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `coverImageId` VARCHAR(191) NULL,
    `inMaintenance` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `locations_fiNumber_key`(`fiNumber`),
    INDEX `locations_parentId_idx`(`parentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asset_types` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `scrapeTargetTemplate` TEXT NULL,
    `prometheusExposed` BOOLEAN NOT NULL DEFAULT true,
    `hostnamePattern` VARCHAR(500) NULL,
    `defaultCriticality` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `asset_types_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `manufacturers` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `manufacturers_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asset_type_manufacturer_templates` (
    `id` VARCHAR(191) NOT NULL,
    `typeId` VARCHAR(191) NOT NULL,
    `manufacturerId` VARCHAR(191) NOT NULL,
    `scrapeTargetTemplate` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `asset_type_manufacturer_templates_manufacturerId_idx`(`manufacturerId`),
    UNIQUE INDEX `asset_type_manufacturer_templates_typeId_manufacturerId_key`(`typeId`, `manufacturerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asset_type_model_templates` (
    `id` VARCHAR(191) NOT NULL,
    `typeId` VARCHAR(191) NOT NULL,
    `manufacturerId` VARCHAR(191) NOT NULL,
    `model` VARCHAR(255) NOT NULL,
    `scrapeTargetTemplate` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `asset_type_model_templates_manufacturerId_idx`(`manufacturerId`),
    UNIQUE INDEX `asset_type_model_templates_typeId_manufacturerId_model_key`(`typeId`, `manufacturerId`, `model`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `suppliers` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `contractReference` VARCHAR(255) NULL,
    `contactInfo` TEXT NULL,
    `defaultFrom` DATE NULL,
    `defaultUntil` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `suppliers_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assets` (
    `id` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `typeId` VARCHAR(191) NULL,
    `manufacturerId` VARCHAR(191) NULL,
    `model` VARCHAR(191) NULL,
    `serialNumber` VARCHAR(191) NULL,
    `hostname` VARCHAR(191) NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `installationDate` DATE NULL,
    `invoiceNumber` VARCHAR(191) NULL,
    `invoiceDate` DATE NULL,
    `warrantyMonths` INTEGER NULL,
    `notes` TEXT NULL,
    `vaultPath` VARCHAR(191) NULL,
    `ownerId` VARCHAR(191) NULL,
    `criticality` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NULL,
    `endOfSupportDate` DATE NULL,
    `supplierId` VARCHAR(191) NULL,
    `status` ENUM('INSTALLED', 'DECOMMISSIONED') NOT NULL DEFAULT 'INSTALLED',
    `decommissionedAt` DATETIME(3) NULL,
    `decommissionNote` VARCHAR(500) NULL,
    `disposalMethod` ENUM('WIPED', 'DESTROYED', 'RETURNED', 'RESOLD', 'OTHER') NULL,
    `decommissionedById` VARCHAR(191) NULL,
    `lastLocationName` VARCHAR(255) NULL,
    `lastLocationFiNumber` VARCHAR(20) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `assets_hostname_key`(`hostname`),
    INDEX `assets_locationId_idx`(`locationId`),
    INDEX `assets_typeId_idx`(`typeId`),
    INDEX `assets_manufacturerId_idx`(`manufacturerId`),
    INDEX `assets_installationDate_idx`(`installationDate`),
    INDEX `assets_supplierId_idx`(`supplierId`),
    INDEX `assets_endOfSupportDate_idx`(`endOfSupportDate`),
    INDEX `assets_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mac_addresses` (
    `id` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,

    INDEX `mac_addresses_assetId_idx`(`assetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `custom_fields` (
    `id` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,

    INDEX `custom_fields_assetId_idx`(`assetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attachments` (
    `id` VARCHAR(191) NOT NULL,
    `attachmentType` VARCHAR(191) NOT NULL DEFAULT 'file',
    `filename` VARCHAR(191) NULL,
    `originalName` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `mimeType` VARCHAR(191) NULL,
    `size` INTEGER NULL,
    `path` VARCHAR(191) NULL,
    `url` TEXT NULL,
    `locationId` VARCHAR(191) NULL,
    `assetId` VARCHAR(191) NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `attachments_locationId_idx`(`locationId`),
    INDEX `attachments_assetId_idx`(`assetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` VARCHAR(191) NULL,
    `userEmail` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `entityName` VARCHAR(191) NULL,
    `detail` TEXT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `forwardedAt` DATETIME(3) NULL,

    INDEX `audit_logs_timestamp_idx`(`timestamp`),
    INDEX `audit_logs_userId_idx`(`userId`),
    INDEX `audit_logs_entityType_idx`(`entityType`),
    INDEX `audit_logs_forwardedAt_idx`(`forwardedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_settings` (
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reports` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `definition` TEXT NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `work_logs` (
    `id` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NULL,
    `itemId` VARCHAR(191) NULL,
    `performedById` VARCHAR(191) NOT NULL,
    `performedAt` DATE NOT NULL,
    `description` TEXT NOT NULL,
    `jiraIssueKey` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `work_logs_locationId_idx`(`locationId`),
    INDEX `work_logs_assetId_idx`(`assetId`),
    INDEX `work_logs_itemId_idx`(`itemId`),
    INDEX `work_logs_performedById_idx`(`performedById`),
    INDEX `work_logs_performedAt_idx`(`performedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `work_log_items` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `work_log_items_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `maintenance_presets` (
    `id` VARCHAR(191) NOT NULL,
    `assetTypeId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `maintenance_presets_assetTypeId_idx`(`assetTypeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_items` (
    `id` VARCHAR(191) NOT NULL,
    `typeId` VARCHAR(191) NOT NULL,
    `manufacturerId` VARCHAR(191) NULL,
    `model` VARCHAR(255) NOT NULL,
    `serialNumber` VARCHAR(100) NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `notes` TEXT NULL,
    `locationId` VARCHAR(191) NULL,
    `reservedForLocationId` VARCHAR(191) NULL,
    `invoiceNumber` VARCHAR(100) NULL,
    `invoiceDate` DATE NULL,
    `metadata` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `stock_items_typeId_idx`(`typeId`),
    INDEX `stock_items_manufacturerId_idx`(`manufacturerId`),
    INDEX `stock_items_locationId_idx`(`locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `passkeys` ADD CONSTRAINT `passkeys_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `locations` ADD CONSTRAINT `locations_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `locations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_type_manufacturer_templates` ADD CONSTRAINT `asset_type_manufacturer_templates_typeId_fkey` FOREIGN KEY (`typeId`) REFERENCES `asset_types`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_type_manufacturer_templates` ADD CONSTRAINT `asset_type_manufacturer_templates_manufacturerId_fkey` FOREIGN KEY (`manufacturerId`) REFERENCES `manufacturers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_type_model_templates` ADD CONSTRAINT `asset_type_model_templates_typeId_fkey` FOREIGN KEY (`typeId`) REFERENCES `asset_types`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_type_model_templates` ADD CONSTRAINT `asset_type_model_templates_manufacturerId_fkey` FOREIGN KEY (`manufacturerId`) REFERENCES `manufacturers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `locations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_typeId_fkey` FOREIGN KEY (`typeId`) REFERENCES `asset_types`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_manufacturerId_fkey` FOREIGN KEY (`manufacturerId`) REFERENCES `manufacturers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mac_addresses` ADD CONSTRAINT `mac_addresses_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custom_fields` ADD CONSTRAINT `custom_fields_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `locations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `work_logs` ADD CONSTRAINT `work_logs_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `locations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `work_logs` ADD CONSTRAINT `work_logs_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `work_logs` ADD CONSTRAINT `work_logs_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `work_log_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `work_logs` ADD CONSTRAINT `work_logs_performedById_fkey` FOREIGN KEY (`performedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance_presets` ADD CONSTRAINT `maintenance_presets_assetTypeId_fkey` FOREIGN KEY (`assetTypeId`) REFERENCES `asset_types`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_items` ADD CONSTRAINT `stock_items_typeId_fkey` FOREIGN KEY (`typeId`) REFERENCES `asset_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_items` ADD CONSTRAINT `stock_items_manufacturerId_fkey` FOREIGN KEY (`manufacturerId`) REFERENCES `manufacturers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_items` ADD CONSTRAINT `stock_items_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `locations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

