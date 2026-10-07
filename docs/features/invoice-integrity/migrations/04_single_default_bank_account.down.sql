-- Reverts 04's index. The default repair is NOT reverted (SAD §7), as in 03.
DROP INDEX IF EXISTS "BankAccount_senderProfileId_isDefault_key";
