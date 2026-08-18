-- Allow descriptive room labels such as "Transient 1" without changing existing values.
ALTER TABLE `Room`
    MODIFY `number` VARCHAR(30) NOT NULL;
