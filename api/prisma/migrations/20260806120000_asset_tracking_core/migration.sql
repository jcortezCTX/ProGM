-- Asset Tracking module — core schema (stage 1 per ccowork/asset-tracking-module-spec.md).
--
-- Deliberately not yet included, per direct instruction: per-asset-type JSON
-- Schemas (spec section 4) beyond one placeholder type — real WWTP asset
-- types (valves, pumps, tanks, etc.) will be added later once provided.
--
-- Deviation from spec section 3.5: no separate `asset_attachments` table.
-- This repo already has one polymorphic `attachments` table
-- (entity_type/entity_id) with storage handled by
-- api/src/lib/attachmentStorage.ts (CLAUDE.md rule 4) — asset photos/docs
-- reuse it with entity_type = 'asset', same as every other module.
--
-- Units: US customary throughout (ft, gal, psi, HP), matching the rest of
-- the app (Concrete Log uses CY/PSI) and Garney's WWTP civil drawings.

-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "asset_status" AS ENUM ('planned', 'under_construction', 'active', 'inactive', 'out_of_service', 'abandoned_in_place', 'removed');

-- CreateEnum
CREATE TYPE "asset_source" AS ENUM ('field_gps', 'as_built', 'digitized', 'import');

-- CreateEnum
CREATE TYPE "asset_change_type" AS ENUM ('create', 'update', 'move', 'delete');

-- CreateTable
CREATE TABLE "sites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "boundary" geometry(Polygon, 4326),
    "default_center" geometry(Point, 4326),
    "default_zoom" SMALLINT,
    "timezone" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- image is stored via the same attachmentStorage module as every other
-- upload in the app (api/src/lib/attachmentStorage.ts) — storage_key is
-- the opaque pointer it resolves, matching the `attachments` table.
CREATE TABLE "site_layouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "site_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "image_width_px" INTEGER,
    "image_height_px" INTEGER,
    "bounds" geometry(Polygon, 4326),
    "rotation_deg" DECIMAL NOT NULL DEFAULT 0,
    "opacity" DECIMAL NOT NULL DEFAULT 0.7,
    "z_index" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "revision" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- The registry that drives type-specific fields (CLAUDE.md rule 3 pattern —
-- same idea as log_types.field_schema / inventory_custom_field_defs, applied
-- to asset attributes). attribute_schema is validated against on write by
-- the application layer, not by Postgres.
CREATE TABLE "asset_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "parent_type_id" UUID,
    "allowed_geom_types" TEXT[] NOT NULL,
    "attribute_schema" JSONB NOT NULL DEFAULT '{"type":"object","properties":{}}',
    "ui_schema" JSONB,
    "default_useful_life_years" INTEGER,
    "icon" TEXT,
    "color" TEXT,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_types_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "asset_types_attribute_schema_is_object" CHECK (jsonb_typeof("attribute_schema") = 'object')
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "site_id" UUID NOT NULL,
    "asset_type_id" UUID NOT NULL,
    "parent_id" UUID,
    "tag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "geom" geometry(Geometry, 4326),
    "geom_type" TEXT,
    "centroid_lat" DECIMAL(10,7),
    "centroid_lon" DECIMAL(10,7),
    "elevation_ft" DECIMAL,
    "depth_below_grade_ft" DECIMAL,
    "floor_level" TEXT,
    "layout_id" UUID,
    "status" "asset_status" NOT NULL DEFAULT 'active',
    "condition_rating" SMALLINT,
    "condition_assessed_on" DATE,
    "criticality" SMALLINT,
    "manufacturer" TEXT,
    "model" TEXT,
    "serial_number" TEXT,
    "install_date" DATE,
    "in_service_date" DATE,
    "expected_life_years" INTEGER,
    "replacement_cost" DECIMAL(14,2),
    "acquisition_cost" DECIMAL(14,2),
    "owner_dept" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "source" "asset_source",
    "accuracy_ft" DECIMAL,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assets_attributes_is_object" CHECK (jsonb_typeof("attributes") = 'object'),
    CONSTRAINT "assets_geom_type_check" CHECK ("geom_type" IS NULL OR "geom_type" IN ('Point', 'LineString', 'Polygon', 'MultiPolygon', 'MultiLineString')),
    CONSTRAINT "assets_condition_rating_check" CHECK ("condition_rating" IS NULL OR "condition_rating" BETWEEN 1 AND 5),
    CONSTRAINT "assets_criticality_check" CHECK ("criticality" IS NULL OR "criticality" BETWEEN 1 AND 5)
);

-- CreateTable
-- Append-only audit trail (spec 3.5) — capital asset data feeds financial
-- reporting, so change provenance matters. Written by the service layer.
CREATE TABLE "asset_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL,
    "change_type" "asset_change_type" NOT NULL,
    "field_changes" JSONB NOT NULL,
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sites_code_key" ON "sites"("code");

