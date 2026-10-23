-- A copy of the learner's email on their profile, so profiles read on their own
-- in a database client. "user"."email" remains the source; the application
-- copies it on every profile write.

-- AlterTable: added nullable first, so existing rows can be filled in.
ALTER TABLE "profiles" ADD COLUMN "email" TEXT;

-- Backfill from Better Auth's user table.
UPDATE "profiles" p SET "email" = u."email" FROM "user" u WHERE u."id" = p."learner_id";

-- Every profile belongs to a user, so every row now has an email.
ALTER TABLE "profiles" ALTER COLUMN "email" SET NOT NULL;
