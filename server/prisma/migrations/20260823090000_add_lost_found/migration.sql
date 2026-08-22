CREATE TABLE `LostFoundItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `itemName` VARCHAR(100) NOT NULL,
    `description` VARCHAR(1000) NULL,
    `roomId` INTEGER NOT NULL,
    `stayId` INTEGER NULL,
    `foundAt` DATETIME(3) NOT NULL,
    `recordedById` INTEGER NOT NULL,
    `status` ENUM('UNCLAIMED', 'CLAIMED', 'DISPOSED') NOT NULL DEFAULT 'UNCLAIMED',
    `notes` VARCHAR(1000) NULL,
    `claimedAt` DATETIME(3) NULL,
    `claimedByName` VARCHAR(100) NULL,
    `claimNotes` VARCHAR(1000) NULL,
    `claimProcessedById` INTEGER NULL,
    `disposedAt` DATETIME(3) NULL,
    `disposalNotes` VARCHAR(1000) NULL,
    `disposedById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LostFoundItem_status_foundAt_idx`(`status`, `foundAt`),
    INDEX `LostFoundItem_roomId_foundAt_idx`(`roomId`, `foundAt`),
    INDEX `LostFoundItem_stayId_idx`(`stayId`),
    INDEX `LostFoundItem_recordedById_createdAt_idx`(`recordedById`, `createdAt`),
    INDEX `LostFoundItem_claimProcessedById_idx`(`claimProcessedById`),
    INDEX `LostFoundItem_disposedById_idx`(`disposedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `LostFoundItem`
ADD CONSTRAINT `LostFoundItem_roomId_fkey`
FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`)
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `LostFoundItem`
ADD CONSTRAINT `LostFoundItem_stayId_fkey`
FOREIGN KEY (`stayId`) REFERENCES `Stay`(`id`)
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `LostFoundItem`
ADD CONSTRAINT `LostFoundItem_recordedById_fkey`
FOREIGN KEY (`recordedById`) REFERENCES `StaffAccount`(`id`)
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `LostFoundItem`
ADD CONSTRAINT `LostFoundItem_claimProcessedById_fkey`
FOREIGN KEY (`claimProcessedById`) REFERENCES `StaffAccount`(`id`)
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `LostFoundItem`
ADD CONSTRAINT `LostFoundItem_disposedById_fkey`
FOREIGN KEY (`disposedById`) REFERENCES `StaffAccount`(`id`)
ON DELETE RESTRICT ON UPDATE CASCADE;
