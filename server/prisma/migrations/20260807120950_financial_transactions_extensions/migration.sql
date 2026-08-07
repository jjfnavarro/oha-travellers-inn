-- DropForeignKey
ALTER TABLE `AuditLog` DROP FOREIGN KEY `AuditLog_staffId_fkey`;

-- DropForeignKey
ALTER TABLE `Stay` DROP FOREIGN KEY `Stay_checkedInById_fkey`;

-- DropForeignKey
ALTER TABLE `Stay` DROP FOREIGN KEY `Stay_checkedOutById_fkey`;

-- CreateTable
CREATE TABLE `StayExtension` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stayId` INTEGER NOT NULL,
    `createdById` INTEGER NOT NULL,
    `durationHours` INTEGER NOT NULL,
    `amountCentavos` INTEGER NOT NULL,
    `paymentMethod` ENUM('CASH', 'GCASH', 'UNKNOWN') NOT NULL,
    `previousExpectedCheckoutAt` DATETIME(3) NOT NULL,
    `extendedExpectedCheckoutAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StayExtension_stayId_createdAt_idx`(`stayId`, `createdAt`),
    INDEX `StayExtension_createdById_createdAt_idx`(`createdById`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancialTransaction` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stayId` INTEGER NULL,
    `handledById` INTEGER NULL,
    `transactionType` ENUM('ROOM_CHARGE', 'EXTENSION_CHARGE') NOT NULL,
    `amountCentavos` INTEGER NOT NULL,
    `paymentMethod` ENUM('CASH', 'GCASH', 'UNKNOWN') NOT NULL,
    `note` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FinancialTransaction_stayId_createdAt_idx`(`stayId`, `createdAt`),
    INDEX `FinancialTransaction_handledById_createdAt_idx`(`handledById`, `createdAt`),
    INDEX `FinancialTransaction_transactionType_createdAt_idx`(`transactionType`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Stay` ADD CONSTRAINT `Stay_checkedInById_fkey` FOREIGN KEY (`checkedInById`) REFERENCES `StaffAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Stay` ADD CONSTRAINT `Stay_checkedOutById_fkey` FOREIGN KEY (`checkedOutById`) REFERENCES `StaffAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `StaffAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StayExtension` ADD CONSTRAINT `StayExtension_stayId_fkey` FOREIGN KEY (`stayId`) REFERENCES `Stay`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StayExtension` ADD CONSTRAINT `StayExtension_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `StaffAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancialTransaction` ADD CONSTRAINT `FinancialTransaction_stayId_fkey` FOREIGN KEY (`stayId`) REFERENCES `Stay`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancialTransaction` ADD CONSTRAINT `FinancialTransaction_handledById_fkey` FOREIGN KEY (`handledById`) REFERENCES `StaffAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
