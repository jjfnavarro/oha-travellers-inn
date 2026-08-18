-- Correct legacy snapshots using the original room charge, excluding extensions.
UPDATE `Stay` AS `stay`
INNER JOIN (
    SELECT
        `transaction`.`stayId`,
        `transaction`.`amountCentavos`
    FROM `FinancialTransaction` AS `transaction`
    INNER JOIN (
        SELECT `stayId`, MIN(`id`) AS `id`
        FROM `FinancialTransaction`
        WHERE `transactionType` = 'ROOM_CHARGE'
          AND `stayId` IS NOT NULL
        GROUP BY `stayId`
    ) AS `firstRoomCharge`
        ON `firstRoomCharge`.`id` = `transaction`.`id`
) AS `roomCharge`
    ON `roomCharge`.`stayId` = `stay`.`id`
SET `stay`.`rateAmountCentavos` = `roomCharge`.`amountCentavos`;
