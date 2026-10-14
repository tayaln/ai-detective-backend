-- DropForeignKey
ALTER TABLE "course_progress" DROP CONSTRAINT "course_progress_learner_id_fkey";

-- DropTable
DROP TABLE "course_progress";

-- CreateTable
CREATE TABLE "course_step_completions" (
    "learner_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "completed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_step_completions_pkey" PRIMARY KEY ("learner_id","course_id","step_id")
);

-- AddForeignKey
ALTER TABLE "course_step_completions" ADD CONSTRAINT "course_step_completions_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
