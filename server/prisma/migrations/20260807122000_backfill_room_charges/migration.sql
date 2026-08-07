-- Preserve pre-ledger stay payments without inventing a staff member or payment method.
INSERT INTO `FinancialTransaction` (
    `stayId`,
    `handledById`,
    `transactionType`,
    `amountCentavos`,
    `paymentMethod`,
    `note`,
    `createdAt`
)
SELECT
    `Stay`.`id`,
    `Stay`.`checkedInById`,
    'ROOM_CHARGE',
    `Stay`.`paidAmountCentavos`,
    'UNKNOWN',
    'Backfilled from stay payment during financial ledger migration.',
    `Stay`.`checkedInAt`
FROM `Stay`
WHERE NOT EXISTS (
    SELECT 1
    FROM `FinancialTransaction`
    WHERE `FinancialTransaction`.`stayId` = `Stay`.`id`
      AND `FinancialTransaction`.`transactionType` = 'ROOM_CHARGE'
);
