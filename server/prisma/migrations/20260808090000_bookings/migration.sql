-- CreateTable
CREATE TABLE `Booking` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bookingDate` DATE NOT NULL,
    `estimatedArrivalAt` DATETIME(3) NULL,
    `roomId` INTEGER NULL,
    `expectedDurationHours` INTEGER NOT NULL,
    `guestName` VARCHAR(100) NULL,
    `contactNumber` VARCHAR(30) NULL,
    `arrivalType` ENUM('VEHICLE', 'WALK_IN') NULL,
    `plateNumber` VARCHAR(30) NULL,
    `bookingReference` VARCHAR(50) NULL,
    `notes` VARCHAR(500) NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'ARRIVED', 'COMPLETED', 'CANCELLED', 'NO_SHOW') NOT NULL DEFAULT 'PENDING',
    `convertedStayId` INTEGER NULL,
    `createdByUserId` INTEGER NOT NULL,
    `updatedByUserId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Booking_bookingReference_key`(`bookingReference`),
    UNIQUE INDEX `Booking_convertedStayId_key`(`convertedStayId`),
    INDEX `Booking_bookingDate_status_idx`(`bookingDate`, `status`),
    INDEX `Booking_roomId_estimatedArrivalAt_idx`(`roomId`, `estimatedArrivalAt`),
    INDEX `Booking_createdByUserId_createdAt_idx`(`createdByUserId`, `createdAt`),
    INDEX `Booking_updatedByUserId_idx`(`updatedByUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_convertedStayId_fkey` FOREIGN KEY (`convertedStayId`) REFERENCES `Stay`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `StaffAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_updatedByUserId_fkey` FOREIGN KEY (`updatedByUserId`) REFERENCES `StaffAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
