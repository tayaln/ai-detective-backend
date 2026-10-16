-- AlterTable
ALTER TABLE "course_positions" ADD COLUMN     "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "course_step_completions" ADD COLUMN     "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill existing rows from the best time already stored, rather than the
-- moment this migration ran.
UPDATE "course_step_completions" SET "created_at" = "completed_at", "updated_at" = "completed_at";
UPDATE "course_positions" SET "created_at" = "updated_at";
UPDATE "profiles" AS p SET "created_at" = u."createdAt" FROM "user" AS u WHERE u."id" = p."learner_id";
