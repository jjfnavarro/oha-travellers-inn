-- CreateTable
CREATE TABLE `Stay` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `roomId` INTEGER NOT NULL,
    `activeRoomId` INTEGER NULL,
    `status` ENUM('ACTIVE', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `arrivalType` ENUM('VEHICLE', 'WALK_IN') NOT NULL,
    `guestName` VARCHAR(100) NULL,
    `plateNumber` VARCHAR(30) NULL,
    `notes` VARCHAR(500) NULL,
    `durationHours` INTEGER NOT NULL,
    `paidAmountCentavos` INTEGER NOT NULL,
    `checkedInAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expectedCheckoutAt` DATETIME(3) NOT NULL,
    `checkedOutAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Stay_activeRoomId_key`(`activeRoomId`),
    INDEX `Stay_roomId_idx`(`roomId`),
    INDEX `Stay_status_expectedCheckoutAt_idx`(`status`, `expectedCheckoutAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Stay` ADD CONSTRAINT `Stay_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
