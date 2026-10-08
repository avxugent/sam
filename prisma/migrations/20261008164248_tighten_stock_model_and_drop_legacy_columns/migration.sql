/*
  Warnings:

  - You are about to drop the column `model` on the `assets` table. All the data in the column will be lost.
  - You are about to drop the column `model` on the `stock_items` table. All the data in the column will be lost.
  - Made the column `modelId` on table `stock_items` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `stock_items` DROP FOREIGN KEY `stock_items_modelId_fkey`;

-- AlterTable
ALTER TABLE `assets` DROP COLUMN `model`;

-- AlterTable
ALTER TABLE `stock_items` DROP COLUMN `model`,
    MODIFY `modelId` VARCHAR(191) NOT NULL;

-- AddForeignKey
ALTER TABLE `stock_items` ADD CONSTRAINT `stock_items_modelId_fkey` FOREIGN KEY (`modelId`) REFERENCES `models`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
