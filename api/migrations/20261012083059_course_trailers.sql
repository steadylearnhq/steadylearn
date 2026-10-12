-- Modify "courses" table
ALTER TABLE "courses" ADD CONSTRAINT "chk_courses_trailer" CHECK (((trailer_url IS NULL) AND (trailer_seconds IS NULL) AND (trailer_poster_url IS NULL)) OR ((trailer_url IS NOT NULL) AND (trailer_seconds IS NOT NULL) AND (trailer_seconds > 0))), ADD COLUMN "trailer_url" text NULL, ADD COLUMN "trailer_seconds" bigint NULL, ADD COLUMN "trailer_poster_url" text NULL;
