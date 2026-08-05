-- CreateEnum
CREATE TYPE "task_priority" AS ENUM ('urgent', 'high', 'normal', 'low');

-- CreateEnum
CREATE TYPE "task_assignee_role" AS ENUM ('assignee', 'watcher');

-- AlterEnum
BEGIN;
CREATE TYPE "task_status_new" AS ENUM ('to_do', 'in_progress', 'in_review', 'complete');
ALTER TABLE "public"."tasks" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "tasks" ALTER COLUMN "status" TYPE "task_status_new" USING ("status"::text::"task_status_new");
ALTER TYPE "task_status" RENAME TO "task_status_old";
ALTER TYPE "task_status_new" RENAME TO "task_status";
DROP TYPE "public"."task_status_old";
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'to_do';
COMMIT;

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assignee_id_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_delivery_id_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_drawing_id_fkey";

-- DropIndex
DROP INDEX "idx_tasks_assignee";

-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "assignee_id",
DROP COLUMN "delivery_id",
DROP COLUMN "drawing_id",
ADD COLUMN     "category" TEXT,
ADD COLUMN     "list_id" UUID NOT NULL,
ADD COLUMN     "priority" "task_priority",
ADD COLUMN     "project" TEXT,
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "start_date" DATE,
ALTER COLUMN "status" SET DEFAULT 'to_do',
ALTER COLUMN "due_date" SET DATA TYPE DATE;

-- CreateTable
CREATE TABLE "task_lists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "color" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignees" (
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "task_assignee_role" NOT NULL,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("task_id","user_id","role")
);

-- CreateIndex
CREATE INDEX "idx_task_assignees_user" ON "task_assignees"("user_id");

-- CreateIndex
CREATE INDEX "idx_tasks_list" ON "tasks"("list_id");

-- AddForeignKey
ALTER TABLE "task_lists" ADD CONSTRAINT "task_lists_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "task_lists"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

