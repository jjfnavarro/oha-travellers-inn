-- AlterTable
ALTER TABLE `Stay` ADD COLUMN `shiftId` INTEGER NULL;

-- CreateTable
CREATE TABLE `Shift` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('DAY', 'NIGHT') NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Shift_startsAt_key`(`startsAt`),
    INDEX `Shift_type_startsAt_idx`(`type`, `startsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Stay_shiftId_idx` ON `Stay`(`shiftId`);

-- AddForeignKey
ALTER TABLE `Stay` ADD CONSTRAINT `Stay_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `Shift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