-- CreateIndex
CREATE INDEX "idx_site_layouts_site" ON "site_layouts"("site_id");

-- CreateIndex
CREATE INDEX "idx_layouts_bounds" ON "site_layouts" USING GIST ("bounds");

-- CreateIndex
CREATE UNIQUE INDEX "asset_types_code_key" ON "asset_types"("code");

-- CreateIndex
CREATE INDEX "idx_asset_types_parent" ON "asset_types"("parent_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "assets_site_id_tag_key" ON "assets"("site_id", "tag");

-- CreateIndex
CREATE INDEX "idx_assets_geom" ON "assets" USING GIST ("geom");

-- CreateIndex
CREATE INDEX "idx_assets_attributes" ON "assets" USING GIN ("attributes" jsonb_path_ops);

-- CreateIndex
CREATE INDEX "idx_assets_site" ON "assets"("site_id") WHERE "deleted_at" IS NULL;

-- CreateIndex
CREATE INDEX "idx_assets_type" ON "assets"("asset_type_id");

-- CreateIndex
CREATE INDEX "idx_assets_parent" ON "assets"("parent_id");

-- CreateIndex
CREATE INDEX "idx_assets_status" ON "assets"("site_id", "status") WHERE "deleted_at" IS NULL;

-- CreateIndex
CREATE INDEX "idx_assets_tag_trgm" ON "assets" USING GIN ("tag" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "idx_asset_history_asset" ON "asset_history"("asset_id");

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "site_layouts" ADD CONSTRAINT "site_layouts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "site_layouts" ADD CONSTRAINT "site_layouts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "asset_types" ADD CONSTRAINT "asset_types_parent_type_id_fkey" FOREIGN KEY ("parent_type_id") REFERENCES "asset_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_asset_type_id_fkey" FOREIGN KEY ("asset_type_id") REFERENCES "asset_types"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_layout_id_fkey" FOREIGN KEY ("layout_id") REFERENCES "site_layouts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "asset_history" ADD CONSTRAINT "asset_history_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "asset_history" ADD CONSTRAINT "asset_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Functions and Triggers
--
-- assets_geom_biu(): on insert/update, derives geom_type + centroid from
-- geom (spec 2.1) and rejects a geometry whose type isn't in the asset
-- type's allowed_geom_types (spec 2.1 + 3.7). This is the one place these
-- derived values are computed, so they can never drift from geom itself —
-- same "derive, don't store-and-hope" spirit as CLAUDE.md rule 1.
CREATE OR REPLACE FUNCTION assets_geom_biu() RETURNS TRIGGER AS $$
DECLARE
    v_allowed TEXT[];
BEGIN
    IF NEW."geom" IS NULL THEN
        NEW."geom_type" := NULL;
        NEW."centroid_lat" := NULL;
        NEW."centroid_lon" := NULL;
        RETURN NEW;
    END IF;

    NEW."geom_type" := substring(ST_GeometryType(NEW."geom") FROM 4);
    NEW."centroid_lat" := ST_Y(ST_Centroid(NEW."geom"));
    NEW."centroid_lon" := ST_X(ST_Centroid(NEW."geom"));

    SELECT "allowed_geom_types" INTO v_allowed FROM "asset_types" WHERE "id" = NEW."asset_type_id";
    IF v_allowed IS NOT NULL AND NOT (NEW."geom_type" = ANY(v_allowed)) THEN
        RAISE EXCEPTION 'geometry type % is not allowed for this asset type (allowed: %)', NEW."geom_type", v_allowed;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assets_geom_biu_trigger
    BEFORE INSERT OR UPDATE OF "geom", "asset_type_id" ON "assets"
    FOR EACH ROW
    EXECUTE FUNCTION assets_geom_biu();

-- assets_prevent_cycle(): rejects a parent_id assignment that would make an
-- asset its own ancestor (spec 2.4 — adjacency list, no closure table).
CREATE OR REPLACE FUNCTION assets_prevent_cycle() RETURNS TRIGGER AS $$
BEGIN
    IF NEW."parent_id" IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW."parent_id" = NEW."id" THEN
        RAISE EXCEPTION 'an asset cannot be its own parent';
    END IF;

    IF EXISTS (
        WITH RECURSIVE ancestors AS (
            SELECT "id", "parent_id" FROM "assets" WHERE "id" = NEW."parent_id"
            UNION ALL
            SELECT a."id", a."parent_id" FROM "assets" a
            JOIN ancestors ON a."id" = ancestors."parent_id"
        )
        SELECT 1 FROM ancestors WHERE "id" = NEW."id"
    ) THEN
        RAISE EXCEPTION 'parent_id assignment would create a cycle in the asset hierarchy';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assets_prevent_cycle_trigger
    BEFORE INSERT OR UPDATE OF "parent_id" ON "assets"
    FOR EACH ROW
    EXECUTE FUNCTION assets_prevent_cycle();
