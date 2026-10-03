-- Modify "subscriptions" table
ALTER TABLE "subscriptions" ADD COLUMN "current_period_start" timestamptz NULL, ADD COLUMN "next_transaction_at" timestamptz NULL, ADD COLUMN "creem_created_at" timestamptz NULL;
