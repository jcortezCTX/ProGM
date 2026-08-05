-- CreateTable
CREATE TABLE "concrete_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_number" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "total_est_cy" DECIMAL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concrete_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concrete_mix_designs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "supplier" TEXT NOT NULL,
    "concrete_class" TEXT,
    "mix_type" TEXT,
    "mix_number" TEXT NOT NULL,
    "type_of_work" TEXT,
    "design_strength_psi" INTEGER,
    "slump_range" TEXT,
    "air_range" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concrete_mix_designs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concrete_structures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "est_cy" DECIMAL,
    "est_cost" DECIMAL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concrete_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concrete_pours" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pour_date" DATE NOT NULL,
    "location" TEXT NOT NULL,
    "structure_id" UUID,
    "mix_design_id" UUID,
    "design_strength_psi" INTEGER NOT NULL,
    "yds_required" DECIMAL,
    "yds_delivered" DECIMAL,
    "yds_installed" DECIMAL,
    "is_subcontractor" BOOLEAN NOT NULL DEFAULT false,
    "poured_by" TEXT,
    "invoice_number" TEXT,
    "invoice_total" DECIMAL,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concrete_pours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concrete_samples" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pour_id" UUID NOT NULL,
    "report_number" TEXT,
    "seven_day_psi" DECIMAL,
    "seven_day_entered_on" DATE,
    "twenty_eight_day_psi" DECIMAL,
    "twenty_eight_day_entered_on" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concrete_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pump_truck_rentals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rental_date" DATE NOT NULL,
    "location" TEXT NOT NULL,
    "truck_size_requested" TEXT,
    "truck_size_sent" TEXT,
    "hours" DECIMAL,
    "invoice_number" TEXT,
    "amount" DECIMAL,
    "cubic_yards" DECIMAL,
    "date_approved" DATE,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pump_truck_rentals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concrete_credits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "date_received" DATE NOT NULL,
    "amount" DECIMAL NOT NULL,
    "date_approved" DATE,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concrete_credits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "concrete_mix_designs_supplier_mix_number_key" ON "concrete_mix_designs"("supplier", "mix_number");

-- CreateIndex
CREATE UNIQUE INDEX "concrete_structures_name_key" ON "concrete_structures"("name");

-- CreateIndex
CREATE INDEX "idx_concrete_pours_pour_date" ON "concrete_pours"("pour_date");

-- CreateIndex
CREATE INDEX "idx_concrete_pours_structure" ON "concrete_pours"("structure_id");

-- CreateIndex
CREATE INDEX "idx_concrete_samples_pour" ON "concrete_samples"("pour_id");

-- AddForeignKey
ALTER TABLE "concrete_pours" ADD CONSTRAINT "concrete_pours_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "concrete_pours" ADD CONSTRAINT "concrete_pours_structure_id_fkey" FOREIGN KEY ("structure_id") REFERENCES "concrete_structures"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "concrete_pours" ADD CONSTRAINT "concrete_pours_mix_design_id_fkey" FOREIGN KEY ("mix_design_id") REFERENCES "concrete_mix_designs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "concrete_samples" ADD CONSTRAINT "concrete_samples_pour_id_fkey" FOREIGN KEY ("pour_id") REFERENCES "concrete_pours"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pump_truck_rentals" ADD CONSTRAINT "pump_truck_rentals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "concrete_credits" ADD CONSTRAINT "concrete_credits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
