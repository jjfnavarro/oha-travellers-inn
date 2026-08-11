-- AlterTable
ALTER TABLE `FinancialTransaction`
    MODIFY `transactionType` ENUM('ROOM_CHARGE', 'EXTENSION_CHARGE', 'STORE_SALE', 'EXTRA_CHARGE') NOT NULL,
    ADD COLUMN `storeSaleId` INTEGER NULL;

-- CreateTable
CREATE TABLE `Product` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `category` ENUM('STORE_PRODUCT', 'EXTRA_CHARGE') NOT NULL,
    `sellingPriceCentavos` INTEGER NOT NULL,
    `imageUrl` VARCHAR(2048) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdByUserId` INTEGER NOT NULL,
    `updatedByUserId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Product_name_key`(`name`),
    INDEX `Product_category_isActive_idx`(`category`, `isActive`),
    INDEX `Product_createdByUserId_idx`(`createdByUserId`),
    INDEX `Product_updatedByUserId_idx`(`updatedByUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StoreSale` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `handledByUserId` INTEGER NOT NULL,
    `stayId` INTEGER NULL,
    `paymentMethod` ENUM('CASH', 'GCASH', 'UNKNOWN') NOT NULL,
    `totalAmountCentavos` INTEGER NOT NULL,
    `idempotencyKey` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StoreSale_idempotencyKey_key`(`idempotencyKey`),
    INDEX `StoreSale_handledByUserId_createdAt_idx`(`handledByUserId`, `createdAt`),
    INDEX `StoreSale_stayId_createdAt_idx`(`stayId`, `createdAt`),
    INDEX `StoreSale_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StoreSaleItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `storeSaleId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `productNameSnapshot` VARCHAR(100) NOT NULL,
    `categorySnapshot` ENUM('STORE_PRODUCT', 'EXTRA_CHARGE') NOT NULL,
    `unitPriceCentavos` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `lineTotalCentavos` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StoreSaleItem_storeSaleId_idx`(`storeSaleId`),
    INDEX `StoreSaleItem_productId_createdAt_idx`(`productId`, `createdAt`),
    INDEX `StoreSaleItem_categorySnapshot_createdAt_idx`(`categorySnapshot`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `FinancialTransaction_storeSaleId_createdAt_idx` ON `FinancialTransaction`(`storeSaleId`, `createdAt`);

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `StaffAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_updatedByUserId_fkey` FOREIGN KEY (`updatedByUserId`) REFERENCES `StaffAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StoreSale` ADD CONSTRAINT `StoreSale_handledByUserId_fkey` FOREIGN KEY (`handledByUserId`) REFERENCES `StaffAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StoreSale` ADD CONSTRAINT `StoreSale_stayId_fkey` FOREIGN KEY (`stayId`) REFERENCES `Stay`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StoreSaleItem` ADD CONSTRAINT `StoreSaleItem_storeSaleId_fkey` FOREIGN KEY (`storeSaleId`) REFERENCES `StoreSale`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StoreSaleItem` ADD CONSTRAINT `StoreSaleItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancialTransaction` ADD CONSTRAINT `FinancialTransaction_storeSaleId_fkey` FOREIGN KEY (`storeSaleId`) REFERENCES `StoreSale`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
