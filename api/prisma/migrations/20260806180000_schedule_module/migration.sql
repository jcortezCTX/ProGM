-- CreateEnum
CREATE TYPE "schedule_entry_mode" AS ENUM ('start_end', 'start_duration');

-- CreateEnum
CREATE TYPE "schedule_activity_day_kind" AS ENUM ('add', 'exclude');

-- CreateTable
CREATE TABLE "schedule_sections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_activities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "section_id" UUID NOT NULL,
    "code" TEXT,
    "description" TEXT NOT NULL,
    "crew" TEXT,
    "responsibility" TEXT,
    "notes" TEXT,
    "budget_mh" DECIMAL,
    "burned_mh" DECIMAL,
    "entry_mode" "schedule_entry_mode" NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "duration_days" INTEGER,
    "night_work" BOOLEAN NOT NULL DEFAULT false,
    "critical_path" BOOLEAN NOT NULL DEFAULT false,
    "shutdown" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_activities_pkey" PRIMARY KEY ("id"),
    -- start_end -> end_date required and >= start_date; start_duration ->
    -- duration_days required and > 0; unscheduled (start_date NULL) rows are
    -- always allowed and skip this check entirely (SCHEDULE_SPEC.md).
    CONSTRAINT "schedule_activities_entry_mode_check" CHECK (
        "start_date" IS NULL
        OR (
            "entry_mode" = 'start_end'
            AND "end_date" IS NOT NULL
            AND "end_date" >= "start_date"
        )
        OR (
            "entry_mode" = 'start_duration'
            AND "duration_days" IS NOT NULL
            AND "duration_days" > 0
        )
    )
);

-- CreateTable
CREATE TABLE "schedule_activity_days" (
    "activity_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "kind" "schedule_activity_day_kind" NOT NULL,
    "crew_count" INTEGER,
    "marker" TEXT,

    CONSTRAINT "schedule_activity_days_pkey" PRIMARY KEY ("activity_id","day"),
    CONSTRAINT "schedule_activity_days_marker_check" CHECK ("marker" IS NULL OR char_length("marker") <= 2)
);

-- CreateTable
CREATE TABLE "schedule_holidays" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "day" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schedule_sections_name_key" ON "schedule_sections"("name");

-- CreateIndex
CREATE INDEX "idx_schedule_activities_section" ON "schedule_activities"("section_id");

-- CreateIndex
CREATE INDEX "idx_schedule_activities_start_date" ON "schedule_activities"("start_date");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_holidays_day_key" ON "schedule_holidays"("day");

-- AddForeignKey
ALTER TABLE "schedule_activities" ADD CONSTRAINT "schedule_activities_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "schedule_sections"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "schedule_activities" ADD CONSTRAINT "schedule_activities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "schedule_activity_days" ADD CONSTRAINT "schedule_activity_days_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "schedule_activities"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
