-- Add CARD without changing existing payment values.
ALTER TABLE `StayExtension`
    MODIFY `paymentMethod` ENUM('CASH', 'GCASH', 'CARD', 'UNKNOWN') NOT NULL;

ALTER TABLE `FinancialTransaction`
    MODIFY `paymentMethod` ENUM('CASH', 'GCASH', 'CARD', 'UNKNOWN') NOT NULL,
    MODIFY `transactionType` ENUM(
        'ROOM_CHARGE',
        'EXTENSION_CHARGE',
        'STORE_SALE',
        'EXTRA_CHARGE',
        'EXPENSE',
        'EXPENSE_REVERSAL'
    ) NOT NULL,
    ADD COLUMN `expenseId` INTEGER NULL;

ALTER TABLE `StoreSale`
    MODIFY `paymentMethod` ENUM('CASH', 'GCASH', 'CARD', 'UNKNOWN') NOT NULL;

-- Preserve the selected Days option and its effective 24-hour unit rate.
ALTER TABLE `Stay`
    ADD COLUMN `rateAmountCentavos` INTEGER NULL,
    ADD COLUMN `numberOfDays` INTEGER NULL;

UPDATE `Stay`
SET `rateAmountCentavos` = `paidAmountCentavos`
WHERE `rateAmountCentavos` IS NULL;

ALTER TABLE `Booking`
    ADD COLUMN `numberOfDays` INTEGER NULL;

-- Expense is the business record; FinancialTransaction remains the money ledger.
CREATE TABLE `Expense` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `amountCentavos` INTEGER NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `status` ENUM('ACTIVE', 'VOIDED') NOT NULL DEFAULT 'ACTIVE',
    `idempotencyKey` CHAR(36) NOT NULL,
    `businessDate` DATE NOT NULL,
    `shiftId` INTEGER NOT NULL,
    `recordedById` INTEGER NOT NULL,
    `voidedById` INTEGER NULL,
    `voidReason` VARCHAR(500) NULL,
    `voidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Expense_idempotencyKey_key`(`idempotencyKey`),
    INDEX `Expense_businessDate_status_idx`(`businessDate`, `status`),
    INDEX `Expense_shiftId_createdAt_idx`(`shiftId`, `createdAt`),
    INDEX `Expense_recordedById_createdAt_idx`(`recordedById`, `createdAt`),
    INDEX `Expense_voidedById_idx`(`voidedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `FinancialTransaction_expenseId_createdAt_idx`
ON `FinancialTransaction`(`expenseId`, `createdAt`);

ALTER TABLE `Expense`
ADD CONSTRAINT `Expense_shiftId_fkey`
FOREIGN KEY (`shiftId`) REFERENCES `Shift`(`id`)
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Expense`
ADD CONSTRAINT `Expense_recordedById_fkey`
FOREIGN KEY (`recordedById`) REFERENCES `StaffAccount`(`id`)
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Expense`
ADD CONSTRAINT `Expense_voidedById_fkey`
FOREIGN KEY (`voidedById`) REFERENCES `StaffAccount`(`id`)
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `FinancialTransaction`
ADD CONSTRAINT `FinancialTransaction_expenseId_fkey`
FOREIGN KEY (`expenseId`) REFERENCES `Expense`(`id`)
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add the new canonical type and only the newly approved default rates.
INSERT INTO `RoomType` (`name`, `description`, `createdAt`, `updatedAt`)
SELECT 'TRANSIENT', 'Transient room', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (
    SELECT 1 FROM `RoomType` WHERE UPPER(`name`) = 'TRANSIENT'
);

INSERT INTO `StayRate` (`roomTypeId`, `durationHours`, `amountCentavos`, `createdAt`, `updatedAt`)
SELECT `id`, 12, 180000, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `RoomType`
WHERE UPPER(`name`) = 'TRANSIENT'
  AND NOT EXISTS (
      SELECT 1 FROM `StayRate`
      WHERE `roomTypeId` = `RoomType`.`id` AND `durationHours` = 12
  );

INSERT INTO `StayRate` (`roomTypeId`, `durationHours`, `amountCentavos`, `createdAt`, `updatedAt`)
SELECT `id`, 24, 250000, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `RoomType`
WHERE UPPER(`name`) = 'TRANSIENT'
  AND NOT EXISTS (
      SELECT 1 FROM `StayRate`
      WHERE `roomTypeId` = `RoomType`.`id` AND `durationHours` = 24
  );

INSERT INTO `StayRate` (`roomTypeId`, `durationHours`, `amountCentavos`, `createdAt`, `updatedAt`)
SELECT `id`, 12, 180000, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `RoomType`
WHERE UPPER(`name`) = 'FAMILY'
  AND NOT EXISTS (
      SELECT 1 FROM `StayRate`
      WHERE `roomTypeId` = `RoomType`.`id` AND `durationHours` = 12
  );
