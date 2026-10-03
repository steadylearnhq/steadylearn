-- Create "creem_webhook_events" table
CREATE TABLE "creem_webhook_events" (
  "id" text NOT NULL,
  "event_type" text NOT NULL,
  "occurred_at" timestamptz NOT NULL,
  "processed_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload" jsonb NOT NULL,
  PRIMARY KEY ("id")
);
-- Create "subscriptions" table
CREATE TABLE "subscriptions" (
  "id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" timestamptz NULL,
  "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_id" uuid NOT NULL,
  "creem_subscription_id" text NOT NULL,
  "creem_customer_id" text NOT NULL,
  "creem_product_id" text NOT NULL,
  "status" text NOT NULL,
  "current_period_end" timestamptz NULL,
  "canceled_at" timestamptz NULL,
  "creem_updated_at" timestamptz NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "fk_subscriptions_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "idx_subscriptions_creem_subscription_id" to table: "subscriptions"
CREATE UNIQUE INDEX "idx_subscriptions_creem_subscription_id" ON "subscriptions" ("creem_subscription_id");
-- Create index "idx_subscriptions_user_id" to table: "subscriptions"
CREATE INDEX "idx_subscriptions_user_id" ON "subscriptions" ("user_id");
