CREATE TABLE `RoomRateOverride` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `roomId` INTEGER NOT NULL,
    `durationHours` INTEGER NOT NULL,
    `amountCentavos` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RoomRateOverride_roomId_idx`(`roomId`),
    UNIQUE INDEX `RoomRateOverride_roomId_durationHours_key`(`roomId`, `durationHours`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `RoomRateOverride`
ADD CONSTRAINT `RoomRateOverride_roomId_fkey`
FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`)
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO `RoomRateOverride` (`roomId`, `durationHours`, `amountCentavos`, `updatedAt`)
SELECT `id`, 3, 30000, CURRENT_TIMESTAMP(3)
FROM `Room`
WHERE `number` IN ('7', '8', 'A', 'B', 'C');

INSERT INTO `RoomRateOverride` (`roomId`, `durationHours`, `amountCentavos`, `updatedAt`)
SELECT `id`, 3, 35000, CURRENT_TIMESTAMP(3)
FROM `Room`
WHERE `number` IN ('9', '10');
