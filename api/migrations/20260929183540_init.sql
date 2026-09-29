-- Create "users" table
CREATE TABLE "users" (
  "id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" timestamptz NULL,
  "name" character varying(255) NOT NULL,
  "picture_url" character varying(255) NULL,
  PRIMARY KEY ("id")
);
