-- CreateTable
CREATE TABLE "course_positions" (
    "learner_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "course_positions_pkey" PRIMARY KEY ("learner_id","course_id")
);

-- AddForeignKey
ALTER TABLE "course_positions" ADD CONSTRAINT "course_positions_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
